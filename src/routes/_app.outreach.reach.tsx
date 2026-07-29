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
  backfillAiGenerationEntries,
  resetDemoLedger,
  syncFailedRefunds,
  triggerReachNow,
  cancelPendingReach,
  retryFailedReach,
  isRetryableFailReason,
  REACH_STATUS_LABEL,
  REACH_STATUS_COLOR,
  REACH_CHANNEL_LABEL,
  type ReachStatus,
  type ReachChannel,
} from "@/lib/credits-ledger";
import { ListPagination } from "@/components/ListPagination";
import { useThreads, threadKeyFor, type Thread } from "@/lib/inbox-store";
import {
  Inbox as InboxIcon,
  MessageCircleReply,
  Plus,
  UserCircle2,
  Users,
  ListChecks,
  Facebook,
  Music2,
  MessageSquare,
} from "lucide-react";
import { useSocialAccounts, friendRemaining } from "@/data/social-accounts";
import { poolAverageHealth } from "@/lib/social-account-health";
import { CreateReachTaskDialog } from "@/components/outreach/CreateReachTaskDialog";

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


type TaskGroup = {
  key: string;
  name: string;
  channel: ReachChannel;
  platform?: string;
  action: string;
  total: number;
  pending: number;
  in_progress: number;
  success: number;
  failed: number;
  replies: number;
  aiGenerated: boolean;
  createdAt: string;
  lastAt: string;
};

function groupKeyOf(r: { channel?: ReachChannel; platform?: string; subject?: string; detail?: string; createdAt: string }) {
  const day = r.createdAt.slice(0, 10);
  const batchName = r.channel === "social" && r.subject ? r.subject : null;
  return batchName
    ? `s:${batchName}:${r.platform ?? ""}`
    : `c:${r.channel}:${r.platform ?? ""}:${reachAction(r)}:${day}`;
}

/** 从明细中提取触达动作：社媒区分「加好友 / 私信」，其余按渠道语义 */
function reachAction(r: { channel?: ReachChannel; detail?: string; platform?: string }) {
  const d = r.detail ?? "";
  if (d.includes("加好友")) return "加好友";
  if (r.channel === "social") return "私信";
  if (r.channel === "email") return "邮件触达";
  if (r.channel === "phone") return "短信触达";
  return "触达";
}

