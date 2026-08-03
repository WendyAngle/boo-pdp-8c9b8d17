import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Loader2, Eye, Send, Zap, Wand2, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type SocialTaskPlatform } from "@/lib/social-tasks";
import { useSocialAccounts } from "@/data/social-accounts";
import { useCreditBalance, spendCredits } from "@/lib/credits-balance";
import { COST_SOCIAL_DM, createSocialReachBatch } from "@/lib/credits-ledger";

import {
  MESSAGE_VARIABLES,
  renderTemplate,
  myContext,
  type VarContext,
} from "@/lib/message-vars";
import { LANGUAGES, langByCode } from "@/lib/lang-detect";
import { useLeadProfile } from "@/lib/lead-profile";
import { useCurrentUser } from "@/lib/current-user";
import { generateAiContent } from "@/lib/api/ai-compose.functions";
import { translateMessage } from "@/lib/api/ai-translate.functions";
import {
  AI_SUGGESTED_CHAR_LEN,
  charLength,
  platformCharLimit,
} from "@/lib/text-length";

const REGIONS = [
  "美国",
  "日本",
  "新加坡",
  "印度尼西亚",
  "中国",
  "马来西亚",
  "韩国",
  "泰国",
  "越南",
  "菲律宾",
  "英国",
  "德国",
  "法国",
  "加拿大",
  "澳大利亚",
  "巴西",
  "印度",
  "墨西哥",
  "其他",
] as const;

/** 目标语言（发送语言）候选：排除中文，中文为原文 */
const TARGET_LANGS = LANGUAGES.filter((l) => l.code !== "zh");

/** 地区 → 默认目标语言 */
const REGION_LANG: Record<string, string> = {
  美国: "en",
  英国: "en",
  加拿大: "en",
  澳大利亚: "en",
  新加坡: "en",
  印度: "en",
  日本: "ja",
  韩国: "ko",
  泰国: "th",
  越南: "vi",
  印度尼西亚: "id",
  马来西亚: "ms",
  菲律宾: "en",
  德国: "de",
  法国: "fr",
  巴西: "pt",
  墨西哥: "es",
};

const SENSITIVE_WORDS = ["赌博", "色情", "毒品", "洗钱", "枪支", "porn", "casino"];
const DAILY_PER_ACCOUNT = 5;

