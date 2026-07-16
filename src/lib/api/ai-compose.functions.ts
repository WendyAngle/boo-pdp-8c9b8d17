import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  channel: z.enum(["email", "sms", "social"]),
  platform: z.string().max(20).optional(),
  scene: z.string().min(1).max(40),
  tone: z.enum(["formal", "friendly", "concise"]).default("friendly"),
  language: z.enum(["zh", "en"]).default("zh"),
  extra: z.string().max(500).optional(),
  /** 我方公司 / 个人 信息（供 system prompt 参考） */
  myCompany: z.string().max(120).optional(),
  myName: z.string().max(40).optional(),
  /** 示例收件方（用于让模型知道占位符的语义） */
  sampleEnterprise: z.string().max(120).optional(),
});

export const generateAiContent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY is not configured");

    const isEmail = data.channel === "email";
    const isSocial = data.channel === "social";
    const platform = data.platform || "WhatsApp";
    const langName = data.language === "zh" ? "中文" : "English";
    const toneMap = { formal: "正式商务", friendly: "友好诚恳", concise: "简洁直接" } as const;

    const systemPrompt = [
      `你是一名资深 B2B 外贸出海销售文案专家，正在为「${data.myCompany ?? "我方公司"}」撰写${
        isEmail ? "开发/跟进邮件" : isSocial ? `${platform} 私信` : "营销短信"
      }。`,
      `语言: ${langName}；语气: ${toneMap[data.tone]}。`,
      `在文案中合理使用以下占位符（保留花括号原样，发送时会被替换）：`,
      `{企业名} {联系人名} {行业} {城市} {我的公司} {我的姓名}`,
      isEmail
        ? `严格输出 JSON：{"subject": "邮件主题（≤60字）","content": "邮件正文（纯文本，含换行）"}。不要解释，不要 Markdown。`
        : isSocial
          ? `只输出 ${platform} 私信正文本身，${data.language === "zh" ? "≤500 字" : "≤1200 chars"}，语气自然口语化，可含 1-2 个 emoji，不含签名和链接。不要 JSON，不要 Markdown，不要解释，不要引号包裹。`
          : `只输出短信正文本身，${data.language === "zh" ? "≤140 字" : "≤300 chars"}，不含署名和退订。不要 JSON，不要 Markdown，不要解释，不要引号包裹。`,
    ].join("\n");

    const userPrompt = [
      `场景: ${data.scene}`,
      data.extra ? `补充要求: ${data.extra}` : "",
      data.sampleEnterprise ? `示例目标客户: ${data.sampleEnterprise}` : "",
      data.myName ? `落款署名: ${data.myName}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        ...(isEmail ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 429) throw new Error("AI 调用频繁，请稍后再试");
      if (resp.status === 402) throw new Error("AI 额度不足，请联系管理员充值");
      throw new Error(`AI 生成失败：${resp.status} ${text.slice(0, 200)}`);
    }
    const json = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "";
    if (isEmail) {
      const parsed = extractJson(raw);
      return {
        subject: parsed.subject ?? "",
        content: parsed.content ?? stripFences(raw),
      };
    }
    return {
      subject: undefined,
      content: stripFences(raw).trim().replace(/^["'`]|["'`]$/g, ""),
    };
  });

function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:json|text)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function extractJson(raw: string): { subject?: string; content?: string } {
  const s = stripFences(raw);
  try {
    return JSON.parse(s);
  } catch {}
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {}
  }
  const subj = s.match(/"subject"\s*:\s*"([^"]*)"/);
  const cont = s.match(/"content"\s*:\s*"([\s\S]*?)"\s*[},]/);
  if (subj || cont) {
    return {
      subject: subj?.[1],
      content: cont?.[1]?.replace(/\\n/g, "\n"),
    };
  }
  return {};
}