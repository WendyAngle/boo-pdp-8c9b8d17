import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Loader2, Send, Zap, Wand2, Languages, Package, X, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

import { LANGUAGES, langByCode } from "@/lib/lang-detect";
import { useLeadProfile, saveProfile } from "@/lib/lead-profile";
import { useCurrentUser } from "@/lib/current-user";
import { ComposeFormatHint } from "@/components/outreach/ComposeFormatHint";
import { useMyInfoGuard } from "@/lib/my-info-guard";
import { generateAiContent } from "@/lib/api/ai-compose.functions";
import { translateMessage } from "@/lib/api/ai-translate.functions";
import {
  recommendProductKeywords,
  type KeywordGroup,
} from "@/lib/api/ai-keywords.functions";
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
  const myInfo = useMyInfoGuard();
  const accounts = useSocialAccounts();
  const balance = useCreditBalance();
  const callGenerate = useServerFn(generateAiContent);
  const callTranslate = useServerFn(translateMessage);
  const callKeywords = useServerFn(recommendProductKeywords);

  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<SocialTaskPlatform>("Facebook");
  const [region, setRegion] = useState<string>("美国");
  const [keywords, setKeywords] = useState("");
  const [targetCap, setTargetCap] = useState<number>(30);
  /** 推广产品（最多 3 个） */
  const [promoProducts, setPromoProducts] = useState<string[]>([]);
  const [customProduct, setCustomProduct] = useState("");
  const [productOpen, setProductOpen] = useState(false);

  /** 中文原文 */
  const [content, setContent] = useState("");
  /** 目标语言译文（实际发送内容） */
  const [translated, setTranslated] = useState("");
  const [targetLang, setTargetLang] = useState<string>("en");

  const [aiUsed, setAiUsed] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [trLoading, setTrLoading] = useState(false);
  const [kwLoading, setKwLoading] = useState(false);
  /** AI 按产品推荐的关键词分组 */
  const [kwGroups, setKwGroups] = useState<KeywordGroup[]>([]);
  /** 译文对应的原文快照，用于提示「原文已修改，需重新翻译」 */
  const [trSource, setTrSource] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setPlatform("Facebook");
    setRegion("美国");
    setKeywords("");
    setKwGroups([]);
    setTargetCap(30);
    setPromoProducts([]);
    setCustomProduct("");
    setProductOpen(false);

    setContent("");
    setTranslated("");
    setTrSource("");
    setTargetLang("en");
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
  

  /** 推广产品候选：企业信息主营产品 + 手动添加项 */
  const productOptions = useMemo(() => {
    const base = profile.mainProducts ?? [];
    return Array.from(new Set([...base, ...promoProducts]));
  }, [profile.mainProducts, promoProducts]);

  const MAX_PROMO = 3;
  function toggleProduct(p: string) {
    setPromoProducts((prev) => {
      if (prev.includes(p)) return prev.filter((x) => x !== p);
      if (prev.length >= MAX_PROMO) {
        toast.error(`最多可选择 ${MAX_PROMO} 个推广产品`);
        return prev;
      }
      return [...prev, p];
    });
  }
  function addCustomProduct() {
    const v = customProduct.trim();
    if (!v) return;
    if (promoProducts.includes(v)) return setCustomProduct("");
    if (promoProducts.length >= MAX_PROMO)
      return toast.error(`最多可选择 ${MAX_PROMO} 个推广产品`);
    setPromoProducts((prev) => [...prev, v]);
    setCustomProduct("");
    // 同步写回「企业信息 - 主营产品」，避免重复维护
    if (!(profile.mainProducts ?? []).includes(v)) {
      saveProfile({ ...profile, mainProducts: [...(profile.mainProducts ?? []), v] });
      toast.success(`已添加「${v}」，并同步到企业信息的主营产品`);
    }
  }



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

  /** 实际发送内容：有译文则发译文 */
  const sendContent = (translated.trim() || content).trim();


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


  /** 按推广产品维度 AI 推荐关键词（每个产品 3-5 个，免费） */
  async function recommendKeywords() {
    if (promoProducts.length === 0) {
      toast.error("请先选择推广产品", {
        description: "关键词将按每个推广产品分别推荐 3-5 个",
      });
      return;
    }
    setKwLoading(true);
    try {
      const res = await callKeywords({
        data: {
          products: promoProducts,
          platform,
          industries: profile.industries.slice(0, 3),
          region,
        },
      });
      const groups = res.groups.filter((g) => g.keywords.length > 0);
      if (groups.length === 0) throw new Error("AI 未返回可用关键词，请重试");
      setKwGroups(groups);
      const merged = Array.from(new Set(groups.flatMap((g) => g.keywords)));
      setKeywords(merged.join(", "));
      toast.success(
        `已按 ${groups.length} 个推广产品推荐 ${merged.length} 个关键词`,
        { description: "可手动编辑，或点击分组内关键词移除" },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("关键词推荐失败", { description: msg });
    } finally {
      setKwLoading(false);
    }
  }

  /** 单一按钮：AI 生成中文首发私信文案（免费） */
  async function handleAiGenerate() {
    if (!myInfo.ensure()) return;
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
          literal: true,
          extra: `${
            promoProducts.length > 0
              ? `本次重点推广产品（必须自然融入文案）：${promoProducts.join("、")}。`
              : ""
          }严格控制篇幅：建议 ${AI_SUGGESTED_CHAR_LEN} 字符长度以内（中文/日文/韩文每字按 2 字符计），绝对不得超过 ${platform} 平台上限 ${charLimit} 字符。`,
        },
      });
      if (res.content) setContent(myInfo.fillAll(res.content));
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
    if (targetCap <= 0) return toast.error("私信目标数量需大于 0");
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
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            新建社媒拓客任务
            <Badge variant="secondary" className="ml-1 font-normal">
              目标 {targetCap} · {platform}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            由系统按推广产品与关键词自动寻找目标账号，加好友并发送私信。
            <br />
            目标来源：系统按关键词自动搜索 · 已有名单？前往「我的收藏」批量社媒私信。
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
              <Label className="text-xs text-muted-foreground">私信目标数量 *</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={targetCap}
                onChange={(e) => setTargetCap(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
              />
            </div>
          </div>

          {/* 推广产品 */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Package className="h-3.5 w-3.5 text-primary" />
                推广产品
                <span className="text-[10px]">
                  （来自企业信息主营产品，可手动添加，最多 {MAX_PROMO} 个）
                </span>
              </Label>
              <span
                className={`text-[10px] tabular-nums ${
                  promoProducts.length >= MAX_PROMO ? "text-amber-600" : "text-muted-foreground"
                }`}
              >
                已选 {promoProducts.length}/{MAX_PROMO}
              </span>
            </div>
            <Popover open={productOpen} onOpenChange={setProductOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-full min-h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-left flex items-center gap-2 hover:border-primary/50 transition-colors"
                >
                  <div className="flex-1 flex flex-wrap gap-1">
                    {promoProducts.length === 0 ? (
                      <span className="text-muted-foreground">
                        选择本次任务重点推广的产品（可选，最多 {MAX_PROMO} 个）
                      </span>
                    ) : (
                      promoProducts.map((p) => (
                        <Badge key={p} variant="secondary" className="font-normal">
                          {p}
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPromoProducts((prev) => prev.filter((x) => x !== p));
                            }}
                            className="ml-1 -mr-0.5 rounded hover:bg-black/10 inline-flex"
                          >
                            <X className="h-3 w-3" />
                          </span>
                        </Badge>
                      ))
                    )}
                  </div>
                  <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <div className="max-h-56 overflow-y-auto py-1">
                  {productOptions.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                      企业信息中暂无主营产品，可在下方手动添加
                    </div>
                  ) : (
                    productOptions.map((p) => {
                      const checked = promoProducts.includes(p);
                      const disabled = !checked && promoProducts.length >= MAX_PROMO;
                      return (
                        <button
                          key={p}
                          type="button"
                          disabled={disabled}
                          onClick={() => toggleProduct(p)}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent/60 ${
                            disabled ? "opacity-50 cursor-not-allowed" : ""
                          }`}
                        >
                          <span className="flex-1">{p}</span>
                          {checked && <Check className="h-3.5 w-3.5 text-primary" />}
                        </button>
                      );
                    })
                  )}
                </div>
                <div className="border-t p-2 flex gap-2">
                  <Input
                    value={customProduct}
                    onChange={(e) => setCustomProduct(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomProduct();
                      }
                    }}
                    placeholder="手动添加产品，回车确认"
                    className="h-8 text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8"
                    onClick={addCustomProduct}
                    disabled={!customProduct.trim() || promoProducts.length >= MAX_PROMO}
                  >
                    添加
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <p className="text-[10px] text-muted-foreground">
              已选产品将用于 AI 文案生成与关键词推荐，聚焦 1-3 个产品转化更佳。
            </p>
          </div>



          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                目标关键词 * <span className="text-[10px]">（英文逗号分隔）</span>
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={recommendKeywords}
                disabled={kwLoading || promoProducts.length === 0}
                title={
                  promoProducts.length === 0
                    ? "请先选择推广产品，AI 将按产品推荐关键词"
                    : undefined
                }
                className="h-7 gap-1"
              >
                {kwLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5 text-primary" />
                )}
                {kwLoading ? "推荐中…" : "AI 推荐"}
              </Button>
            </div>
            <Textarea
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              rows={2}
              placeholder="例如：steel supplier, building materials, 建筑螺纹钢"
            />
            <p className="text-[11px] text-muted-foreground">
              {promoProducts.length === 0
                ? "AI 推荐依据「推广产品」，请先选择产品；每个产品推荐 3-5 个关键词。"
                : `将为已选的 ${promoProducts.length} 个推广产品各推荐 3-5 个关键词。`}
            </p>

            {kwGroups.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-2.5 space-y-2">
                <div className="text-[11px] font-medium text-muted-foreground">
                  按推广产品推荐（点击关键词可从上方输入框移除）
                </div>
                {kwGroups.map((g) => (
                  <div key={g.product} className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium">
                      <Package className="h-3 w-3 text-primary" />
                      {g.product}
                      <span className="text-muted-foreground font-normal">
                        · {g.keywords.length} 个
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {g.keywords.map((k) => {
                        const list = keywords
                          .split(/[,，]/)
                          .map((s) => s.trim())
                          .filter(Boolean);
                        const active = list.includes(k);
                        return (
                          <button
                            key={`${g.product}-${k}`}
                            type="button"
                            onClick={() =>
                              setKeywords(
                                (active
                                  ? list.filter((x) => x !== k)
                                  : [...list, k]
                                ).join(", "),
                              )
                            }
                          >
                            <Badge
                              variant={active ? "secondary" : "outline"}
                              className="cursor-pointer text-[11px] font-normal"
                            >
                              {k}
                            </Badge>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>


          {/* 可用账号 */}
          <div className="rounded-md border bg-muted/30 px-3 py-2 flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">可用账号</span>
            <span className="font-semibold text-foreground tabular-nums">
              {availableAccounts.length}
            </span>
            <span className="text-muted-foreground">
              · 单账号 {DAILY_PER_ACCOUNT} 个/天
            </span>
            {availableAccounts.length === 0 && (
              <span className="ml-auto text-rose-600">
                暂无可用账号，请先在「我的账号」中申请
              </span>
            )}
          </div>

          {/* 撰写内容：中文原文 → 目标语言译文（一体区域） */}
          <section className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-2">
                私信内容
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

            <ComposeFormatHint channel="social" platform={platform} />

            <div className="grid gap-0 lg:grid-cols-2 lg:divide-x rounded-md border overflow-hidden">
              {/* 左：中文原文 */}
              <div className="space-y-2 p-3">
                <div className="flex h-8 items-center">
                  <Label className="text-xs text-muted-foreground">中文原文</Label>
                </div>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={10}
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
                    中/日/韩字符按 2 计
                  </span>
                </div>
              </div>

              {/* 右：目标语言译文（实际发送内容） */}
              <div className="space-y-2 bg-primary/[0.03] p-3">
                <div className="flex h-8 items-center justify-between gap-2">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Languages className="h-3.5 w-3.5 text-primary" />
                    实际发送内容
                  </Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={targetLang}
                      onValueChange={(v) => {
                        setTargetLang(v);
                        if (content.trim()) void handleTranslate(v);
                      }}
                    >
                      <SelectTrigger className="h-8 w-[140px] text-xs">
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
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={translated}
                  onChange={(e) => setTranslated(e.target.value)}
                  rows={10}
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
                    <span className="text-amber-600">原文已修改，建议重新翻译</span>
                  )}
                </div>
              </div>
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
