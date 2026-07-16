import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Zap,
  ChevronRight,
  Mail,
  Phone,
  Globe,
  Search,
  X,
  Building2,
  UserRound,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  Send,
  RefreshCw,
  EyeOff,
  Info,
  RotateCcw,
  Play,
  Ban,
  FileText,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  useLedger,
  getReachStatus,
  seedDemoLedgerIfEmpty,
  resetDemoLedger,
  syncFailedRefunds,
  isReachRefunded,
  triggerReachNow,
  cancelPendingReach,
  retryFailedReach,
  COST_REACH,
  isRetryableFailReason,
  REACH_STATUS_LABEL,
  REACH_STATUS_COLOR,
  REACH_CHANNEL_LABEL,
  type ReachStatus,
  type ReachChannel,
} from "@/lib/credits-ledger";
import { ListPagination } from "@/components/ListPagination";
import { useThreads, threadKeyFor, type Thread } from "@/lib/inbox-store";
import { Inbox as InboxIcon, MessageCircleReply } from "lucide-react";

export const Route = createFileRoute("/_app/outreach/reach")({
  head: () => ({ meta: [{ title: "出海大数据平台 · 触达 | 出海大数据平台" }] }),
  component: ReachPage,
});

import { formatDateTime as fmtTime } from "@/lib/format-date";