function ReachPage() {
  useEffect(() => {
    seedDemoLedgerIfEmpty();
    backfillAiGenerationEntries();
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
  const [createOpen, setCreateOpen] = useState(false);
  const [view, setView] = useState<"task" | "record">("task");
  const [taskKey, setTaskKey] = useState<string | null>(null);
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
      .map((e) => ({ ...e, status: getReachStatus(e, now) }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
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
  }, [statusTab, channel, targetKind, kw, view, taskKey]);

  const targetKindCounts = useMemo(() => {
    let ent = 0;
    let con = 0;
    for (const r of reachRows) {
      if (r.targetKind === "enterprise") ent++;
      else if (r.targetKind === "contact") con++;
    }
    return { ent, con };
  }, [reachRows]);

  const recordRows = useMemo(
    () => (taskKey ? filtered.filter((r) => groupKeyOf(r) === taskKey) : filtered),
    [filtered, taskKey],
  );

  const pageData = useMemo(
    () => recordRows.slice((page - 1) * pageSize, page * pageSize),
    [recordRows, page],
  );

  // 社媒账号池运营指标（替代原积分口径，突出触达任务本身的执行能力）
  const accounts = useSocialAccounts();
  const fbRemain = friendRemaining(accounts, "Facebook");
  const ttRemain = friendRemaining(accounts, "TikTok");
  const poolHealth = poolAverageHealth(accounts);
  const usableAccounts = accounts.filter((a) => a.status === "正常").length;

  const doneTotal = counts.success + counts.failed;
  const successRate = doneTotal === 0 ? 0 : Math.round((counts.success / doneTotal) * 100);
  const replyTotal = useMemo(
    () =>
      reachRows.reduce((n, r) => {
        const t = threadByKey.get(threadKeyFor(r) ?? "");
        return n + (t?.meta.inboundMessages.length ?? 0);
      }, 0),
    [reachRows, threadByKey],
  );

  // 任务视图：把逐条触达记录按「任务」聚合（社媒批量任务按任务名聚合，其余按渠道 + 动作 + 日期聚合）
  const taskGroups = useMemo(() => {
    const map = new Map<string, TaskGroup>();
    for (const r of filtered) {
      const action = reachAction(r);
      const day = r.createdAt.slice(0, 10);
      // 批量创建的触达任务按任务名聚合；单条触达按「渠道 + 平台 + 动作 + 日期」归入当日任务
      const batchName = r.channel === "social" && r.subject ? r.subject : null;
      const key = groupKeyOf(r);
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          name:
            batchName ??
            (r.platform ? `${r.platform}${action}` : action) + ` · ${day.slice(5)}`,
          channel: r.channel!,
          platform: r.platform,
          action,
          total: 0,
          pending: 0,
          in_progress: 0,
          success: 0,
          failed: 0,
          replies: 0,
          aiGenerated: false,
          createdAt: r.createdAt,
          lastAt: r.createdAt,
        };
        map.set(key, g);
      }
      g.total++;
      g[r.status]++;
      if (r.aiGenerated) g.aiGenerated = true;
      const t = threadByKey.get(threadKeyFor(r) ?? "");
      g.replies += t?.meta.inboundMessages.length ?? 0;
      if (r.createdAt < g.createdAt) g.createdAt = r.createdAt;
      if (r.createdAt > g.lastAt) g.lastAt = r.createdAt;
    }
    return [...map.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  }, [filtered, threadByKey]);

  const taskPageData = useMemo(
    () => taskGroups.slice((page - 1) * pageSize, page * pageSize),
    [taskGroups, page],
  );


  return (
    <TooltipProvider delayDuration={150}>
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>出海大数据平台</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium">客户触达</span>
        </div>
        <div className="flex items-center gap-2">
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
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            创建触达任务
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/outreach/social/accounts">
              <UserCircle2 className="h-3.5 w-3.5" />
              我的账号
            </Link>
          </Button>
        </div>
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
          <div className="flex items-center gap-5 text-right text-white/90">
            <div>
              <div className="text-xs opacity-80">触达总数</div>
              <div className="text-2xl font-bold tabular-nums">{reachRows.length}</div>
            </div>
            <div>
              <div className="text-xs opacity-80">触达成功率</div>
              <div className="text-2xl font-bold tabular-nums">{successRate}%</div>
            </div>
            <div>
              <div className="text-xs opacity-80">客户回复</div>
              <div className="text-2xl font-bold tabular-nums">{replyTotal}</div>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-white/85">
          <span className="inline-flex items-center gap-1">
            <Facebook className="h-3.5 w-3.5" />
            Facebook 今日加友剩余
            <span className="font-semibold tabular-nums">{fbRemain}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Music2 className="h-3.5 w-3.5" />
            TikTok 今日加友剩余
            <span className="font-semibold tabular-nums">{ttRemain}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            账号池平均健康度
            <span className="font-semibold tabular-nums">{poolHealth}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            可用社媒账号
            <span className="font-semibold tabular-nums">{usableAccounts}</span>
          </span>
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
          <div className="ml-auto mb-2 inline-flex rounded-md border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => {
                setView("task");
                setTaskKey(null);
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                view === "task"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ListChecks className="h-3.5 w-3.5" />
              任务视图
            </button>
            <button
              type="button"
              onClick={() => setView("record")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                view === "record"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Users className="h-3.5 w-3.5" />
              记录视图
            </button>
          </div>
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
          {taskKey && view === "record" && (
            <Badge variant="secondary" className="gap-1 font-normal">
              任务：{taskGroups.find((g) => g.key === taskKey)?.name ?? "已选任务"}
              <button type="button" onClick={() => setTaskKey(null)} className="ml-1">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {(kw || channel !== "all" || statusTab !== "all" || targetKind !== "all" || taskKey) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setKw("");
                setChannel("all");
                setStatusTab("all");
                setTargetKind("all");
                setTaskKey(null);
              }}
              className="gap-1"
            >
              <X className="h-3.5 w-3.5" />
              清除
            </Button>
          )}
          <div className="text-sm text-muted-foreground ml-auto">
            共{" "}
            <span className="text-foreground font-semibold">
              {view === "task" ? taskGroups.length : recordRows.length}
            </span>{" "}
            {view === "task" ? "个任务" : "条记录"}
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
        ) : view === "task" ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/5 hover:bg-primary/5">
                <TableHead className="min-w-[220px]">任务名</TableHead>
                <TableHead className="w-[150px]">渠道 / 平台</TableHead>
                <TableHead className="w-[90px]">动作</TableHead>
                <TableHead className="w-[80px]">目标数</TableHead>
                <TableHead className="w-[260px]">执行进度</TableHead>
                <TableHead className="w-[90px]">成功率</TableHead>
                <TableHead className="w-[90px]">回复</TableHead>
                <TableHead className="w-[170px]">最近执行</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {taskPageData.map((g) => (
                <TableRow
                  key={g.key}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={() => {
                    setTaskKey(g.key);
                    setView("record");
                  }}
                  title="点击查看该任务下的触达记录"
                >
                  <TableCell className="max-w-[280px]">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{g.name}</span>
                      {g.aiGenerated && (
                        <Badge variant="secondary" className="gap-1 font-normal shrink-0">
                          <Sparkles className="h-3 w-3 text-primary" />
                          AI
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      创建于 {fmtTime(g.createdAt)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ChannelBadge channel={g.channel} platform={g.platform} />
                  </TableCell>
                  <TableCell className="text-xs">
                    <span className="inline-flex items-center gap-1">
                      {g.action === "加好友" ? (
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {g.action}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums font-semibold">{g.total}</TableCell>
                  <TableCell>
                    <TaskProgress group={g} />
                  </TableCell>
                  <TableCell className="tabular-nums text-sm font-semibold">
                    {g.success + g.failed === 0
                      ? "—"
                      : `${Math.round((g.success / (g.success + g.failed)) * 100)}%`}
                  </TableCell>
                  <TableCell className="tabular-nums text-sm">
                    {g.replies > 0 ? (
                      <span className="text-emerald-600 font-semibold">{g.replies}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                    {fmtTime(g.lastAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/5 hover:bg-primary/5">
                <TableHead className="w-[170px]">时间</TableHead>
                <TableHead className="w-[140px]">渠道</TableHead>
                <TableHead className="w-[220px]">状态 / 原因</TableHead>
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
              total={view === "task" ? taskGroups.length : recordRows.length}
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
                <>对象：<span className="font-medium text-foreground">{confirm.target}</span>。取消后该条触达将不再执行。</>
              )}
              {confirm?.kind === "retry" && (
                <>对象：<span className="font-medium text-foreground">{confirm.target}</span>。将基于原渠道与明细重新发起一条触达。</>
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
                  if (cancelPendingReach(confirm.id)) toast.success("已取消触达");
                  else toast.error("仅「待触达」状态可取消");
                } else if (confirm.kind === "retry") {
                  if (retryFailedReach(confirm.id)) toast.success("已重新发起触达");
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
      <CreateReachTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
    </TooltipProvider>
  );
}

function TaskProgress({ group }: { group: TaskGroup }) {
  const segs = [
    { n: group.success, cls: "bg-emerald-500", label: REACH_STATUS_LABEL.success },
    { n: group.in_progress, cls: "bg-amber-500", label: REACH_STATUS_LABEL.in_progress },
    { n: group.pending, cls: "bg-slate-300", label: REACH_STATUS_LABEL.pending },
    { n: group.failed, cls: "bg-rose-500", label: REACH_STATUS_LABEL.failed },
  ].filter((x) => x.n > 0);
  return (
    <div className="space-y-1">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {segs.map((x) => (
          <div
            key={x.label}
            className={x.cls}
            style={{ width: `${(x.n / group.total) * 100}%` }}
            title={`${x.label} ${x.n}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
        {segs.map((x) => (
          <span key={x.label} className="inline-flex items-center gap-1">
            <span className={cn("h-1.5 w-1.5 rounded-full", x.cls)} />
            {x.label} <span className="tabular-nums text-foreground">{x.n}</span>
          </span>
        ))}
      </div>
    </div>
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
  // 社媒平台（Facebook / TikTok）触达目标为社媒账号，无 CRM 企业 / 人物明细，不提供跳转
  const isSocialNoLink =
    row.channel === "social" &&
    (row.platform === "Facebook" || row.platform === "TikTok");
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
      {!isSocialNoLink && (
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
      )}
    </div>
  );
}