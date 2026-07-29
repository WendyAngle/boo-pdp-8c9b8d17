import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Eye,
  Send,
  Zap,
  Wand2,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  type SocialTaskPlatform,
} from "@/lib/social-tasks";
import { useSocialAccounts } from "@/data/social-accounts";
import { useCreditBalance, spendCredits } from "@/lib/credits-balance";
import {
  COST_SOCIAL_DM,
  COST_AI_SOCIAL,
  createSocialReachBatch,
} from "@/lib/credits-ledger";

import {
  MESSAGE_VARIABLES,
  renderTemplate,
  myContext,
  type VarContext,
} from "@/lib/message-vars";
import { useLeadProfile } from "@/lib/lead-profile";
import { useCurrentUser } from "@/lib/current-user";
import { generateAiContent } from "@/lib/api/ai-compose.functions";

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

  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<SocialTaskPlatform>("Facebook");
  const [region, setRegion] = useState<string>("美国");
  const [keywords, setKeywords] = useState("");
  const [targetCap, setTargetCap] = useState<number>(30);
  const [content, setContent] = useState("");
  const [previewIdx, setPreviewIdx] = useState(0);

  const [aiUsed, setAiUsed] = useState(false);
  const [aiCount, setAiCount] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [kwLoading, setKwLoading] = useState(false);
  const [targetLang, setTargetLang] = useState<"zh" | "en">("zh");

  useEffect(() => {
    if (!open) return;
    setName("");
    setPlatform("Facebook");
    setRegion("美国");
    setKeywords("");
    setTargetCap(30);
    setContent("");
    setPreviewIdx(0);
    setAiUsed(false);
    setAiCount(0);
    setTargetLang("zh");
  }, [open]);

  const availableAccounts = useMemo(
    () => accounts.filter((a) => a.platform === platform && a.status === "正常"),
    [accounts, platform],
  );
  const dailyCap = availableAccounts.length * DAILY_PER_ACCOUNT;

  const my = useMemo<VarContext>(() => myContext(profile, user), [profile, user]);

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
  const previewContent = previewTarget
    ? renderTemplate(content, {
        企业名: previewTarget.name,
        联系人名: previewTarget.name,
        行业: profile.industries[0],
        城市: region,
        ...my,
      })
    : "";

  const sendCost = targetCap * COST_SOCIAL_DM;
  const aiCost = aiCount * COST_AI_SOCIAL;
  const grandTotal = sendCost + aiCost;
  const hit = SENSITIVE_WORDS.find((w) => content.toLowerCase().includes(w.toLowerCase()));

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
      // 基于企业画像行业 / 产品做本地推荐（免费）
      await new Promise((r) => setTimeout(r, 400));
      const products = profile.mainProducts.slice(0, 4);
      const industries = profile.industries.slice(0, 2);
      const en = ["steel supplier", "building materials", "construction procurement"];
      const merged = Array.from(new Set([...products, ...industries, ...en]));
      setKeywords(merged.join(", "));
      toast.success("已根据企业画像推荐关键词，可手动编辑");
    } finally {
      setKwLoading(false);
    }
  }

  async function handleAiGenerate(params: {
    scene: string;
    tone: "formal" | "friendly" | "concise";
    language: "zh" | "en";
    extra?: string;
  }) {
    if (balance.balance < COST_AI_SOCIAL) {
      toast.error(`积分不足，AI 生成需 ${COST_AI_SOCIAL} 积分`);
      return;
    }
    setAiLoading(true);
    try {
      const res = await callGenerate({
        data: {
          channel: "social",
          platform,
          ...params,
          myCompany: profile.companyName,
          myName: user.name,
          sampleEnterprise: previewTargets[0]?.name,
        },
      });
      spendCredits(COST_AI_SOCIAL);
      setTargetLang(params.language);
      if (res.content) setContent(res.content);
      setAiUsed(true);
      setAiCount((c) => c + 1);
      setAiOpen(false);
      toast.success(`AI 已生成 ${platform} 文案，扣除 ${COST_AI_SOCIAL} 积分`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("AI 生成失败", { description: msg });
    } finally {
      setAiLoading(false);
    }
  }

  const canSubmit =
    !hit &&
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
    if (availableAccounts.length === 0) return toast.error("暂无可用账号，请先在「我的账号」中申请");
    if (balance.balance < sendCost) return toast.error("积分不足");

    const kws = keywords.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    spendCredits(sendCost);
    // 记录落到「触达任务」列表（渠道=社媒，状态=待触达），不再进入社媒触达模块
    createSocialReachBatch({
      taskName: name.trim(),
      platform,
      region,
      keywords: kws,
      count: targetCap,
      content: content.trim(),
      aiGenerated: aiUsed,
      action: "私信",
    });
    toast.success(
      `已创建触达任务，生成 ${targetCap} 条触达记录，共扣 ${grandTotal.toLocaleString()} 积分（发送 ${sendCost} + AI ${aiCost}）`,
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

          {/* 撰写内容 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-2">
                撰写内容
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
                onClick={() => setAiOpen(true)}
                className="h-7 gap-1"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {aiUsed ? "AI 重新生成" : "AI 生成"}
                <span className="text-xs text-muted-foreground">-{COST_AI_SOCIAL} 积分/次</span>
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
              <Label className="text-xs text-muted-foreground">私信内容 *</Label>
              <Textarea
                ref={contentRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                maxLength={4096}
                placeholder={`Hi {联系人名}，我是 {我的公司} 的 {我的姓名}……`}
              />
              <div className="text-[11px] text-muted-foreground">{content.length} / 4096 字</div>
              {hit && (
                <div className="text-xs text-rose-600">
                  命中敏感词 "{hit}"，请修改后再提交（否则将被拦截且不扣分）。
                </div>
              )}
            </div>
          </section>

          {/* 预览 */}
          {previewTargets.length > 0 && content && (
            <section className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  预览（变量已替换，示例目标）
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
            {aiCost > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  AI 生成（{aiCount} 次 × {COST_AI_SOCIAL} 积分）
                </span>
                <span className="font-medium">{aiCost.toLocaleString()} 积分</span>
              </div>
            )}
            <div className="flex justify-between border-t border-rose-200/70 pt-1">
              <span className="font-semibold text-rose-700">合计</span>
              <span className="font-semibold text-rose-700">-{grandTotal.toLocaleString()}</span>
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
            确认（-{grandTotal.toLocaleString()}）
          </Button>
        </DialogFooter>
      </DialogContent>

      <AiComposeMiniDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        loading={aiLoading}
        platform={platform}
        defaultLanguage={targetLang}
        onGenerate={handleAiGenerate}
      />
    </Dialog>
  );
}

function AiComposeMiniDialog({
  open,
  onOpenChange,
  loading,
  platform,
  defaultLanguage = "zh",
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loading: boolean;
  platform: SocialTaskPlatform;
  defaultLanguage?: "zh" | "en";
  onGenerate: (p: {
    scene: string;
    tone: "formal" | "friendly" | "concise";
    language: "zh" | "en";
    extra?: string;
  }) => void;
}) {
  const [scene, setScene] = useState("开发信");
  const [tone, setTone] = useState<"formal" | "friendly" | "concise">("friendly");
  const [language, setLanguage] = useState<"zh" | "en">(defaultLanguage);
  const [extra, setExtra] = useState("");
  useEffect(() => {
    if (open) setLanguage(defaultLanguage);
  }, [open, defaultLanguage]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI 生成 {platform} 文案
          </DialogTitle>
          <DialogDescription className="text-xs">
            生成成功即扣 {COST_AI_SOCIAL} 积分；失败不扣费。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">场景</Label>
            <Select value={scene} onValueChange={setScene}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="开发信">开发信（首次接触）</SelectItem>
                <SelectItem value="跟进">跟进未回复客户</SelectItem>
                <SelectItem value="报价">报价 / 商品推荐</SelectItem>
                <SelectItem value="展会邀请">展会邀请</SelectItem>
                <SelectItem value="节日问候">节日问候</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">语气</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">正式商务</SelectItem>
                  <SelectItem value="friendly">友好诚恳</SelectItem>
                  <SelectItem value="concise">简洁直接</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">目标语言</Label>
              <Select value={language} onValueChange={(v) => setLanguage(v as typeof language)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh">中文</SelectItem>
                  <SelectItem value="en">英文</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">补充要求（可选）</Label>
            <Input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="如：突出报价、请求预约会议等"
              maxLength={200}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button
            disabled={loading}
            onClick={() => onGenerate({ scene, tone, language, extra: extra.trim() || undefined })}
            className={cn("bg-primary", loading && "opacity-80")}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "生成中…" : "生成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