function relative(iso: string, now: number) {
  const diff = (now - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.max(1, Math.floor(diff))} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

function ReachPage() {
  useEffect(() => {
    seedDemoLedgerIfEmpty();
    syncFailedRefunds();
  }, []);

  const ledger = useLedger();
  const threads = useThreads();
  const threadByKey = useMemo(() => {
    const m = new Map<string, Thread>();
    for (const t of threads) m.set(t.id, t);
    return m;
  }, [threads]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      syncFailedRefunds();
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const [statusTab, setStatusTab] = useState<"all" | ReachStatus>("all");
  const [channel, setChannel] = useState<"all" | ReachChannel | "whatsapp">(
    "all",
  );
  const [targetKind, setTargetKind] = useState<"all" | "enterprise" | "contact">(
    "all",
  );
  const [kw, setKw] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [confirm, setConfirm] = useState<
    | null
    | {
        kind: "trigger" | "cancel" | "retry";
        id: string;
        target: string;
      }
  >(null);
  const [viewing, setViewing] = useState<
    | null
    | {
        id: string;
        targetName: string;
        channel?: ReachChannel;
        subject?: string;
        content?: string;
        senderEmail?: string;
        detail?: string;
        aiGenerated?: boolean;
        createdAt: string;
      }
  >(null);

  const reachRows = useMemo(() => {
    return ledger
      .filter((e) => e.kind === "reach")
      .map((e) => ({ ...e, status: getReachStatus(e, now) }));
  }, [ledger, now]);

  const counts = useMemo(() => {
    const c: Record<ReachStatus, number> = {
      pending: 0,
      in_progress: 0,
      success: 0,
      failed: 0,
    };
    for (const r of reachRows) c[r.status]++;
    return c;
  }, [reachRows]);

  const filtered = useMemo(() => {
    const k = kw.trim().toLowerCase();
    return reachRows.filter((r) => {
      if (statusTab !== "all" && r.status !== statusTab) return false;
      if (targetKind !== "all" && r.targetKind !== targetKind) return false;
      if (channel === "whatsapp") {
        if (r.channel !== "social" || r.platform !== "WhatsApp") return false;
      } else if (channel === "social") {
        if (r.channel !== "social" || r.platform === "WhatsApp") return false;
      } else if (channel !== "all" && r.channel !== channel) {
        return false;
      }
      if (!k) return true;
      return (
        r.targetName.toLowerCase().includes(k) ||
        (r.parentRef?.name ?? "").toLowerCase().includes(k) ||
        (r.detail ?? "").toLowerCase().includes(k) ||
        (r.platform ?? "").toLowerCase().includes(k)
      );
    });
  }, [reachRows, statusTab, channel, targetKind, kw]);

  useEffect(() => {
    setPage(1);
  }, [statusTab, channel, targetKind, kw]);

  const targetKindCounts = useMemo(() => {
    let ent = 0;
    let con = 0;
    for (const r of reachRows) {
      if (r.targetKind === "enterprise") ent++;
      else if (r.targetKind === "contact") con++;
    }
    return { ent, con };
  }, [reachRows]);

  const pageData = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page],
  );

  const grossCost = reachRows.reduce((s, r) => s + r.cost, 0);
  const refundTotal = reachRows
    .filter((r) => r.status === "failed")
    .reduce((s, r) => s + (isReachRefunded(r.id) ? r.cost : 0), 0);
  const netCost = grossCost - refundTotal;

  return (
    <TooltipProvider delayDuration={150}>
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>出海大数据平台</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium">触达</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => {
            if (window.confirm("将清空当前触达记录并重新加载演示数据，确认？")) {
              resetDemoLedger();
            }
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          重置演示数据
        </Button>
      </div>

      <section
        className="relative overflow-hidden rounded-2xl p-6 text-white"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Zap className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">触达</h1>
            <p className="text-white/85 text-sm mt-0.5">
              统一管理对目标企业 / 关键人物的触达动作、渠道与跟进结果
            </p>
          </div>
          <div className="text-right text-white/90">
            <div className="text-xs opacity-80">净消耗（消耗 - 退还）</div>
            <div className="text-2xl font-bold tabular-nums">
              -{netCost}
              <span className="text-sm font-normal ml-1">积分</span>
            </div>
            {refundTotal > 0 && (
              <div className="text-[11px] text-white/75 mt-0.5 tabular-nums">
                含失败退还 +{refundTotal}
              </div>
            )}
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          <Button
            asChild
            size="sm"
            variant="secondary"
            className="h-8 bg-white/15 text-white border-white/20 hover:bg-white/25"
          >
            <Link to="/outreach/reach-empty">
              <EyeOff className="h-3.5 w-3.5 mr-1.5" />
              查看空状态演示
            </Link>
          </Button>
        </div>
      </section>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={<Clock className="h-5 w-5" />}
          label={REACH_STATUS_LABEL.pending}
          value={counts.pending}
          tone="slate"
        />
        <KpiCard
          icon={<Loader2 className="h-5 w-5" />}
          label={REACH_STATUS_LABEL.in_progress}
          value={counts.in_progress}
          tone="amber"
        />
        <KpiCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label={REACH_STATUS_LABEL.success}
          value={counts.success}
          tone="emerald"
        />
        <KpiCard
          icon={<XCircle className="h-5 w-5" />}
          label={REACH_STATUS_LABEL.failed}
          value={counts.failed}
          tone="rose"
        />
      </div>

      <Card className="p-0 overflow-hidden">
        {/* Tab + filter */}
        <div className="flex items-center gap-1 border-b border-border px-5 pt-3">
          <StatusTab active={statusTab === "all"} onClick={() => setStatusTab("all")}>
            全部 <span className="ml-1 text-muted-foreground">{reachRows.length}</span>
          </StatusTab>
          {(["success", "in_progress", "pending", "failed"] as ReachStatus[]).map((s) => (
            <StatusTab key={s} active={statusTab === s} onClick={() => setStatusTab(s)}>
              {REACH_STATUS_LABEL[s]} <span className="ml-1 text-muted-foreground">{counts[s]}</span>
            </StatusTab>
          ))}
        </div>
        <div className="px-5 py-3 flex items-center gap-3 flex-wrap border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">触达渠道</span>
            <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
              <SelectTrigger className="h-9 w-[140px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部渠道</SelectItem>
                <SelectItem value="email">邮件</SelectItem>
                <SelectItem value="phone">短信</SelectItem>
                <SelectItem value="social">社媒</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">目标类型</span>
            <Select
              value={targetKind}
              onValueChange={(v) => setTargetKind(v as typeof targetKind)}
            >
              <SelectTrigger className="h-9 w-[160px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  全部（{targetKindCounts.ent + targetKindCounts.con}）
                </SelectItem>
                <SelectItem value="enterprise">
                  企业（{targetKindCounts.ent}）
                </SelectItem>
                <SelectItem value="contact">
                  人物（{targetKindCounts.con}）
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder="输入企业 / 人物 / 平台 / 明细"
              className="pl-9 h-9 bg-background"
            />
          </div>
          {(kw || channel !== "all" || statusTab !== "all" || targetKind !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setKw("");
                setChannel("all");
                setStatusTab("all");
                setTargetKind("all");
              }}
              className="gap-1"
            >
              <X className="h-3.5 w-3.5" />
              清除
            </Button>
          )}
          <div className="text-sm text-muted-foreground ml-auto">
            共 <span className="text-foreground font-semibold">{filtered.length}</span> 条
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-16 flex flex-col items-center text-center gap-3">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
              <Send className="h-7 w-7 text-muted-foreground" />
            </div>
            <div className="text-base font-medium">暂无触达记录</div>
            <div className="text-sm text-muted-foreground max-w-md">
              前往企业 / 人物详情页，针对邮箱、电话或社媒账号发起触达
            </div>
            <Button asChild variant="outline" size="sm" className="mt-2 gap-1.5">
              <Link to="/outreach/enterprise">
                <Building2 className="h-4 w-4" />
                去企业列表
              </Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/5 hover:bg-primary/5">
                <TableHead className="w-[170px]">时间</TableHead>
                <TableHead className="w-[140px]">渠道</TableHead>
                <TableHead className="w-[220px]">状态 / 原因</TableHead>
                <TableHead className="w-[90px]">积分变动</TableHead>
                <TableHead>明细说明</TableHead>
                {statusTab !== "pending" && statusTab !== "in_progress" && statusTab !== "failed" && (
                  <TableHead className="w-[110px]">回复</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageData.map((r) => (
                <TableRow key={r.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                    {fmtTime(r.createdAt)}
                  </TableCell>
                  <TableCell>
                    <ChannelBadge channel={r.channel!} platform={r.platform} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={r.status} />
                      {r.status === "failed" && r.failReason && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-[11px] text-rose-600 hover:text-rose-700"
                            >
                              <Info className="h-3 w-3" />
                              <span className="truncate max-w-[180px]">
                                {r.failReason}
                              </span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[260px]">
                            <div className="text-xs leading-relaxed">
                              <div className="font-medium">失败原因</div>
                              <div className="mt-0.5">{r.failReason}</div>
                              <div className="mt-1 text-muted-foreground">
                                已自动退还 {r.cost} 积分。
                                {!isRetryableFailReason(r.failReason) && (
                                  <> 该原因不支持重新触达，建议核实联系方式后重新发起。</>
                                )}
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    <div className="font-semibold text-rose-600">-{r.cost}</div>
                    {r.status === "failed" && isReachRefunded(r.id) && (
                      <div className="text-[11px] font-medium text-emerald-600 mt-0.5">
                        已退还 +{r.cost}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs max-w-[420px]">
                    <DetailCell row={r} onViewContent={() => setViewing(r)} />
                  </TableCell>
                  {statusTab !== "pending" && statusTab !== "in_progress" && statusTab !== "failed" && (
                    <TableCell className="text-xs">
                      <ReplyCell reach={r} thread={threadByKey.get(threadKeyFor(r) ?? "") ?? null} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {filtered.length > 0 && (
          <div className="px-5 pb-4">
            <ListPagination
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
            />
          </div>
        )}
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "trigger" && "立即触达？"}
              {confirm?.kind === "cancel" && "取消该触达？"}
              {confirm?.kind === "retry" && "重新触达？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "trigger" && (
                <>对象：<span className="font-medium text-foreground">{confirm.target}</span>。该条触达将立即进入"触达中"状态。</>
              )}
              {confirm?.kind === "cancel" && (
                <>对象：<span className="font-medium text-foreground">{confirm.target}</span>。取消后将自动退还 {reachRows.find((r) => r.id === confirm.id)?.cost ?? COST_REACH} 积分。</>
              )}
              {confirm?.kind === "retry" && (
                <>对象：<span className="font-medium text-foreground">{confirm.target}</span>。将基于原渠道与明细发起一条新的触达，并扣除 {reachRows.find((r) => r.id === confirm.id)?.cost ?? COST_REACH} 积分。</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>关闭</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                confirm?.kind === "cancel" &&
                  "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              )}
              onClick={() => {
                if (!confirm) return;
                if (confirm.kind === "trigger") {
                  if (triggerReachNow(confirm.id))
                    toast.success("已立即触达，状态切换为「触达中」");
                  else toast.error("当前状态不可执行立即触达");
                } else if (confirm.kind === "cancel") {
                  const c = reachRows.find((r) => r.id === confirm.id)?.cost ?? COST_REACH;
                  if (cancelPendingReach(confirm.id))
                    toast.success(`已取消触达，退还 ${c} 积分`);
                  else toast.error("仅「待触达」状态可取消");
                } else if (confirm.kind === "retry") {
                  const c = reachRows.find((r) => r.id === confirm.id)?.cost ?? COST_REACH;
                  if (retryFailedReach(confirm.id))
                    toast.success(`已重新触达，扣除 ${c} 积分`);
                  else toast.error("仅「触达失败」记录可重新触达");
                }
                setConfirm(null);
              }}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              发送内容
              {viewing?.aiGenerated && (
                <Badge variant="secondary" className="gap-1 font-normal">
                  <Sparkles className="h-3 w-3 text-primary" /> AI 生成
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[80px_1fr] gap-y-1.5 text-xs">
                <span className="text-muted-foreground">对象</span>
                <span className="font-medium">{viewing.targetName}</span>
                <span className="text-muted-foreground">渠道</span>
                <span>{viewing.channel === "email" ? "邮件" : viewing.channel === "phone" ? "短信" : "社媒"}</span>
                {viewing.senderEmail && (
                  <>
                    <span className="text-muted-foreground">发件箱</span>
                    <span className="font-mono">{viewing.senderEmail}</span>
                  </>
                )}
                {viewing.detail && (
                  <>
                    <span className="text-muted-foreground">收件方</span>
                    <span className="font-mono">{viewing.detail}</span>
                  </>
                )}
                <span className="text-muted-foreground">时间</span>
                <span className="font-mono">{fmtTime(viewing.createdAt)}</span>
              </div>
              {viewing.subject && (
                <div className="rounded-md border bg-muted/40 p-3">
                  <div className="text-[11px] text-muted-foreground mb-1">主题</div>
                  <div className="font-medium">{viewing.subject}</div>
                </div>
              )}
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="text-[11px] text-muted-foreground mb-1">
                  {viewing.channel === "email" ? "正文" : "内容"}
                </div>
                <div className="whitespace-pre-wrap text-foreground/90">
                  {viewing.content || "—"}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "slate" | "amber" | "emerald" | "rose";
}) {
  const toneMap = {
    slate: "bg-slate-50 text-slate-600 ring-slate-200",
    amber: "bg-amber-50 text-amber-600 ring-amber-200",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-200",
    rose: "bg-rose-50 text-rose-600 ring-rose-200",
  } as const;
  return (
    <div className="rounded-xl ring-1 ring-border bg-card p-5 flex items-center gap-4">
      <div className={cn("h-10 w-10 rounded-lg ring-1 flex items-center justify-center", toneMap[tone])}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function StatusTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ChannelBadge({ channel, platform }: { channel: ReachChannel; platform?: string }) {
  const isWhatsApp = channel === "social" && platform === "WhatsApp";
  const Icon = channel === "email" ? Mail : channel === "phone" ? Phone : isWhatsApp ? Send : Globe;
  const label = isWhatsApp ? "WhatsApp" : REACH_CHANNEL_LABEL[channel];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-xs">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="font-medium text-foreground">{label}</span>
    </span>
  );
}

function ReplyCell({
  reach,
  thread,
}: {
  reach: { channel?: ReachChannel; status: ReachStatus };
  thread: Thread | null;
}) {
  // 仅「触达成功」的邮件/短信任务有意义展示回复；其他状态与社媒渠道显示 —
  if (reach.status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title="触达进行中，暂无回复">
        <Loader2 className="h-3 w-3 animate-spin" />
        触达中
      </span>
    );
  }
  if (reach.status === "failed") {
    return <span className="text-[11px] text-muted-foreground" title="触达失败">—</span>;
  }
  if (reach.status !== "success") {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  if (reach.channel !== "email" && reach.channel !== "phone") {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  const replies = thread?.meta.inboundMessages.length ?? 0;
  if (!thread || replies === 0) {
    return (
      <Link
        to="/outreach/conversations"
        search={thread ? { tid: thread.id, view: "all" } : { view: "all" }}
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
        title="尚未收到回复，去收件箱主动跟进"
        onClick={(e) => e.stopPropagation()}
      >
        <MessageCircleReply className="h-3 w-3" />
        主动跟进
      </Link>
    );
  }
  return (
    <Link
      to="/outreach/conversations"
      search={{ tid: thread.id, view: "all" }}
      className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
      title={`客户已回复 ${replies} 条，点击进入会话`}
      onClick={(e) => e.stopPropagation()}
    >
      <MessageCircleReply className="h-3 w-3" />
      {replies > 1 ? `客户已回复 ${replies}` : "客户已回复"}
      <InboxIcon className="h-3 w-3 opacity-60" />
    </Link>
  );
}

function StatusBadge({ status }: { status: ReachStatus }) {
  const Icon =
    status === "pending"
      ? Clock
      : status === "in_progress"
        ? Loader2
        : status === "success"
          ? CheckCircle2
          : XCircle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium",
        REACH_STATUS_COLOR[status],
      )}
    >
      <Icon className={cn("h-3 w-3", status === "in_progress" && "animate-spin")} />
      {REACH_STATUS_LABEL[status]}
    </span>
  );
}

function ActionCell({
  row,
  onTrigger,
  onRetry,
  retryable = true,
}: {
  row: { id: string; status: ReachStatus };
  onTrigger: () => void;
  onRetry: () => void;
  retryable?: boolean;
}) {
  if (row.status === "pending") {
    return (
      <div className="inline-flex items-center gap-1">
        <Button
          size="sm"
          variant="default"
          className="h-7 gap-1 px-2 text-xs"
          onClick={onTrigger}
        >
          <Play className="h-3 w-3" />
          立即触达
        </Button>
      </div>
    );
  }
  if (row.status === "failed") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              size="sm"
              variant="outline"
              disabled={!retryable}
              className={cn(
                "h-7 gap-1 px-2 text-xs",
                retryable
                  ? "text-primary border-primary/40 hover:bg-primary/10"
                  : "text-muted-foreground",
              )}
              onClick={retryable ? onRetry : undefined}
            >
              <RotateCcw className="h-3 w-3" />
              重新触达
            </Button>
          </span>
        </TooltipTrigger>
        {!retryable && (
          <TooltipContent side="top" className="max-w-[220px]">
            <div className="text-xs leading-relaxed">
              该失败原因不支持重新触达，建议核实联系方式后重新发起。
            </div>
          </TooltipContent>
        )}
      </Tooltip>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

function DetailCell({
  row,
  onViewContent,
}: {
  row: {
    targetKind: "enterprise" | "contact";
    targetId: string;
    targetName: string;
    parentRef?: { id: string; name: string };
    channel?: "email" | "phone" | "social";
    platform?: string;
    detail?: string;
    subject?: string;
    content?: string;
  };
  onViewContent: () => void;
}) {
  const targetLabel =
    row.targetKind === "enterprise"
      ? row.targetName
      : `${row.parentRef?.name ?? "—"} · ${row.targetName}`;
  const link =
    row.targetKind === "enterprise"
      ? { to: "/outreach/enterprise/$id" as const, params: { id: row.targetId } }
      : (() => {
          const [entId, idx] = row.targetId.split(":");
          return {
            to: "/outreach/enterprise/$id/contact/$idx" as const,
            params: { id: entId, idx },
          };
        })();
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        {row.channel === "social" && row.platform && row.platform !== "WhatsApp" && (
          <span className="shrink-0 inline-flex items-center rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[11px] text-foreground">
            {row.platform}
          </span>
        )}
        <span className="font-mono text-xs text-foreground truncate">
          {row.detail ?? "—"}
        </span>
        {(row.subject || row.content) && (
          <button
            type="button"
            title="查看发送内容"
            onClick={onViewContent}
            className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded text-primary hover:bg-primary/10"
          >
            <FileText className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="text-[11px] text-muted-foreground truncate mt-0.5 flex items-center gap-1">
        {row.targetKind === "enterprise" ? (
          <Building2 className="h-3 w-3" />
        ) : (
          <UserRound className="h-3 w-3" />
        )}
        <Link
          to={link.to}
          params={link.params as never}
          className="capitalize hover:text-primary truncate"
        >
          {targetLabel}
        </Link>
      </div>
    </div>
  );
}