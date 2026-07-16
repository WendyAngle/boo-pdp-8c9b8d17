import { useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  Sparkles,
  Loader2,
  Eye,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  ShieldAlert,
  MessageCircle,
  ServerCog,
  Info,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  MESSAGE_VARIABLES,
  renderTemplate,
  myContext,
  type Recipient,
} from "@/lib/message-vars";
import {
  createReach,
  chargeAiGeneration,
  costForSocialPlatform,
  COST_AI_SOCIAL,
  COST_VIEW_PHONE,
  COST_VIEW_SOCIAL,
  computeReachBreakdown,
  performReachAutoUnlocks,
  useLedger,
  type AutoUnlockField,
} from "@/lib/credits-ledger";
import { MaskedField } from "@/components/MaskedField";
import {
  useSocialAccounts,
  poolRemaining,
  poolCapacity,
  dispatchSend,
  type SocialPlatform,
} from "@/data/social-accounts";
import {
  useWaVerifyVersion,
  verifyMany,
  getWaStatus,
  normalizePhone,
  type WaStatus,
} from "@/lib/wa-verify";
import { useLeadProfile } from "@/lib/lead-profile";
import { useCurrentUser } from "@/lib/current-user";
import { generateAiContent } from "@/lib/api/ai-compose.functions";

/** 目标候选人（收藏 → 社媒收件人） */
export interface SocialCandidate extends Recipient {
  /** 用于查库/校验的企业 id（联系人时也回填其所属企业 id） */
  enterpriseId?: string;
}

export interface BatchSocialDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  platform: SocialPlatform;
  candidates: SocialCandidate[];
}

function LangToggle({
  value,
  onChange,
}: {
  value: "zh" | "en";
  onChange: (v: "zh" | "en") => void;
}) {
  return (
    <div className="inline-flex items-center rounded-md border bg-background p-0.5 text-xs">
      <span className="px-1.5 text-[10px] text-muted-foreground">目标语言</span>
      {(["zh", "en"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "rounded px-2 py-0.5 transition-colors",
            value === v
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {v === "zh" ? "中文" : "英文"}
        </button>
      ))}
    </div>
  );
}

