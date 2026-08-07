import { useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  Sparkles,
  Loader2,
  Eye,
  X,
  ServerCog,
  Users,
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  MESSAGE_VARIABLES,
  renderTemplate,
  type Recipient,
} from "@/lib/message-vars";
import {
  createReach,
  costForSocialPlatform,
} from "@/lib/credits-ledger";
import { useSocialAccounts, type SocialAccount } from "@/data/social-accounts";
import { useLeadProfile } from "@/lib/lead-profile";
import { useCurrentUser } from "@/lib/current-user";
import { ComposeFormatHint } from "@/components/outreach/ComposeFormatHint";
import { generateAiContent } from "@/lib/api/ai-compose.functions";
import { TargetLangSection } from "@/components/outreach/TargetLangSection";

export type ReachPlatform = "Facebook" | "TikTok";
export const REACH_PLATFORMS: ReachPlatform[] = ["Facebook", "TikTok"];

/** 单日单账号触达上限 */
export const DAILY_PER_ACCOUNT = 5;

/** 社媒目标候选人（收藏 → 社媒收件人） */
export interface PlatformCandidate extends Recipient {
  enterpriseId?: string;
  /** 该目标在各平台上的社媒联系方式（handle），无则表示该平台不可触达 */
  handles: Partial<Record<ReachPlatform, string>>;
}

/** 账号当日已触达次数（私信 + 加友） */
export function accountTouchesToday(a: SocialAccount): number {
  return (a.dmSentToday ?? a.sentToday ?? 0) + (a.friendSentToday ?? 0);
}

/** 可用执行账号：状态正常 且 当日触达次数未超过 5 */
export function usableExecAccounts(
  list: SocialAccount[],
  platform: ReachPlatform | "all",
): SocialAccount[] {
  return list.filter(
    (a) =>
      a.status === "正常" &&
      (platform === "all" || a.platform === platform) &&
      accountTouchesToday(a) < DAILY_PER_ACCOUNT,
  );
}

export interface BatchSocialPlatformDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidates: PlatformCandidate[];
}