export function CreateReachTaskDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const profile = useLeadProfile();
  const user = useCurrentUser();
  const accounts = useSocialAccounts();
  const balance = useCreditBalance();
  const callGenerate = useServerFn(generateAiContent);
  const callTranslate = useServerFn(translateMessage);

  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<SocialTaskPlatform>("Facebook");
  const [region, setRegion] = useState<string>("美国");
  const [keywords, setKeywords] = useState("");
  const [targetCap, setTargetCap] = useState<number>(30);
  /** 中文原文 */
  const [content, setContent] = useState("");
  /** 目标语言译文（实际发送内容） */
  const [translated, setTranslated] = useState("");
  const [targetLang, setTargetLang] = useState<string>("en");
  const [previewIdx, setPreviewIdx] = useState(0);

  const [aiUsed, setAiUsed] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [trLoading, setTrLoading] = useState(false);
  const [kwLoading, setKwLoading] = useState(false);
  /** 译文对应的原文快照，用于提示「原文已修改，需重新翻译」 */
  const [trSource, setTrSource] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setPlatform("Facebook");
    setRegion("美国");
    setKeywords("");
    setTargetCap(30);
    setContent("");
    setTranslated("");
    setTrSource("");
    setTargetLang("en");
    setPreviewIdx(0);
    setAiUsed(false);
  }, [open]);

  // 地区变化时同步推荐目标语言（仅在尚未翻译时）
  useEffect(() => {
    if (!open) return;
    const l = REGION_LANG[region];
    if (l && !translated) setTargetLang(l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, open]);

  const availableAccounts = useMemo(
    () => accounts.filter((a) => a.platform === platform && a.status === "正常"),
    [accounts, platform],
  );
  const dailyCap = availableAccounts.length * DAILY_PER_ACCOUNT;

  const my = useMemo<VarContext>(() => myContext(profile, user), [profile, user]);
  const targetLangOpt = langByCode(targetLang);

  // 预览：模拟 3 个虚拟目标（关键词/地区尚未真实抓取）
  const previewTargets = useMemo(() => {
    const kws = keywords
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const base = kws.length > 0 ? kws : ["Target Buyer"];
    return Array.from({ length: Math.min(3, Math.max(1, base.length)) }).map(
      (_, i) => ({
        name: `${region} · ${base[i % base.length]} 潜客 ${i + 1}`,
        handle: `@lead_${i + 1}`,
      }),
    );
  }, [keywords, region]);

  const previewTarget =
    previewTargets[Math.min(previewIdx, previewTargets.length - 1)];
  /** 实际发送内容：有译文则发译文 */
  const sendContent = (translated.trim() || content).trim();
  const previewContent = previewTarget
    ? renderTemplate(sendContent, {
        企业名: previewTarget.name,
        联系人名: previewTarget.name,
        行业: profile.industries[0],
        城市: region,
        ...my,
      })
    : "";

  const sendCost = targetCap * COST_SOCIAL_DM;
  const hit = SENSITIVE_WORDS.find((w) =>
    `${content} ${translated}`.toLowerCase().includes(w.toLowerCase()),
  );
  const staleTranslation =
    !!translated.trim() && trSource.trim() !== content.trim();

  /** 平台字数限制：中/日/韩字符按 2 计 */
  const charLimit = platformCharLimit(platform);
  const contentLen = charLength(content);
  const translatedLen = charLength(translated);
  const sendLen = charLength(sendContent);
  const overLimit = sendLen > charLimit;


  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  function insertVarAt(v: string) {
    const token = `{${v}}`;
    const el = contentRef.current;
    const s = content;
    if (!el) return setContent(s + token);
    const start = el.selectionStart ?? s.length;
    const end = el.selectionEnd ?? s.length;
    setContent(s.slice(0, start) + token + s.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function recommendKeywords() {
    setKwLoading(true);
    try {
      // 基于企业信息行业 / 产品做本地推荐（免费）
      await new Promise((r) => setTimeout(r, 400));
      const products = profile.mainProducts.slice(0, 4);
      const industries = profile.industries.slice(0, 2);
      const en = ["steel supplier", "building materials", "construction procurement"];
      const merged = Array.from(new Set([...products, ...industries, ...en]));
      setKeywords(merged.join(", "));
      toast.success("已根据企业信息推荐关键词，可手动编辑");
    } finally {
      setKwLoading(false);
    }
  }

  /** 单一按钮：AI 生成中文首发私信文案（免费） */
  async function handleAiGenerate() {
    setAiLoading(true);
    try {
      const res = await callGenerate({
        data: {
          channel: "social",
          platform,
          scene: "开发信",
          tone: "friendly",
          language: "zh",
          languageName: "中文",
          myCompany: profile.companyName,
          myName: user.name,
          sampleEnterprise: previewTargets[0]?.name,
          extra: `严格控制篇幅：建议 ${AI_SUGGESTED_CHAR_LEN} 字符长度以内（中文/日文/韩文每字按 2 字符计），绝对不得超过 ${platform} 平台上限 ${charLimit} 字符。`,
        },
      });
      if (res.content) setContent(res.content);
      setAiUsed(true);
      toast.success("AI 已生成中文私信文案（免费），可直接修改");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("AI 生成失败", { description: msg });
    } finally {
      setAiLoading(false);
    }
  }

  /** 翻译为目标语言（免费） */
  async function handleTranslate(code = targetLang) {
    const src = content.trim();
    if (!src) return toast.error("请先生成或输入中文私信内容");
    const opt = langByCode(code);
    if (!opt) return;
    setTrLoading(true);
    try {
      const res = await callTranslate({
        data: {
          text: src,
          targetLanguageName: opt.en,
          sourceLanguageName: "Chinese (Simplified)",
          tone: "friendly",
        },
      });
      setTranslated(res.content ?? "");
      setTrSource(src);
      toast.success(`已翻译为${opt.zh}（免费）`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("翻译失败", { description: msg });
    } finally {
      setTrLoading(false);
    }
  }

  const canSubmit =
    !hit &&
    !overLimit &&
    !!name.trim() &&
    content.trim().length > 0 &&
    keywords.trim().length > 0 &&
    targetCap > 0 &&
    availableAccounts.length > 0 &&
    balance.balance >= sendCost;

  function handleConfirm() {
    if (!name.trim()) return toast.error("请填写任务名");
    if (!keywords.trim()) return toast.error("请填写目标关键词");
    if (targetCap <= 0) return toast.error("目标数量上限需大于 0");
    if (!content.trim()) return toast.error("请填写私信内容");
    if (overLimit)
      return toast.error(
        `发送内容 ${sendLen} 字符，超出 ${platform} 上限 ${charLimit} 字符`,
      );
    if (availableAccounts.length === 0)
      return toast.error("暂无可用账号，请先在「我的账号」中申请");
    if (balance.balance < sendCost) return toast.error("积分不足");

    const kws = keywords.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    spendCredits(sendCost);
    // 记录落到「触达任务」列表（渠道=社媒），实际发送内容为译文（无译文则中文原文）
    createSocialReachBatch({
      taskName: name.trim(),
      platform,
      region,
      keywords: kws,
      count: targetCap,
      content: sendContent,
      aiGenerated: aiUsed,
      action: "私信",
    });
    toast.success(
      `已创建触达任务，生成 ${targetCap} 条触达记录，共扣 ${sendCost.toLocaleString()} 积分（AI 生成与翻译免费）`,
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            新建触达任务
            <Badge variant="secondary" className="ml-1 font-normal">
              目标 {targetCap} · {platform}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            关键词加友 → 好友沉淀 → 私信触达，一键批量启动。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">任务名 *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：北美建材采购商首轮触达"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">平台 *</Label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as SocialTaskPlatform)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Facebook">Facebook</SelectItem>
                  <SelectItem value="TikTok">TikTok</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">目标地区 *</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  {REGIONS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">目标数量上限 *</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={targetCap}
                onChange={(e) => setTargetCap(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                目标关键词 * <span className="text-[10px]">（英文逗号分隔）</span>
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={recommendKeywords}
                disabled={kwLoading}
                className="h-7 gap-1"
              >
                {kwLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5 text-primary" />
                )}
                AI 推荐
              </Button>
            </div>
            <Textarea
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              rows={2}
              placeholder="例如：steel supplier, building materials, 建筑螺纹钢"
            />
          </div>

          {/* 可用账号 */}
          <div className="rounded-md border bg-muted/30 px-3 py-2 flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">可用账号</span>
            <span className="font-semibold text-foreground tabular-nums">
              {availableAccounts.length}
            </span>
            <span className="text-muted-foreground">
              · 单账号 {DAILY_PER_ACCOUNT} 个/天 · 今日加友上限{" "}
              <span className="font-medium text-foreground tabular-nums">{dailyCap}</span>
            </span>
            {availableAccounts.length === 0 && (
              <span className="ml-auto text-rose-600">
                暂无可用账号，请先在「我的账号」中申请
              </span>
            )}
          </div>

          {/* 撰写内容：中文原文 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-2">
                私信内容（中文原文）
                {aiUsed && (
                  <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-800">
                    <Sparkles className="h-3 w-3" />
                    AI 已生成 · 可手动调整
                  </Badge>
                )}
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAiGenerate}
                disabled={aiLoading}
                className="h-7 gap-1"
              >
                {aiLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                )}
                {aiLoading ? "生成中…" : aiUsed ? "AI 重新生成" : "AI 生成私信内容"}
                <span className="text-[11px] text-emerald-600">免费</span>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">插入变量：</span>
              {MESSAGE_VARIABLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVarAt(v)}
                  className="rounded border bg-background px-1.5 py-0.5 text-[11px] font-mono text-primary hover:bg-primary/10"
                >
                  {`{${v}}`}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <Textarea
                ref={contentRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                placeholder={`Hi {联系人名}，我是 {我的公司} 的 {我的姓名}……（AI 生成默认为首发开发信）`}
              />
              <div className="flex items-center justify-between text-[11px]">
                <span
                  className={
                    contentLen > charLimit ? "text-rose-600" : "text-muted-foreground"
                  }
                >
                  {contentLen} / {charLimit} 字符（{platform}）
                </span>
                <span className="text-muted-foreground">
                  中/日/韩字符按 2 计 · AI 生成建议 {AI_SUGGESTED_CHAR_LEN} 字符内
                </span>
              </div>
            </div>
          </section>


          {/* 目标语言译文（实际发送内容） */}
          <section className="space-y-2 rounded-md border border-primary/25 bg-primary/[0.03] p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Languages className="h-4 w-4 text-primary" />
                目标语言文案
                <Badge variant="outline" className="font-normal text-[10px]">
                  实际发送内容
                </Badge>
              </Label>
              <div className="flex items-center gap-2">
                <Select
                  value={targetLang}
                  onValueChange={(v) => {
                    setTargetLang(v);
                    if (content.trim()) void handleTranslate(v);
                  }}
                >
                  <SelectTrigger className="h-8 w-[150px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[280px]">
                    {TARGET_LANGS.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.flag} {l.zh}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1"
                  disabled={trLoading || !content.trim()}
                  onClick={() => void handleTranslate()}
                >
                  {trLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Languages className="h-3.5 w-3.5 text-primary" />
                  )}
                  {translated ? "重新翻译" : "翻译"}
                  <span className="text-[11px] text-emerald-600">免费</span>
                </Button>
              </div>
            </div>

            <Textarea
              value={translated}
              onChange={(e) => setTranslated(e.target.value)}
              rows={6}
              placeholder={`选择目标语言后点击「翻译」，此处展示 ${
                targetLangOpt?.zh ?? "目标语言"
              }文案，可手动修改`}
            />
            <div className="flex items-center justify-between text-[11px]">
              <span
                className={
                  translatedLen > charLimit ? "text-rose-600" : "text-muted-foreground"
                }
              >
                {translated
                  ? `将以${targetLangOpt?.zh ?? ""}发送 · ${translatedLen} / ${charLimit} 字符`
                  : "未翻译时，将直接发送中文原文"}
              </span>
              {staleTranslation && (
                <span className="text-amber-600">中文原文已修改，建议重新翻译</span>
              )}
            </div>
          </section>

          {overLimit && (
            <div className="text-xs text-rose-600">
              实际发送内容 {sendLen} 字符，超出 {platform} 平台上限 {charLimit} 字符
              （中/日/韩字符按 2 计），请精简后再提交。
            </div>
          )}

          {hit && (
            <div className="text-xs text-rose-600">
              命中敏感词 "{hit}"，请修改后再提交（否则将被拦截且不扣分）。
            </div>
          )}


          {/* 预览 */}
          {previewTargets.length > 0 && sendContent && (
            <section className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  发送预览（变量已替换，示例目标）
                </Label>
                {previewTargets.length > 1 && (
                  <Select value={String(previewIdx)} onValueChange={(v) => setPreviewIdx(Number(v))}>
                    <SelectTrigger className="h-7 w-[240px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {previewTargets.map((r, i) => (
                        <SelectItem key={`${r.handle}-${i}`} value={String(i)}>
                          第 {i + 1} 条 · {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="text-xs whitespace-pre-wrap text-foreground/90 max-h-40 overflow-y-auto">
                {previewContent || <span className="text-muted-foreground">（暂无内容）</span>}
              </div>
            </section>
          )}

          {/* 消耗积分 */}
          <section className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                发送费用（{targetCap} 条 × {COST_SOCIAL_DM} 积分）
              </span>
              <span className="font-medium">{sendCost.toLocaleString()} 积分</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">AI 生成 / 翻译</span>
              <span className="font-medium text-emerald-600">免费</span>
            </div>
            <div className="flex justify-between border-t border-rose-200/70 pt-1">
              <span className="font-semibold text-rose-700">合计</span>
              <span className="font-semibold text-rose-700">-{sendCost.toLocaleString()}</span>
            </div>
            {balance.balance < sendCost && (
              <div className="text-[11px] text-rose-700/90 pt-0.5">
                当前余额 {balance.balance.toLocaleString()}，尚缺{" "}
                {(sendCost - balance.balance).toLocaleString()} 积分。
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button disabled={!canSubmit} onClick={handleConfirm}>
            <Send className="h-4 w-4" />
            确认（-{sendCost.toLocaleString()}）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