export function BatchSocialDialog({
  open,
  onOpenChange,
  platform,
  candidates: incoming,
}: BatchSocialDialogProps) {
  const accounts = useSocialAccounts();
  useWaVerifyVersion(); // 订阅校验状态变化
  const profile = useLeadProfile();
  const user = useCurrentUser();
  const callGenerate = useServerFn(generateAiContent);
  const ledger = useLedger();

  const [candidates, setCandidates] = useState<SocialCandidate[]>(incoming);
  const [content, setContent] = useState("");
  const [aiUsed, setAiUsed] = useState(false);
  const [aiCount, setAiCount] = useState(0);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [targetLang, setTargetLang] = useState<"zh" | "en">("zh");

  useEffect(() => {
    if (!open) return;
    setCandidates(incoming);
    setContent("");
    setAiUsed(false);
    setAiCount(0);
    setPreviewIdx(0);
    setTargetLang("zh");
    // 打开即自动校验（跳过已缓存）
    void verifyMany(
      incoming
        .filter((c) => c.address)
        .map((c) => ({ phone: c.address, enterpriseId: c.enterpriseId })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 按四桶分类
  type Bucket = "no_number" | "unchecked" | "checking" | "verified" | "unregistered";
  const bucketed = useMemo(() => {
    const groups: Record<Bucket, SocialCandidate[]> = {
      no_number: [],
      unchecked: [],
      checking: [],
      verified: [],
      unregistered: [],
    };
    for (const c of candidates) {
      if (!normalizePhone(c.address)) {
        groups.no_number.push(c);
        continue;
      }
      const s: WaStatus = getWaStatus(c.address);
      if (s === "verified") groups.verified.push(c);
      else if (s === "unregistered") groups.unregistered.push(c);
      else if (s === "checking") groups.checking.push(c);
      else groups.unchecked.push(c);
    }
    return groups;
  }, [candidates]);

  const verified = bucketed.verified;
  const totalCount = candidates.length;
  const validCount = verified.length;

  // 池信息
  const remaining = poolRemaining(accounts, platform);
  const capacity = poolCapacity(accounts, platform);
  const overLimit = validCount > remaining;
  const sendableCount = Math.min(validCount, remaining);

  // 费用
  const unit = costForSocialPlatform(platform);
  const sendTotal = sendableCount * unit;
  // 未解锁字段的自动查看费合计
  const viewCostTotal = useMemo(() => {
    let total = 0;
    for (const r of verified.slice(0, sendableCount)) {
      const bd = computeReachBreakdown(
        { targetKind: r.targetKind, targetId: r.targetId },
        "social",
        platform,
        { reachCostOverride: 0 },
      );
      total += bd.viewCost;
    }
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified, sendableCount, platform, ledger]);
  const aiCost = aiCount * COST_AI_SOCIAL;
  const grandTotal = sendTotal + viewCostTotal + aiCost;

  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  function insertVarAt(v: string) {
    const token = `{${v}}`;
    const el = contentRef.current;
    const s = content;
    if (!el) return setContent(s + token);
    const start = el.selectionStart ?? s.length;
    const end = el.selectionEnd ?? s.length;
    const next = s.slice(0, start) + token + s.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  const previewRecipient = verified[Math.min(previewIdx, Math.max(0, verified.length - 1))];
  const previewContent = previewRecipient
    ? renderTemplate(content, previewRecipient.ctx)
    : "";

  const noPool = capacity === 0;
  const canSend =
    validCount > 0 &&
    remaining > 0 &&
    !overLimit &&
    content.trim().length > 0 &&
    !noPool;

  function handleRemoveNonVerified() {
    setCandidates((prev) =>
      prev.filter((c) => getWaStatus(c.address) === "verified"),
    );
  }
  function handleTrimToRemaining() {
    // 只在有效收件人里裁剪
    const keep = new Set(verified.slice(0, remaining).map((c) => c.key));
    setCandidates((prev) =>
      prev.filter(
        (c) => keep.has(c.key) || getWaStatus(c.address) !== "verified",
      ),
    );
  }
  function handleReverify() {
    void verifyMany(
      candidates
        .filter((c) => c.address)
        .map((c) => ({ phone: c.address, enterpriseId: c.enterpriseId })),
      { force: true },
    );
  }

  function handleSend() {
    if (!canSend) return;
    // 后台调度分派
    const dispatched = dispatchSend(platform, sendableCount);
    if (dispatched === 0) {
      toast.error("系统池今日额度已用尽，请明日再试");
      return;
    }
    let n = 0;
    for (const r of verified.slice(0, dispatched)) {
      const finalContent = renderTemplate(content, r.ctx);
      // 触达 WhatsApp 自动解锁电话；其他社媒解锁 social:platform
      const fields: AutoUnlockField[] =
        platform === "WhatsApp"
          ? [{ field: "phone" }]
          : [{ field: "social", subKey: platform }];
      performReachAutoUnlocks({
        targetKind: r.targetKind,
        targetId: r.targetId,
        targetName: r.name,
        parentRef: r.parentRef,
        detail: r.address,
        fields,
      });
      createReach({
        targetKind: r.targetKind,
        targetId: r.targetId,
        targetName: r.name,
        parentRef: r.parentRef,
        channel: "social",
        platform,
        detail: r.address,
        content: finalContent,
        aiGenerated: aiUsed,
        cost: unit,
      });
      n++;
    }
    onOpenChange(false);
    toast.success(`已加入触达队列：${n} 条 ${platform} 私信`, {
      description: `共扣除 ${grandTotal} 积分${
        viewCostTotal > 0 ? `（含自动解锁查看 ${viewCostTotal} 积分）` : ""
      }${
        aiCost > 0 ? `（含 AI 文案 ${aiCost} 积分）` : ""
      }，可在「触达」模块查看进度`,
    });
  }

  async function handleAiGenerate(params: {
    scene: string;
    tone: "formal" | "friendly" | "concise";
    language: "zh" | "en";
    extra?: string;
  }) {
    setAiLoading(true);
    try {
      const sample = verified[0] ?? candidates[0];
      const res = await callGenerate({
        data: {
          channel: "social",
          platform,
          ...params,
          myCompany: profile.companyName,
          myName: user.name,
          sampleEnterprise: sample?.ctx.企业名,
        },
      });
      chargeAiGeneration({
        channel: "social",
        targetName: sample?.name ?? "AI 生成",
      });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-emerald-600" />
            {`${platform} 系统自动触达`}
            <Badge variant="secondary" className="ml-1 font-normal">
              {totalCount <= 1
                ? `${validCount > 0 ? "可发送" : "校验中"}`
                : `选中 ${totalCount} · 有效 ${validCount}`}
            </Badge>
          </DialogTitle>
          <DialogDescription className="sr-only">
            {platform} 私信触达
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* 覆盖率四桶 */}
          <section className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">收件人覆盖率</Label>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1"
                  onClick={handleReverify}
                >
                  <RefreshCw className="h-3 w-3" />
                  重新校验
                </Button>
                {(bucketed.no_number.length > 0 || bucketed.unregistered.length > 0) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1"
                    onClick={handleRemoveNonVerified}
                  >
                    <X className="h-3 w-3" />
                    仅保留有效
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <StatCell
                tone="emerald"
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                label="已注册"
                value={bucketed.verified.length}
              />
              <StatCell
                tone="rose"
                icon={<XCircle className="h-3.5 w-3.5" />}
                label="未注册"
                value={bucketed.unregistered.length}
              />
              <StatCell
                tone="amber"
                icon={
                  bucketed.checking.length > 0 ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Clock className="h-3.5 w-3.5" />
                  )
                }
                label="待校验"
                value={bucketed.checking.length + bucketed.unchecked.length}
              />
              <StatCell
                tone="slate"
                icon={<ShieldAlert className="h-3.5 w-3.5" />}
                label="无号码"
                value={bucketed.no_number.length}
              />
            </div>
          </section>

          {/* 执行账号（后台调度） */}
          <section className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <ServerCog className="h-3.5 w-3.5" /> 执行账号
            </Label>
            {noPool ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                暂无可用 {platform} 执行账号，请联系管理员开通。
              </div>
            ) : (
              <div
                className={cn(
                  "rounded-md border p-2 text-xs flex items-center justify-between gap-2",
                  overLimit
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-muted bg-muted/40 text-muted-foreground",
                )}
              >
                <span>
                  系统自动分派执行账号 · 今日池内剩余
                  <span className="font-medium mx-1">{remaining}</span>/{capacity} 条
                  {overLimit && (
                    <span className="ml-2">
                      有效收件人 {validCount} 条，超出 {validCount - remaining} 条
                    </span>
                  )}
                </span>
                {overLimit && remaining > 0 && (
                  <button
                    type="button"
                    onClick={handleTrimToRemaining}
                    className="shrink-0 rounded border border-rose-300 bg-white px-2 py-0.5 font-medium hover:bg-rose-100"
                  >
                    仅保留前 {remaining} 条
                  </button>
                )}
              </div>
            )}
          </section>

          {/* 目标号列表（脱敏） */}
          {candidates.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">
                  目标账号（{candidates.length}）
                </Label>
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Info className="h-3 w-3" />
                  号码默认脱敏，点击 👁 首次查看 -{COST_VIEW_PHONE} 积分，永久解锁；成功发送后自动解锁
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 rounded-md border bg-muted/20 p-2 max-h-32 overflow-y-auto">
                {candidates.map((c) => {
                  const st = normalizePhone(c.address)
                    ? getWaStatus(c.address)
                    : "no_number";
                  const tone =
                    st === "verified"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : st === "unregistered"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : st === "checking"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-slate-200 bg-slate-50 text-slate-600";
                  return (
                    <span
                      key={c.key}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
                        tone,
                      )}
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="opacity-60">·</span>
                      {c.address ? (
                        <MaskedField
                          targetKind={c.targetKind}
                          targetId={c.targetId}
                          targetName={c.name}
                          parentRef={c.parentRef}
                          field="phone"
                          value={c.address}
                          mono
                        />
                      ) : (
                        <span className="font-mono text-muted-foreground">—</span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setCandidates((prev) =>
                            prev.filter((x) => x.key !== c.key),
                          )
                        }
                        className="ml-0.5 opacity-60 hover:opacity-100"
                        aria-label="移除"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          {/* 撰写内容 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-2">
                撰写内容
                {aiUsed && (
                  <Badge
                    variant="secondary"
                    className="gap-1 bg-amber-100 text-amber-800"
                  >
                    <Sparkles className="h-3 w-3" />
                    AI 已生成 · 可手动调整
                  </Badge>
                )}
              </Label>
              <div className="flex items-center gap-2">
                <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAiOpen(true)}
                className="h-7 gap-1"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {aiUsed ? "AI 重新生成" : "AI 生成"}
                <span className="text-xs text-muted-foreground">
                  -{COST_AI_SOCIAL} 积分/次
                </span>
                </Button>
              </div>
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
                placeholder={`{联系人名}您好，我是{我的公司}的{我的姓名}，看到贵司在{行业}方向的业务……`}
              />
              <div className="text-[11px] text-muted-foreground">
                {content.length} / 4096 字
              </div>
            </div>
          </section>

          {/* 预览 */}
          {verified.length > 0 && (
            <section className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  预览（变量已替换）
                  {null}
                </Label>
                {verified.length > 1 && (
                  <Select
                    value={String(previewIdx)}
                    onValueChange={(v) => setPreviewIdx(Number(v))}
                  >
                    <SelectTrigger className="h-7 w-[200px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {verified.map((r, i) => (
                        <SelectItem key={r.key} value={String(i)}>
                          第 {i + 1} 条 · {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="text-xs whitespace-pre-wrap text-foreground/90 max-h-40 overflow-y-auto">
                {previewContent || (
                  <span className="text-muted-foreground">（暂无内容）</span>
                )}
              </div>
            </section>
          )}

          {/* 费用 */}
          <section className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                发送费用（{sendableCount} 条 × {unit} 积分）
              </span>
              <span className="font-medium">{sendTotal} 积分</span>
            </div>
            {viewCostTotal > 0 && (() => {
              const unitView =
                platform === "WhatsApp" ? COST_VIEW_PHONE : COST_VIEW_SOCIAL;
              const unlockCount = Math.round(viewCostTotal / unitView);
              const alreadyCount = sendableCount - unlockCount;
              const fieldLabel =
                platform === "WhatsApp" ? "电话" : `${platform} 账号`;
              return (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    自动解锁查看{fieldLabel}（{unlockCount} 位未解锁收件人 ×{" "}
                    {unitView} 积分
                    {alreadyCount > 0 ? `，另 ${alreadyCount} 位已解锁免费` : ""}
                    ，永久生效）
                  </span>
                  <span className="font-medium">{viewCostTotal} 积分</span>
                </div>
              );
            })()}
            {aiCost > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  AI 生成（{aiCount} 次 × {COST_AI_SOCIAL} 积分）
                </span>
                <span className="font-medium">{aiCost} 积分</span>
              </div>
            )}
            <div className="flex justify-between border-t border-rose-200/70 pt-1">
              <span className="font-semibold text-rose-700">合计</span>
              <span className="font-semibold text-rose-700">
                {grandTotal} 积分
              </span>
            </div>
            {viewCostTotal > 0 && (
              <div className="text-[11px] text-rose-700/80 pt-0.5">
                触达完成后，对应{platform === "WhatsApp" ? "电话号码" : `${platform} 账号`}将永久解锁，后续查看/再次触达不再收取查看费。
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSend} disabled={!canSend} className="bg-primary">
            <Send className="h-4 w-4" />
            确认发送（-{grandTotal}）
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

function StatCell({
  tone,
  icon,
  label,
  value,
}: {
  tone: "emerald" | "rose" | "amber" | "slate";
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  const cls = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  }[tone];
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded border px-2 py-1.5",
        cls,
      )}
    >
      <span className="inline-flex items-center gap-1">
        {icon}
        {label}
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/* -------------------- AI 子弹窗 -------------------- */
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
  platform: SocialPlatform;
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
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
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
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">正式商务</SelectItem>
                  <SelectItem value="friendly">友好诚恳</SelectItem>
                  <SelectItem value="concise">简洁直接</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">目标语言</Label>
              <Select
                value={language}
                onValueChange={(v) => setLanguage(v as typeof language)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
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
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            取消
          </Button>
          <Button
            disabled={loading}
            onClick={() =>
              onGenerate({ scene, tone, language, extra: extra.trim() || undefined })
            }
            className={cn("bg-primary", loading && "opacity-80")}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {loading ? "生成中…" : "生成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}