export function BatchSocialPlatformDialog({
  open,
  onOpenChange,
  candidates,
}: BatchSocialPlatformDialogProps) {
  const accounts = useSocialAccounts();
  const profile = useLeadProfile();
  const user = useCurrentUser();
  const callGenerate = useServerFn(generateAiContent);

  const [platform, setPlatform] = useState<ReachPlatform | "all">("all");
  const [content, setContent] = useState("");
  const [aiUsed, setAiUsed] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  /** 目标语言（发送语言）代码 */
  const [targetLang, setTargetLang] = useState<string>("en");
  /** 目标语言译文（实际发送内容） */
  const [translated, setTranslated] = useState("");

  // 手动添加目标相关
  const [extraTargets, setExtraTargets] = useState<PlatformCandidate[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newTarget, setNewTarget] = useState({ name: "", handle: "", platform: "Facebook" as ReachPlatform });

  useEffect(() => {
    if (!open) return;
    setPlatform("all");
    setContent("");
    setAiUsed(false);
    setPreviewIdx(0);
    setTargetLang("en");
    setTranslated("");
    setExtraTargets([]);
    setIsAdding(false);
  }, [open]);

  const allCandidates = useMemo(() => [...candidates, ...extraTargets], [candidates, extraTargets]);

  /** 按平台联系方式分组数量 */
  const groups = useMemo(() => {
    const g: Record<ReachPlatform, PlatformCandidate[]> = {
      Facebook: [],
      TikTok: [],
    };
    const none: PlatformCandidate[] = [];
    for (const c of allCandidates) {
      let hit = false;
      for (const p of REACH_PLATFORMS) {
        if (c.handles[p]) {
          g[p].push(c);
          hit = true;
        }
      }
      if (!hit) none.push(c);
    }
    return { ...g, none };
  }, [allCandidates]);

  /** 当前平台筛选下的触达目标（平台 + 目标 的组合） */
  type Job = { candidate: PlatformCandidate; platform: ReachPlatform; handle: string };
  const jobs = useMemo<Job[]>(() => {
    const out: Job[] = [];
    for (const p of REACH_PLATFORMS) {
      if (platform !== "all" && platform !== p) continue;
      for (const c of groups[p]) {
        out.push({ candidate: c, platform: p, handle: c.handles[p]! });
      }
    }
    return out;
  }, [groups, platform]);

  /** 相应平台状态为正常的账号（用于展示数量） */
  const normalAccounts = useMemo(
    () =>
      accounts.filter(
        (a) =>
          a.status === "正常" &&
          (platform === "all" || a.platform === platform),
      ),
    [accounts, platform],
  );
  /** 今日仍有剩余额度的可用执行账号 */
  const usable = useMemo(
    () => normalAccounts.filter((a) => accountTouchesToday(a) < DAILY_PER_ACCOUNT),
    [normalAccounts],
  );
  const capacity = useMemo(
    () =>
      normalAccounts.reduce(
        (s, a) => s + Math.max(0, DAILY_PER_ACCOUNT - accountTouchesToday(a)),
        0,
      ),
    [normalAccounts],
  );

  const targetCount = jobs.length;
  /** 今日可执行条数，其余顺延次日 */
  const todayCount = Math.min(targetCount, capacity);
  const deferredCount = Math.max(0, targetCount - capacity);
  const overLimit = deferredCount > 0;

  // 费用：按目标数量全额扣除（含顺延次日执行的部分）
  const unit = costForSocialPlatform("Facebook");
  const sendTotal = targetCount * unit;
  
  const grandTotal = sendTotal;

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

  /** 实际发送内容：有译文则发译文 */
  const sendContent = (translated.trim() || content).trim();
  const previewJob = jobs[Math.min(previewIdx, Math.max(0, jobs.length - 1))];
  const previewContent = previewJob
    ? renderTemplate(sendContent, previewJob.candidate.ctx)
    : "";

  const canSend = targetCount > 0 && content.trim().length > 0;

  /** 次日 09:00 起继续执行 */
  function nextDayStart(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }

  function handleSend() {
    if (!canSend) return;
    const scheduled = nextDayStart();
    let n = 0;
    jobs.forEach((job, i) => {
      const r = job.candidate;
      createReach({
        targetKind: r.targetKind,
        targetId: r.targetId,
        targetName: r.name,
        parentRef: r.parentRef,
        channel: "social",
        platform: job.platform,
        detail: job.handle,
        content: renderTemplate(sendContent, r.ctx),
        aiGenerated: aiUsed,
        cost: unit,
        userCreated: true,
        ...(i >= capacity ? { scheduledAt: scheduled } : {}),
      });
      n++;
    });
    onOpenChange(false);
    toast.success(`已加入触达队列：${n} 条社媒私信`, {
      description: `${
        deferredCount > 0
          ? `今日执行 ${todayCount} 条，剩余 ${deferredCount} 条将于明日 09:00 自动继续执行；`
          : ""
      }共扣除 ${grandTotal} 积分，可在「触达任务」模块查看进度`,
    });
  }

  function handleAddExtra() {
    if (!newTarget.name || !newTarget.handle) {
      toast.error("请填写完整信息");
      return;
    }
    const candidate: PlatformCandidate = {
      key: `extra-${Date.now()}-${Math.random()}`,
      name: newTarget.name,
      address: newTarget.handle,
      targetKind: "contact",
      targetId: "manual",
      handles: { [newTarget.platform]: newTarget.handle },
      ctx: {
        联系人名: newTarget.name,
        我的公司: profile.companyName,
        我的姓名: user.name,
      },
    };
    setExtraTargets((prev) => [...prev, candidate]);
    setNewTarget({ ...newTarget, name: "", handle: "" });
    setIsAdding(false);
    toast.success("已手动添加触达目标");
  }

  function handleRemoveExtra(key: string) {
    setExtraTargets((prev) => prev.filter((t) => t.key !== key));
  }

  async function handleAiGenerate() {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const sample = jobs[0]?.candidate ?? candidates[0];
      const res = await callGenerate({
        data: {
          channel: "social",
          platform: platform === "all" ? "Facebook" : platform,
          scene: "开发信",
          tone: "friendly",
          language: "zh",
          languageName: "中文",
          myCompany: profile.companyName,
          myName: user.name,
          sampleEnterprise: sample?.ctx.企业名,
        },
      });
      if (res.content) setContent(res.content);
      setAiUsed(true);
      toast.success("AI 已生成社媒首次接触文案");
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
            <Users className="h-5 w-5 text-primary" />
            批量社媒私信 · 已选 {candidates.length} 个目标
            <Badge variant="secondary" className="ml-1 font-normal">
              可触达 {targetCount}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            向你收藏的目标按平台分发私信，超出当日额度将顺延至次日。
            <br />
            目标来源：我的收藏（已选 {candidates.length} 个）· 需要系统帮你找新目标？前往「触达任务 → 社媒拓客触达」。
          </DialogDescription>
        </DialogHeader>


        <div className="space-y-5">
          {/* 分组统计与目标展示 */}
          <section className="rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">
                选中数据 · 社媒联系方式分布
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] text-primary"
                onClick={() => setIsAdding(!isAdding)}
              >
                {isAdding ? "取消添加" : "手动添加目标"}
              </Button>
            </div>

            {isAdding && (
              <div className="space-y-3 border-b pb-3 mb-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">人名/企业名</Label>
                    <Input
                      size={1}
                      className="h-7 text-xs"
                      placeholder="例如: John Doe"
                      value={newTarget.name}
                      onChange={(e) => setNewTarget({ ...newTarget, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">平台</Label>
                    <Select
                      value={newTarget.platform}
                      onValueChange={(v) => setNewTarget({ ...newTarget, platform: v as ReachPlatform })}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Facebook">Facebook</SelectItem>
                        <SelectItem value="TikTok">TikTok</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">账号/主页链接</Label>
                    <Input
                      size={1}
                      className="h-7 text-xs"
                      placeholder="handle 或 URL"
                      value={newTarget.handle}
                      onChange={(e) => setNewTarget({ ...newTarget, handle: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" className="h-7 text-[11px]" onClick={handleAddExtra}>
                    添加至列表
                  </Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-xs">
              <StatCell
                tone="sky"
                label="Facebook"
                value={groups.Facebook.length}
              />
              <StatCell tone="violet" label="TikTok" value={groups.TikTok.length} />
              <StatCell tone="slate" label="无社媒账号" value={groups.none.length} />
            </div>

            {/* 目标列表滚动展示 */}
            <div className="mt-3 max-h-32 overflow-y-auto border-t pt-2 space-y-1.5 pr-1">
              {allCandidates.map((c) => (
                <div key={c.key} className="flex items-center justify-between group">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[11px] font-medium truncate max-w-[120px]">{c.name}</span>
                    <div className="flex gap-1 overflow-hidden">
                      {REACH_PLATFORMS.map(p => c.handles[p] && (
                        <Badge key={p} variant="outline" className={cn(
                          "px-1 py-0 h-4 text-[9px] font-normal",
                          p === "Facebook" ? "border-sky-200 text-sky-700 bg-sky-50" : "border-violet-200 text-violet-700 bg-violet-50"
                        )}>
                          {p}: {c.handles[p]}
                        </Badge>
                      ))}
                      {!REACH_PLATFORMS.some(p => c.handles[p]) && (
                        <Badge variant="outline" className="px-1 py-0 h-4 text-[9px] font-normal text-muted-foreground bg-muted/50">
                          暂无账号
                        </Badge>
                      )}
                    </div>
                  </div>
                  {c.targetId === "manual" && (
                    <button 
                      onClick={() => handleRemoveExtra(c.key)}
                      className="text-muted-foreground hover:text-destructive p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 目标平台 + 可用账号 */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">目标平台</Label>
              <Select
                value={platform}
                onValueChange={(v) => {
                  setPlatform(v as ReachPlatform | "all");
                  setPreviewIdx(0);
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="Facebook">Facebook</SelectItem>
                  <SelectItem value="TikTok">TikTok</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <ServerCog className="h-3.5 w-3.5" /> 可用执行账号
              </Label>
              <div
                className={cn(
                "flex h-9 items-center justify-between rounded-md border px-3 text-xs",
                  normalAccounts.length === 0
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "bg-muted/40 text-muted-foreground",
                )}
              >
                <span>
                  <span className="text-foreground font-semibold mx-0.5">
                    {normalAccounts.length}
                  </span>
                  个账号 · 今日可触达
                  <span className="text-foreground font-semibold mx-0.5">
                    {capacity}
                  </span>
                  次
                </span>
                <span className="text-[11px]">单账号 {DAILY_PER_ACCOUNT} 次/天</span>
              </div>
            </div>
          </section>

          {overLimit && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 flex items-start gap-1.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                目标 {targetCount} 条超出今日可触达额度：系统今日先执行{" "}
                <b>{todayCount}</b> 条，剩余 <b>{deferredCount}</b>{" "}
                条将自动顺延至<b>明日 09:00</b>继续执行，无需重复提交；积分按目标总数
                {targetCount} 条一次性扣除。
              </span>
            </div>
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
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={aiLoading}
                onClick={() => handleAiGenerate()}
                className="h-7 gap-1"
              >
                {aiLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                )}
                {aiLoading ? "生成中…" : aiUsed ? "AI 重新生成" : "AI 生成文案"}
              </Button>
            </div>

            <ComposeFormatHint
              channel="social"
              platform={platform === "all" ? "Facebook" : platform}
            />


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

          {/* 目标语言文案（实际发送内容） */}
          <TargetLangSection
            source={content}
            lang={targetLang}
            onLangChange={setTargetLang}
            value={translated}
            onChange={setTranslated}
            kindLabel="私信"
          />

          {/* 预览 */}

          {jobs.length > 0 && (
            <section className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  内容预览（变量已替换）
                </Label>
                {jobs.length > 1 && (
                  <Select
                    value={String(Math.min(previewIdx, jobs.length - 1))}
                    onValueChange={(v) => setPreviewIdx(Number(v))}
                  >
                    <SelectTrigger className="h-7 w-[220px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {jobs.map((j, i) => (
                        <SelectItem key={`${j.platform}:${j.candidate.key}`} value={String(i)}>
                          第 {i + 1} 条 · {j.platform} · {j.candidate.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {previewJob && (
                <div className="text-[11px] text-muted-foreground">
                  {previewJob.platform} · {previewJob.handle}
                </div>
              )}
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
                发送费用（{targetCount} 条 × {unit} 积分）
              </span>
              <span className="font-medium">{sendTotal} 积分</span>
            </div>
            {deferredCount > 0 && (
              <div className="text-[11px] text-amber-700">
                其中 {deferredCount} 条顺延至明日 09:00 执行
              </div>
            )}
            <div className="flex justify-between border-t border-rose-200/70 pt-1">
              <span className="font-semibold text-rose-700">合计</span>
              <span className="font-semibold text-rose-700">{grandTotal} 积分</span>
            </div>
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
    </Dialog>
  );
}

function StatCell({
  tone,
  label,
  value,
}: {
  tone: "sky" | "violet" | "slate";
  label: string;
  value: number;
}) {
  const cls = {
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  }[tone];
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded border px-2 py-1.5",
        cls,
      )}
    >
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

