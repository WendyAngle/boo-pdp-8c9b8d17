import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  text: z.string().min(1).max(4000),
  /** 目标语言全称，如 Thai / English / Chinese (Simplified) */
  targetLanguageName: z.string().min(1).max(40),
  /** 源语言全称（可选，仅作提示） */
  sourceLanguageName: z.string().max(40).optional(),
  /** 语气 */
  tone: z.enum(["formal", "friendly", "concise"]).default("friendly"),
});

const toneMap = {
  formal: "正式商务",
  friendly: "友好诚恳",
  concise: "简洁直接",
} as const;

export const translateMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = [
      `你是一名 B2B 外贸沟通的专业翻译，负责把销售人员写的消息翻译成客户使用的语言。`,
      `目标语言：${data.targetLanguageName}${
        data.sourceLanguageName ? `；源语言（参考）：${data.sourceLanguageName}` : ""
      }。`,
      `要求：语气「${toneMap[data.tone]}」，符合当地商务沟通习惯；保留原文的换行结构；`,
      `保留占位符（如 {企业名} {联系人名} {我的公司} {我的姓名}）原样不译；`,
      `品牌名、型号、单位、链接、邮箱保持原文。`,
      `只输出译文本身，不要解释、不要 Markdown、不要引号包裹、不要附原文。`,
    ].join("\n");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: data.text },
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 429) throw new Error("AI 调用频繁，请稍后再试");
      if (resp.status === 402) throw new Error("AI 额度不足，请联系管理员充值");
      throw new Error(`AI 翻译失败：${resp.status} ${text.slice(0, 200)}`);
    }
    const json = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const content = raw
      .replace(/^\s*```(?:\w+)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim()
      .replace(/^["'`]|["'`]$/g, "");
    return { content };
  });
