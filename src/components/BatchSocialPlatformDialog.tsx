import { useEffect, useMemo, useState } from "react";
import {
  Send,
  Sparkles,
  Loader2,
  X,
  ServerCog,
  Users,
  Info,
  Unlock,
  Eye,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { saveReachTaskConfig } from "@/lib/reach-task-config";
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

import { renderTemplate, type Recipient } from "@/lib/message-vars";
import {
  createReach,
  costForSocialPlatform,
  COST_VIEW_SOCIAL,
  computeReachBreakdown,
  performReachAutoUnlocks,
  useLedger,
} from "@/lib/credits-ledger";
import { Checkbox } from "@/components/ui/checkbox";
import { maskContact } from "@/lib/mask-contact";
import { useSocialAccounts, type SocialAccount } from "@/data/social-accounts";
import { useLeadProfile } from "@/lib/lead-profile";
import { useCurrentUser } from "@/lib/current-user";
import { ComposeFormatHint } from "@/components/outreach/ComposeFormatHint";
import { generateAiContent } from "@/lib/api/ai-compose.functions";
import { TargetLangSection } from "@/components/outreach/TargetLangSection";
import {
  PreviewTargetPicker,
  VarUsageHint,
  type PreviewTarget,
} from "@/components/outreach/MultiTargetVars";
import { useMyInfoGuard } from "@/lib/my-info-guard";

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
  /** 初始待触达目标列表（来自外部选择） */
  candidates: PlatformCandidate[];
  /** 当内部列表变动时同步给父组件 */
  onCandidatesChange?: (newList: PlatformCandidate[]) => void;
}

export function BatchSocialPlatformDialog({
  open,
  onOpenChange,
  candidates: initialCandidates,
  onCandidatesChange,
}: BatchSocialPlatformDialogProps) {
  const accounts = useSocialAccounts();
  const profile = useLeadProfile();
  const user = useCurrentUser();
  const myInfo = useMyInfoGuard();
  const ledger = useLedger();
  const callGenerate = useServerFn(generateAiContent);

  const [content, setContent] = useState("");
  const [aiUsed, setAiUsed] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  /** 目标语言（发送语言）代码 */
  const [targetLang, setTargetLang] = useState<string>("en");
  /** 目标语言译文（实际发送内容） */
  const [translated, setTranslated] = useState("");

  // 内部维护的完整目标列表（含外部传入和手动添加的）
  const [internalCandidates, setInternalCandidates] = useState<PlatformCandidate[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  /** 多目标预览下标（仅展示，不改模板、不产生费用） */
  const [previewIdx, setPreviewIdx] = useState(0);
  const [newTarget, setNewTarget] = useState({ name: "", handle: "", platform: "Facebook" as ReachPlatform });

  useEffect(() => {
    if (!open) return;
    setContent("");
    setAiUsed(false);
    
    setTargetLang("en");
    setTranslated("");
    setInternalCandidates(initialCandidates);
    setRemovedJobKeys(new Set());
    setIsAdding(false);
    setPreviewIdx(0);
  }, [open, initialCandidates]);

  const allCandidates = internalCandidates;

  /** 当前平台筛选下的触达目标（单一账号级别，而不是企业级别） */
  type Job = {
    key: string; // 唯一标识：candidateKey-platform
    candidate: PlatformCandidate;
    platform: ReachPlatform;
    handle: string;
  };

  /** 将 candidates 展平为具体的账号任务列表 */
  const allAccountJobs = useMemo<Job[]>(() => {
    const out: Job[] = [];
    for (const c of allCandidates) {
      for (const p of REACH_PLATFORMS) {
        if (c.handles[p]) {
          out.push({
            key: `${c.key}-${p}`,
            candidate: c,
            platform: p,
            handle: c.handles[p]!,
          });
        }
      }
    }
    return out;
  }, [allCandidates]);

  // 内部维护的已删除 Job Keys (针对单一账号的删除)
  const [removedJobKeys, setRemovedJobKeys] = useState<Set<string>>(new Set());

  // 实际参与执行的任务列表
  const filteredJobs = useMemo(() => {
    return allAccountJobs.filter((j) => !removedJobKeys.has(j.key));
  }, [allAccountJobs, removedJobKeys]);

  const jobs = filteredJobs;

  /** 状态正常的执行账号（用于展示数量） */
  const normalAccounts = useMemo(
    () => accounts.filter((a) => a.status === "正常"),
    [accounts],
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

  /** 单条解锁单价 */
  const unitView = COST_VIEW_SOCIAL;
  /** 手动添加的目标由用户自行提供 handle，无需解锁 */
  const isManualJob = (j: Job) => j.candidate.targetId === "manual";
  /** 尚未解锁明文的任务 key 集合 */
  const lockedJobKeys = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) {
      if (isManualJob(j)) continue;
      const bd = computeReachBreakdown(
        { targetKind: j.candidate.targetKind, targetId: j.candidate.targetId },
        "social",
        j.platform,
        { reachCostOverride: 0 },
      );
      if (bd.viewCost > 0) set.add(j.key);
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, ledger]);

  const viewCostTotal = lockedJobKeys.size * unitView;

  function unlockJob(j: Job) {
    performReachAutoUnlocks({
      targetKind: j.candidate.targetKind,
      targetId: j.candidate.targetId,
      targetName: j.candidate.name,
      parentRef: j.candidate.parentRef,
      detail: j.handle,
      fields: [{ field: "social", subKey: j.platform }],
    });
    toast.success(`已解锁 ${j.candidate.name} 的 ${j.platform} 账号`, {
      description: `扣除 ${unitView} 积分，永久有效`,
    });
  }

  const [unlockAllOpen, setUnlockAllOpen] = useState(false);
  const [unlockAllAck, setUnlockAllAck] = useState(false);
  function unlockAll() {
    const targets = jobs.filter((j) => lockedJobKeys.has(j.key));
    targets.forEach(unlockJob0);
    function unlockJob0(j: Job) {
      performReachAutoUnlocks({
        targetKind: j.candidate.targetKind,
        targetId: j.candidate.targetId,
        targetName: j.candidate.name,
        parentRef: j.candidate.parentRef,
        detail: j.handle,
        fields: [{ field: "social", subKey: j.platform }],
      });
    }
    setUnlockAllOpen(false);
    setUnlockAllAck(false);
    toast.success(`已解锁 ${targets.length} 个社媒账号明文`, {
      description: `扣除 ${targets.length * unitView} 积分，永久有效`,
    });
  }

  const grandTotal = sendTotal + viewCostTotal;

  /** 实际发送内容：有译文则发译文 */
  const sendContent = (translated.trim() || content).trim();

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
    const taskName = `批量社媒私信 · ${filteredJobs.length}个账号`;
    let n = 0;
    jobs.forEach((job, i) => {
      const r = job.candidate;
      if (r.targetId !== "manual") {
        performReachAutoUnlocks({
          targetKind: r.targetKind,
          targetId: r.targetId,
          targetName: r.name,
          parentRef: r.parentRef,
          detail: job.handle,
          fields: [{ field: "social", subKey: job.platform }],
        });
      }
      createReach({
        targetKind: r.targetKind,
        targetId: r.targetId,
        targetName: r.name,
        parentRef: r.parentRef,
        channel: "social",
        platform: job.platform,
        detail: job.handle,
        subject: taskName, // 使用 subject 存储任务名称以便聚合
        content: renderTemplate(sendContent, r.ctx),
        aiGenerated: aiUsed,
        cost: unit,
        userCreated: true,
        ...(i >= capacity ? { scheduledAt: scheduled } : {}),
      });
      n++;
    });
    saveReachTaskConfig({
      taskKey: `s:${taskName}:${jobs[0]?.platform ?? ""}`,
      type: "social_dm",
      platform: jobs[0]?.platform,
      action: "私信",
      targetCap: targetCount,
      targetSource: "「我的收藏」勾选目标",
      sendMode: "系统按账号额度自动排期发送",
      schedule:
        deferredCount > 0
          ? "当日额度用尽部分顺延次日 09:00 继续执行"
          : "创建后立即执行",
      sourceZh: content.trim(),
      targetLang,
      sendContent,
      aiGenerated: aiUsed,
      costPerTarget: unit,
    });
    onOpenChange(false);
    toast.success(`已加入触达队列：${n} 条社媒私信`, {
      description: `${
        deferredCount > 0
          ? `今日执行 ${todayCount} 条，剩余 ${deferredCount} 条将于明日 09:00 自动继续执行；`
          : ""
      }共扣除 ${grandTotal} 积分，可在「客户触达」模块查看进度`,
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
    const newList = [...internalCandidates, candidate];
    setInternalCandidates(newList);
    onCandidatesChange?.(newList);
    setNewTarget({ ...newTarget, name: "", handle: "" });
    setIsAdding(false);
    toast.success("已手动添加触达目标");
  }

  function handleRemoveJob(jobKey: string) {
    setRemovedJobKeys((prev) => {
      const next = new Set(prev);
      next.add(jobKey);
      return next;
    });
  }

  async function handleAiGenerate() {
    if (aiLoading) return;
    if (!myInfo.ensure()) return;
    setAiLoading(true);
    try {
      const sample = jobs[0]?.candidate ?? allCandidates[0];
      const multiNow = multi;
      const res = await callGenerate({
        data: {
          channel: "social",
          platform: "Facebook",
          scene: "开发信",
          tone: "friendly",
          language: "zh",
          languageName: "中文",
          myCompany: profile.companyName,
          myName: user.name,
          literal: !multiNow,
          sampleEnterprise: sample?.ctx.企业名,
          sampleContact: multiNow ? undefined : sample?.ctx.联系人名,
          sampleIndustry: multiNow ? undefined : sample?.ctx.行业,
          sampleCity: multiNow ? undefined : sample?.ctx.城市,
        },
      });
      if (res.content)
        setContent(
          multiNow ? myInfo.fillMine(res.content) : myInfo.fillAll(res.content, sample?.ctx),
        );
      setAiUsed(true);
      toast.success(
        "AI 已生成社媒首次接触文案",
        multiNow
          ? { description: `文案含目标变量，发送时按 ${previewTargets.length} 个目标分别替换` }
          : undefined,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("AI 生成失败", { description: msg });
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            批量社媒私信
            <Badge variant="secondary" className="ml-1 font-normal">
              待执行 {jobs.length}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            向下列目标分发私信，可手动添加或删除；超出当日额度的部分自动顺延至次日。
          </DialogDescription>
        </DialogHeader>


        <div className="space-y-5">
          {/* 分组统计与目标展示 */}
          <section className="rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">
                待执行任务列表
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

            {/* 目标列表滚动展示 */}

            {lockedJobKeys.size > 0 && (
              <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  {lockedJobKeys.size} 个账号未解锁，默认脱敏展示；发送后自动解锁
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setUnlockAllAck(false);
                    setUnlockAllOpen(true);
                  }}
                >
                  <Unlock className="h-3.5 w-3.5 mr-1" />
                  全部解锁 · -{lockedJobKeys.size * unitView}
                </Button>
              </div>
            )}

            <div className="mt-3 max-h-40 overflow-y-auto border-t pt-2 space-y-1.5 pr-1">
              {filteredJobs.length === 0 ? (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  暂无待执行任务，请添加或从外部选择目标。
                </div>
              ) : (
                filteredJobs.map((j) => (
                  <div key={j.key} className="flex items-center justify-between group py-0.5">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-[11px] font-medium truncate max-w-[120px]">{j.candidate.name}</span>
                      <Badge variant="outline" className={cn(
                        "px-1 py-0 h-4 text-[9px] font-normal",
                        j.platform === "Facebook" ? "border-sky-200 text-sky-700 bg-sky-50" : "border-violet-200 text-violet-700 bg-violet-50"
                      )}>
                        {j.platform}:{" "}
                        {lockedJobKeys.has(j.key)
                          ? maskContact("social", j.handle)
                          : j.handle}
                      </Badge>
                      {lockedJobKeys.has(j.key) && (
                        <button
                          type="button"
                          onClick={() => unlockJob(j)}
                          className="inline-flex items-center gap-0.5 rounded border border-primary/30 bg-primary/5 px-1 text-[10px] font-medium text-primary hover:bg-primary/10"
                          title={`解锁明文，扣 ${unitView} 积分（永久有效）`}
                        >
                          <Eye className="h-3 w-3" />
                          {unitView}
                        </button>
                      )}
                    </div>
                    <button 
                      onClick={() => handleRemoveJob(j.key)}
                      className="text-muted-foreground hover:text-destructive p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* 可用执行账号 */}
          <div
            className={cn(
              "flex h-9 items-center justify-between rounded-md border px-3 text-xs",
              normalAccounts.length === 0
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "bg-muted/40 text-muted-foreground",
            )}
          >
            <span className="flex items-center gap-1">
              <ServerCog className="h-3.5 w-3.5" />
              可用执行账号
              <span className="text-foreground font-semibold mx-0.5">
                {normalAccounts.length}
              </span>
              个 · 今日可触达
              <span className="text-foreground font-semibold mx-0.5">
                {capacity}
              </span>
              次
            </span>
            <span className="text-[11px]">单账号 {DAILY_PER_ACCOUNT} 次/天</span>
          </div>

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
              platform="Facebook"
            />

            <div className="grid gap-0 lg:grid-cols-2 lg:divide-x rounded-md border overflow-hidden">
              <div className="space-y-2 p-3">
                <div className="flex h-8 items-center">
                  <Label className="text-xs text-muted-foreground">中文原文 *</Label>
                </div>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={10}
                  maxLength={4096}
                  placeholder={`{联系人名}您好，我是{我的公司}的{我的姓名}，看到贵司在{行业}方向的业务……`}
                />
                <div className="text-[11px] text-muted-foreground">
                  {content.length} / 4096 字
                </div>
                <VarUsageHint template={content} targets={previewTargets} />
              </div>

              {/* 目标语言文案（实际发送内容） */}
              <TargetLangSection
                source={content}
                lang={targetLang}
                onLangChange={setTargetLang}
                value={translated}
                onChange={setTranslated}
                rows={10}
                kindLabel="私信"
                bare
                keepVars={multi}
                previewCtx={multi ? previewTarget?.ctx : undefined}
                previewLabel={previewTarget?.name}
                headerExtra={
                  <PreviewTargetPicker
                    targets={previewTargets}
                    index={previewIdx}
                    onChange={setPreviewIdx}
                  />
                }
              />
            </div>
          </section>

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
            {viewCostTotal > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  发送后解锁社媒账号（{lockedJobKeys.size} 个未解锁 × {unitView} 积分，永久生效）
                </span>
                <span className="font-medium">{viewCostTotal} 积分</span>
              </div>
            )}
            <div className="flex justify-between border-t border-rose-200/70 pt-1">
              <span className="font-semibold text-rose-700">合计</span>
              <span className="font-semibold text-rose-700">{grandTotal} 积分</span>
            </div>
            {viewCostTotal > 0 && (
              <div className="text-[11px] text-rose-700/80 pt-0.5">
                触达完成后，对应社媒账号将永久解锁，后续查看/再次触达不再收取查看费。
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

      {/* 全部解锁 · 二次确认 */}
      <Dialog open={unlockAllOpen} onOpenChange={setUnlockAllOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>解锁全部明文社媒账号</DialogTitle>
            <DialogDescription>
              将为 {lockedJobKeys.size} 个未解锁账号一次性解锁明文，扣除{" "}
              <span className="font-semibold text-rose-600">
                {lockedJobKeys.size * unitView}
              </span>{" "}
              积分，解锁后永久有效、不可撤销。批量群发本身无需解锁即可发送。
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={unlockAllAck}
              onCheckedChange={(v) => setUnlockAllAck(v === true)}
              className="mt-0.5"
            />
            <span>我已知晓将立即扣除 {lockedJobKeys.size * unitView} 积分</span>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockAllOpen(false)}>
              取消
            </Button>
            <Button disabled={!unlockAllAck} onClick={unlockAll}>
              <Unlock className="h-4 w-4" />
              确认解锁
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>

  );
}
