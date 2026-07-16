import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  Inbox as InboxIcon,
  Search,
  Sparkles,
  Send,
  Clock,
  CheckCheck,
  Ban,
  Repeat,
  Star,
  MoreHorizontal,
  Tag,
  ListTodo,
  UserPlus,
  ChevronRight,
  Building2,
  UserRound,
  Eye,
  MailOpen,
  MousePointerClick,
  Loader2,
  RefreshCw,
  MessageCircleReply,
  Mail,
  MessageSquare,
  MessageCircle,
  Facebook,
  Music2,
  Send as SendIcon,
  ShieldAlert,
  UserCheck,
  Hand,
  Zap,
  Pin,
  AlarmClock,
  ChevronDown as ChevronDownIcon,
  FileText,
  History,
  User as UserIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";
import {
  useThreads,
  useInboxCounts,
  markThreadRead,
  snoozeThread,
  closeThread,
  reopenThread,
  toggleStar,
  enrollCadence,
  suppressThread,
  setHumanTakeover,
  addTag,
  addTaskForThread,
  updateIntent,
  sendReply,
  SNOOZE_PRESETS,
  INTENT_LABEL,
  INTENT_COLOR,
  STATUS_LABEL,
  type Thread,
  type AiIntent,
  type Channel,
  type GroupKind,
  CHANNEL_LABEL,
  CHANNEL_COLOR,
  WINDOW_HOURS,
  GROUP_LABEL,
  TEAM_MEMBERS,
  memberById,
  threadGroup,
  assignThread,
  previousAssigneeIds,
  slaInfo,
} from "@/lib/inbox-store";
import { generateAiContent } from "@/lib/api/ai-compose.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getApprovedSmsTemplates } from "@/lib/sms-templates-store";
import { getAllLedger } from "@/lib/credits-ledger";
import { IntentScorePanel } from "@/components/outreach/IntentScorePanel";
import { scoreIntent } from "@/lib/ai-intent-score";
import { Target as TargetIcon, PanelRightClose, PanelRightOpen } from "lucide-react";

/** 邮件场景的快捷回复模板（Phase 1 hardcoded） */
const EMAIL_QUICK_REPLIES: { id: string; name: string; body: string }[] = [
  {
    id: "eq_thanks",
    name: "致谢 · 确认收到",
    body: "Hi,\n\nThanks for your reply — noted with thanks. I'll get back to you shortly with the details.\n\nBest regards,",
  },
  {
    id: "eq_quote",
    name: "报价 · 请提供需求",
    body: "Hi,\n\nHappy to prepare a formal quote. Could you share:\n1) Target SKUs / quantities\n2) Destination port & Incoterm\n3) Expected shipment date\n\nBest,",
  },
  {
    id: "eq_meeting",
    name: "邀约 · 30 分钟电话",
    body: "Hi,\n\nWould you have 30 minutes this week for a quick call? Please share 2-3 slots that work for you and I'll confirm.\n\nBest,",
  },
  {
    id: "eq_followup",
    name: "跟进 · 二次触达",
    body: "Hi,\n\nJust following up on my previous email — let me know if you'd like more information or a sample.\n\nBest,",
  },
];

const searchSchema = z.object({
  view: z
    .enum([
      "unread",
      "pending",
      "waiting",
      "all",
      "hasReply",
      "noReply",
      "won",
      "lost",
      "snoozed",
      "suppressed",
      "unassigned",
      "mine",
      "my_todo",
      "due_soon",
      "high_intent",
      "needs_human",
    ])
    .optional(),
  ch: z
    .enum(["all", "email", "sms", "whatsapp", "telegram", "facebook", "tiktok"])
    .optional(),
  group: z.enum(["all", "enterprise", "contact"]).optional(),
  tid: z.string().optional(),
  q: z.string().optional(),
  /** 意向档位过滤：高/中/低/全部（左侧列表顶部 Tab） */
  intent: z.enum(["all", "high", "mid", "low"]).optional(),
  // 从"最新沟通"胶囊中的"AI 回复"进入时，自动生成一条 AI 草稿。
  action: z.enum(["ai"]).optional(),
});

/** 演示环境的"当前登录员工"（Phase 1 mock，见 TEAM_MEMBERS） */
const CURRENT_TEAM_USER_ID = "u_zhang";

function channelIcon(ch: Channel) {
  switch (ch) {
    case "email":
      return Mail;
    case "sms":
      return MessageSquare;
    case "whatsapp":
      return MessageCircle;
    case "telegram":
      return SendIcon;
    case "facebook":
      return Facebook;
    case "tiktok":
      return Music2;
  }
}

/** WhatsApp / Facebook HSM 演示模板 */
const HSM_TEMPLATES: Record<string, { id: string; name: string; body: string }[]> = {
  whatsapp: [
    { id: "wa_hello", name: "welcome_intro", body: "Hi {{1}}, thanks for reaching out to us earlier. Would this be a good time to continue our conversation?" },
    { id: "wa_quote", name: "quote_followup", body: "Hi {{1}}, following up on the quote we shared for {{2}}. Let me know if you'd like to schedule a call." },
  ],
  facebook: [
    { id: "fb_update", name: "CONFIRMED_EVENT_UPDATE", body: "Reminder: your appointment on {{1}} is confirmed." },
  ],
};

type ViewKey = NonNullable<z.infer<typeof searchSchema>["view"]>;

const VIEW_LABEL: Record<ViewKey, string> = {
  my_todo: "我的待办",
  due_soon: "即将超时",
  unassigned: "未分配",
  unread: "未读",
  mine: "我的全部",
  pending: "待我回复",
  waiting: "等客回复",
  snoozed: "稍后处理",
  won: "已成交",
  lost: "已流失",
  suppressed: "已退订",
  hasReply: "有回复",
  noReply: "未回复",
  all: "全部",
  high_intent: "高意向",
  needs_human: "人工接管",
};
function viewLabel(v: ViewKey) {
  return VIEW_LABEL[v] ?? "全部";
}

export const Route = createFileRoute("/_app/outreach/conversations")({
  head: () => ({
    meta: [{ title: "询盘与回复 | 出海大数据平台" }],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  component: InboxPage,
});

function InboxPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const threads = useThreads();
  const counts = useInboxCounts();
  // 智能视图计数（前端派生，避免修改 store）
  const smartCounts = useMemo(() => {
    let myTodo = 0;
    let dueSoon = 0;
    let mine = 0;
    for (const t of threads) {
      if (t.meta.assigneeId === CURRENT_TEAM_USER_ID) {
        mine++;
        if (t.meta.status === "pending" || t.meta.status === "snoozed") myTodo++;
      }
      const s = slaInfo(t);
      if (s && (s.overdue || s.approaching)) dueSoon++;
    }
    return { myTodo, dueSoon, mine };
  }, [threads]);
  // 按标签维度的计数（用于中栏顶部的标签筛选条）
  const intentCounts = useMemo(() => {
    let high = 0;
    let needsHuman = 0;
    let mid = 0;
    let low = 0;
    for (const t of threads) {
      const band = scoreIntent(t).band;
      if (band === "high") high++;
      else if (band === "mid") mid++;
      else low++;
      if (!t.meta.humanTakeover) {
        const sla = slaInfo(t);
        if (
          t.meta.aiIntent === "complaint" ||
          t.meta.aiIntent === "unsubscribe" ||
          !t.meta.assigneeId ||
          (sla && sla.overdue)
        ) {
          needsHuman++;
        }
      }
    }
    return { high, mid, low, needsHuman };
  }, [threads]);
  // 从企业/联系人详情等入口带 tid 直接进入时，默认使用 “全部” 视图，
  // 避免出现「右侧展示了会话，中间列表却提示"该视图下暂无会话"」的错位。
  const view: ViewKey = search.view ?? "all";
  const intent = search.intent ?? "all";
  const [scorePanelOpen, setScorePanelOpen] = useState(true);
  const q = search.q ?? "";
  const ch = search.ch ?? "all";
  const group = search.group ?? "all";

  const filtered = useMemo(() => {
    let list = threads;
    if (ch !== "all") list = list.filter((t) => t.channel === ch);
    if (group !== "all") list = list.filter((t) => threadGroup(t) === group);
    if (intent !== "all")
      list = list.filter((t) => scoreIntent(t).band === intent);
    if (view === "unread") list = list.filter((t) => t.meta.unread > 0);
    else if (view === "pending")
      list = list.filter((t) => t.meta.status === "pending");
    else if (view === "hasReply")
      list = list.filter((t) => t.meta.inboundMessages.length > 0);
    else if (view === "noReply")
      list = list.filter((t) => t.meta.inboundMessages.length === 0);
    else if (view === "won")
      list = list.filter((t) => t.meta.status === "won");
    else if (view === "lost")
      list = list.filter((t) => t.meta.status === "lost");
    else if (view === "waiting")
      list = list.filter((t) => t.meta.status === "waiting_reply");
    else if (view === "snoozed")
      list = list.filter((t) => t.meta.status === "snoozed");
    else if (view === "suppressed")
      list = list.filter((t) => t.meta.status === "suppressed");
    else if (view === "unassigned")
      list = list.filter((t) => !t.meta.assigneeId);
    else if (view === "mine")
      list = list.filter((t) => t.meta.assigneeId === CURRENT_TEAM_USER_ID);
    else if (view === "my_todo")
      list = list.filter(
        (t) =>
          t.meta.assigneeId === CURRENT_TEAM_USER_ID &&
          (t.meta.status === "pending" || t.meta.status === "snoozed"),
      );
    else if (view === "due_soon")
      list = list.filter((t) => {
        const s = slaInfo(t);
        return !!s && (s.overdue || s.approaching);
      });
    else if (view === "high_intent")
      list = list.filter((t) => scoreIntent(t).band === "high");
    else if (view === "needs_human")
      list = list.filter(
        (t) => {
          if (t.meta.humanTakeover) return false;
          const sla = slaInfo(t);
          return (
            t.meta.aiIntent === "complaint" ||
            t.meta.aiIntent === "unsubscribe" ||
            !t.meta.assigneeId ||
            (!!sla && sla.overdue)
          );
        },
      );
    if (q.trim()) {
      const kw = q.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.targetName.toLowerCase().includes(kw) ||
          t.counterpartyAddress.toLowerCase().includes(kw) ||
          t.messages.some(
            (m) =>
              m.subject?.toLowerCase().includes(kw) ||
              m.content.toLowerCase().includes(kw),
          ),
      );
    }
    return list;
  }, [threads, view, q, ch, intent]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  void group;

  const currentId = search.tid ?? filtered[0]?.id;
  const current = threads.find((t) => t.id === currentId);

  // 保险：如果通过 tid 打开的会话不在当前筛选视图内，则把它并入中栏列表，
  // 保持右侧详情与左侧列表的一致性。
  const displayList = useMemo(() => {
    if (current && !filtered.some((t) => t.id === current.id)) {
      return [current, ...filtered];
    }
    return filtered;
  }, [filtered, current]);

  // 打开会话即标记已读
  useEffect(() => {
    if (current && current.meta.unread > 0) markThreadRead(current.id);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function goto(patch: Partial<z.infer<typeof searchSchema>>) {
    navigate({
      to: "/outreach/conversations",
      search: { ...search, ...patch },
      replace: true,
    });
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* 顶栏 */}
      <div className="h-12 px-4 border-b flex items-center gap-2 shrink-0">
        <InboxIcon className="h-4 w-4 text-primary shrink-0" />
        <div className="font-semibold text-sm shrink-0">
          询盘与回复
          <span className="ml-1 text-muted-foreground font-normal">({counts.all})</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[11px] text-muted-foreground">
          {counts.unread > 0 && (
            <>
              <span className="text-border">|</span>
              <button
                onClick={() => goto({ view: "unread", tid: undefined })}
                className={cn(
                  "inline-flex items-center gap-1 transition-colors hover:text-rose-700",
                  view === "unread" ? "text-rose-700 font-medium" : "",
                )}
                title="点击查看未读会话"
              >
                未读 <span className="tabular-nums">{counts.unread}</span>
              </button>
            </>
          )}
          {smartCounts.dueSoon > 0 && (
            <>
              <span className="text-border">|</span>
              <button
                onClick={() => goto({ view: "due_soon", tid: undefined })}
                className={cn(
                  "inline-flex items-center gap-1 transition-colors hover:text-amber-700",
                  view === "due_soon" ? "text-amber-700 font-medium" : "",
                )}
                title="点击查看即将超时会话"
              >
                即将超时 <span className="tabular-nums">{smartCounts.dueSoon}</span>
                <AlarmClock className="h-3 w-3 text-amber-600" />
              </button>
            </>
          )}
        </div>
        {/* 统一筛选面板：渠道 / 类型 / 状态 / 搜索 */}
        <div className="ml-2 flex items-center gap-1.5 shrink-0">
          <Select value={ch} onValueChange={(v) => goto({ ch: v as typeof ch, tid: undefined })}>
            <SelectTrigger className="h-8 text-xs w-[128px]">
              <SelectValue placeholder="渠道" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">渠道：全部</SelectItem>
              <SelectItem value="email">邮件</SelectItem>
              <SelectItem value="sms">短信</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="telegram">Telegram</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={group}
            onValueChange={(v) => goto({ group: v as typeof group, tid: undefined })}
          >
            <SelectTrigger className="h-8 text-xs w-[112px]">
              <SelectValue placeholder="类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">类型：全部</SelectItem>
              <SelectItem value="enterprise">企业</SelectItem>
              <SelectItem value="contact">人物</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={view}
            onValueChange={(v) => goto({ view: v as ViewKey, tid: undefined })}
          >
            <SelectTrigger className="h-8 text-xs w-[140px]">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">状态：全部（{counts.all}）</SelectItem>
              <SelectGroup>
                <SelectLabel>生命周期</SelectLabel>
                <SelectItem value="pending">待我回复（{counts.pending}）</SelectItem>
                <SelectItem value="waiting">等客回复（{counts.waiting}）</SelectItem>
                <SelectItem value="snoozed">稍后处理（{counts.snoozed}）</SelectItem>
                <SelectItem value="won">已成交（{counts.won}）</SelectItem>
                <SelectItem value="lost">已流失（{counts.lost}）</SelectItem>
                {counts.suppressed > 0 && (
                  <SelectItem value="suppressed">已退订（{counts.suppressed}）</SelectItem>
                )}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>智能视图</SelectLabel>
                {counts.unread > 0 && (
                  <SelectItem value="unread">未读（{counts.unread}）</SelectItem>
                )}
                {intentCounts.needsHuman > 0 && (
                  <SelectItem value="needs_human">人工接管（{intentCounts.needsHuman}）</SelectItem>
                )}
                {smartCounts.dueSoon > 0 && (
                  <SelectItem value="due_soon">即将超时（{smartCounts.dueSoon}）</SelectItem>
                )}
                {smartCounts.myTodo > 0 ? (
                  <SelectItem value="my_todo">我的待办（{smartCounts.myTodo}）</SelectItem>
                ) : smartCounts.mine > 0 ? (
                  <SelectItem value="mine">我负责的（{smartCounts.mine}）</SelectItem>
                ) : null}
                {smartCounts.myTodo > 0 && smartCounts.mine > smartCounts.myTodo && (
                  <SelectItem value="mine">我负责的（{smartCounts.mine}）</SelectItem>
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-0 max-w-xs relative ml-1">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => goto({ q: e.target.value })}
            placeholder="搜索企业 / 联系人 / 内容"
            className="pl-7 h-8 text-xs"
          />
        </div>
      </div>
      <div className="flex-1 flex min-h-0">
        {/* 中栏：会话列表 */}
        <div className="w-[320px] xl:w-[380px] shrink-0 border-r flex flex-col min-h-0">
          {/* 意向档位 Tab：全部 / 高 / 中 / 低 —— 与右侧 AI 意向评分同源 */}
          <div className="px-2 pt-2 pb-1.5 border-b shrink-0 flex items-center gap-1">
            {(
              [
                { key: "all", label: "全部", count: counts.all, dot: "bg-muted-foreground/40", active: "bg-foreground text-background" },
                { key: "high", label: "高意向", count: intentCounts.high, dot: "bg-emerald-500", active: "bg-emerald-500 text-white" },
                { key: "mid", label: "中意向", count: intentCounts.mid, dot: "bg-sky-500", active: "bg-sky-500 text-white" },
                { key: "low", label: "低意向", count: intentCounts.low, dot: "bg-slate-400", active: "bg-slate-500 text-white" },
              ] as const
            ).map((tab) => {
              const isActive = intent === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() =>
                    goto({
                      intent: tab.key === "all" ? undefined : tab.key,
                      tid: undefined,
                    })
                  }
                  className={cn(
                    "flex-1 h-7 rounded-md text-[11px] inline-flex items-center justify-center gap-1 transition-colors border",
                    isActive
                      ? `${tab.active} border-transparent`
                      : "bg-background text-muted-foreground border-border hover:bg-muted/60",
                  )}
                >
                  {!isActive && <span className={cn("h-1.5 w-1.5 rounded-full", tab.dot)} />}
                  <span>{tab.label}</span>
                  <span className="tabular-nums opacity-90">{tab.count}</span>
                </button>
              );
            })}
          </div>
          {/* 结果条：显示当前筛选与匹配数量 */}
          <div className="px-3 py-2 border-b bg-muted/20 shrink-0 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              显示结果：
              <span className="text-foreground font-medium tabular-nums mx-1">
                {displayList.length}
              </span>
              条会话
            </span>
            {(view !== "all" || ch !== "all" || group !== "all" || q || intent !== "all") && (
              <button
                onClick={() =>
                  goto({ view: "all", ch: "all", group: "all", q: "", intent: undefined, tid: undefined })
                }
                className="text-primary hover:underline"
              >
                清除筛选
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {displayList.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                该视图下暂无会话
              </div>
            ) : (
              displayList.map((t) => (
                <ThreadRow
                  key={t.id}
                  thread={t}
                  active={t.id === currentId}
                  onClick={() => goto({ tid: t.id })}
                />
              ))
            )}
          </div>
        </div>

        {/* 右栏：会话详情 */}
        <div className="flex-1 min-w-0 flex bg-background">
          <div className="flex-1 min-w-0 overflow-y-auto">
            {current ? (
              <ThreadDetail
                thread={current}
                autoAi={search.action === "ai"}
                onConsumeAction={() =>
                  navigate({
                    to: "/outreach/conversations",
                    search: { ...search, action: undefined },
                    replace: true,
                  })
                }
                scorePanelOpen={scorePanelOpen}
                onToggleScorePanel={() => setScorePanelOpen((v) => !v)}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                选择左侧一个会话查看详情
              </div>
            )}
          </div>
          {current && scorePanelOpen && (
            <aside className="hidden lg:flex w-[300px] xl:w-[320px] shrink-0 border-l bg-muted/10 flex-col min-h-0">
              <IntentScorePanel thread={current} />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

function relTime(iso: string) {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return "刚刚";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(diff / 3_600_000);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(diff / 86_400_000);
  if (day < 30) return `${day} 天前`;
  return formatDateTime(iso).slice(0, 10);
}

function ThreadRow({
  thread,
  active,
  onClick,
}: {
  thread: Thread;
  active: boolean;
  onClick: () => void;
}) {
  const isUnread = thread.meta.unread > 0;
  const isPending = thread.meta.status === "pending";
  const last = thread.messages[thread.messages.length - 1];
  const sla = slaInfo(thread);
  const woken =
    thread.meta.wokenAt &&
    Date.now() - new Date(thread.meta.wokenAt).getTime() < 24 * 3600_000;
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b hover:bg-muted/40 transition-colors block",
        active && "bg-primary/5 border-l-2 border-l-primary",
        !active && isUnread && "border-l-2 border-l-rose-500 bg-rose-50/40",
        !active && !isUnread && isPending && "border-l-2 border-l-amber-400 bg-amber-50/30",
        woken && "bg-amber-50/60",
      )}
    >
      <div className="flex items-start gap-2">
        <div
          className={cn(
            "mt-1 h-1.5 w-1.5 rounded-full shrink-0",
            isUnread ? "bg-rose-500" : "bg-transparent",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-sm truncate",
                isUnread ? "font-semibold" : "font-medium",
              )}
            >
              {thread.targetName}
            </span>
            {(isUnread || isPending) && (
              <Badge
                className={cn(
                  "h-4 py-0 px-1.5 text-[10px] font-medium shrink-0 whitespace-nowrap",
                  isUnread
                    ? "bg-rose-500 hover:bg-rose-500 text-white"
                    : "bg-amber-500 hover:bg-amber-500 text-white",
                )}
              >
                {isUnread ? "待我回复" : "跟进中"}
              </Badge>
            )}
            {thread.parentRef && (
              <span className="text-[11px] text-muted-foreground truncate">
                · {thread.parentRef.name}
              </span>
            )}
            {woken && (
              <Badge className="text-[10px] py-0 px-1 h-4 bg-amber-500 hover:bg-amber-500">
                已唤醒
              </Badge>
            )}
            {thread.meta.humanTakeover && (
              <Badge
                className="h-4 py-0 px-1.5 text-[10px] font-medium shrink-0 whitespace-nowrap bg-sky-500 hover:bg-sky-500 text-white gap-0.5"
                title={`已由 ${thread.meta.humanTakeover.byName} 接管`}
              >
                <Hand className="h-2.5 w-2.5" /> 接管中
              </Badge>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground shrink-0">
              {relTime(thread.lastAt)}
            </span>
          </div>
          {last?.subject && (
            <div className="mt-0.5 text-xs text-muted-foreground truncate">
              {last.subject}
            </div>
          )}
          <div className="mt-1 text-xs text-foreground/70 line-clamp-2">
            <span
              className={cn(
                "inline mr-1 text-[10px] px-1 py-0.5 rounded border",
                thread.lastDirection === "outbound"
                  ? "bg-slate-50 text-slate-600 border-slate-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200",
              )}
            >
              {thread.lastDirection === "outbound" ? "我" : "TA"}
            </span>
            {thread.lastPreview}
          </div>
          {/* 精简徽标行：只保留 1 枚最高优先级状态标签 + 渠道图标 */}
          <div className="mt-1.5 flex items-center gap-1.5 text-muted-foreground">
            {(() => {
              const CI = channelIcon(thread.channel);
              return (
                <CI
                  className="h-3 w-3 shrink-0"
                  aria-label={CHANNEL_LABEL[thread.channel]}
                />
              );
            })()}
            <span className="text-[10px]">{CHANNEL_LABEL[thread.channel]}</span>
            {(() => {
              const band = scoreIntent(thread).band;
              if (band === "high") {
                return (
                  <Badge className="h-4 py-0 px-1.5 text-[10px] bg-emerald-500 hover:bg-emerald-500 text-white gap-0.5">
                    <Sparkles className="h-2.5 w-2.5" />
                    高意向
                  </Badge>
                );
              }
              if (band === "mid") {
                return (
                  <Badge
                    variant="outline"
                    className="h-4 py-0 px-1.5 text-[10px] bg-sky-50 text-sky-700 border-sky-200 gap-0.5"
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                    中意向
                  </Badge>
                );
              }
              return null;
            })()}
            {(() => {
              // 单一优先级徽标：逾期 > 即将超时 > 高意向 > 接管中 > 未分配
              if (sla?.overdue) {
                return (
                  <Badge className="ml-auto h-4 py-0 px-1.5 text-[10px] bg-rose-500 hover:bg-rose-500 text-white gap-0.5">
                    <AlarmClock className="h-2.5 w-2.5" />
                    逾期 {formatShort(-sla.leftMs)}
                  </Badge>
                );
              }
              if (sla?.approaching) {
                return (
                  <Badge className="ml-auto h-4 py-0 px-1.5 text-[10px] bg-amber-500 hover:bg-amber-500 text-white gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    即将超时 {formatShort(sla.leftMs)}
                  </Badge>
                );
              }
              if (thread.meta.humanTakeover) {
                return null; // humanTakeover 已在标题行显示"接管中"
              }
              if (!thread.meta.assigneeId) {
                return (
                  <Badge
                    variant="outline"
                    className="ml-auto h-4 py-0 px-1.5 text-[10px] bg-amber-50 text-amber-700 border-amber-200"
                  >
                    未分配
                  </Badge>
                );
              }
              return (
                <span className="ml-auto text-[10px] inline-flex items-center gap-0.5">
                  <UserCheck className="h-2.5 w-2.5" />
                  {memberById(thread.meta.assigneeId)?.name}
                </span>
              );
            })()}
          </div>
        </div>
      </div>
    </button>
  );
}

function ThreadDetail({
  thread,
  autoAi,
  onConsumeAction,
  scorePanelOpen,
  onToggleScorePanel,
}: {
  thread: Thread;
  autoAi?: boolean;
  onConsumeAction?: () => void;
  scorePanelOpen?: boolean;
  onToggleScorePanel?: () => void;
}) {
  const [reply, setReply] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedTpl, setSelectedTpl] = useState<string>("");
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const draftKey = `boo:inbox:draft:${thread.id}`;
  // 切换会话：从 localStorage 恢复该会话的草稿
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const j = JSON.parse(raw) as { content?: string; savedAt?: string };
        setReply(j.content ?? "");
        setDraftSavedAt(j.savedAt ?? null);
      } else {
        setReply("");
        setDraftSavedAt(null);
      }
    } catch {
      setReply("");
      setDraftSavedAt(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);
  // 草稿自动保存（1.2s 防抖）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = window.setTimeout(() => {
      if (reply.trim()) {
        const savedAt = new Date().toISOString();
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({ content: reply, savedAt }),
        );
        setDraftSavedAt(savedAt);
      } else {
        window.localStorage.removeItem(draftKey);
        setDraftSavedAt(null);
      }
    }, 1200);
    return () => window.clearTimeout(h);
  }, [reply, draftKey]);
  const lastInbound = [...thread.messages]
    .reverse()
    .find((m) => m.direction === "inbound");

  // 窗口计算（WA/FB/TT）
  const winInfo = useMemo(() => {
    const winH = WINDOW_HOURS[thread.channel];
    if (winH === undefined) return null;
    const exp = thread.meta.windowExpiresAt
      ? new Date(thread.meta.windowExpiresAt).getTime()
      : null;
    if (!exp) return { winH, leftMs: winH * 3600_000, closed: false };
    const leftMs = exp - Date.now();
    return { winH, leftMs, closed: leftMs <= 0 };
  }, [thread.channel, thread.meta.windowExpiresAt]);

  const templates = HSM_TEMPLATES[thread.channel] ?? [];

  async function aiGenerate() {
    setAiLoading(true);
    try {
      const res = await generateAiContent({
        data: {
          channel: "email",
          scene: "跟进客户回复邮件",
          extra: [
            `对方姓名：${thread.parentRef?.name ?? thread.targetName}`,
            `对方最新原话：${(lastInbound?.content ?? "(尚无对方回复)").slice(0, 400)}`,
          ].join("\n"),
          tone: "friendly",
          language: "en",
          sampleEnterprise: thread.targetName,
        },
      });
      setReply(res.content || "");
      toast.success("AI 已生成回复草稿，可继续编辑后发送");
    } catch (e) {
      toast.error(`AI 生成失败：${(e as Error).message}`);
    } finally {
      setAiLoading(false);
    }
  }

  // 当从企业/联系人详情胶囊上的"AI 回复"按钮进入时，自动触发一次生成，
  // 生成后清除 URL 上的 action 参数，避免切换会话或刷新时反复触发。
  useEffect(() => {
    if (!autoAi) return;
    aiGenerate();
    onConsumeAction?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAi, thread.id]);

  function doSend(aiGen = false) {
    const content = winInfo?.closed && templates.length
      ? templates.find((t) => t.id === selectedTpl)?.body ?? reply
      : reply;
    if (!content.trim()) {
      toast.error("请输入回复内容");
      return;
    }
    setSending(true);
    setTimeout(() => {
      sendReply({
        threadId: thread.id,
        content: content.trim(),
        fromAddress: thread.senderEmail || "outreach@bytetech.cn",
        subject: thread.messages[0]?.subject
          ? `Re: ${thread.messages[0].subject.replace(/^Re:\s*/i, "")}`
          : undefined,
        aiGenerated: aiGen,
      });
      setReply("");
      setSelectedTpl("");
      if (typeof window !== "undefined") window.localStorage.removeItem(draftKey);
      setDraftSavedAt(null);
      setSending(false);
      toast.success(winInfo?.closed ? "已通过 HSM 模板发送" : "回复已发送");
    }, 400);
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏 */}
      <div className="px-6 py-4 border-b space-y-2 shrink-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {thread.targetKind === "enterprise" ? (
            <Building2 className="h-3.5 w-3.5" />
          ) : (
            <UserRound className="h-3.5 w-3.5" />
          )}
          <Link
            to={
              thread.targetKind === "enterprise"
                ? "/outreach/enterprise/$id"
                : "/outreach/enterprise/$id/contact/$idx"
            }
            params={
              thread.targetKind === "enterprise"
                ? { id: thread.targetId }
                : {
                    id: thread.targetId.split(":")[0],
                    idx: thread.targetId.split(":")[1] ?? "0",
                  }
            }
            className="hover:text-primary transition-colors"
          >
            {thread.targetName}
          </Link>
          {thread.parentRef && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span>{thread.parentRef.name}</span>
            </>
          )}
          <span className="ml-2">· {thread.counterpartyAddress}</span>
          {thread.messages.some((m) => m.direction === "outbound" && m.ledgerId) && (
              <Link
                to="/outreach/reach"
                className="ml-2 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
                title="查看来源触达任务"
              >
                <Zap className="h-3 w-3" />
                来自触达
              </Link>
            )}
        </div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1 basis-full xl:basis-auto">
            {thread.messages[0]?.subject && (
              <div className="text-base font-semibold truncate">
                {thread.messages[0].subject}
              </div>
            )}
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-[11px]">
                {STATUS_LABEL[thread.meta.status]}
              </Badge>
              {(() => {
                const sla = slaInfo(thread);
                if (!sla) return null;
                return (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[11px]",
                      sla.overdue
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : sla.approaching
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200",
                    )}
                  >
                    <Clock className="h-3 w-3 mr-1" />
                    {sla.overdue
                      ? `SLA 逾期 ${formatShort(-sla.leftMs)}`
                      : sla.approaching
                        ? `SLA 即将超时 ${formatShort(sla.leftMs)}`
                        : `SLA 剩 ${formatShort(sla.leftMs)}`}
                  </Badge>
                );
              })()}
              {thread.meta.aiIntent && (
                <Badge
                  variant="outline"
                  className={cn("text-[11px]", INTENT_COLOR[thread.meta.aiIntent])}
                >
                  {INTENT_LABEL[thread.meta.aiIntent]}
                </Badge>
              )}
              {thread.meta.cadenceEnrolled && (
                <Badge variant="outline" className="text-[11px]">
                  <Repeat className="h-3 w-3 mr-1" /> 已加入跟进序列
                </Badge>
              )}
              {thread.meta.humanTakeover && (
                <Badge
                  variant="outline"
                  className="text-[11px] bg-sky-50 text-sky-700 border-sky-200"
                  title={
                    thread.meta.humanTakeover.reason
                      ? `原因：${thread.meta.humanTakeover.reason}`
                      : undefined
                  }
                >
                  <Hand className="h-3 w-3 mr-1" />
                  已人工接管 · {thread.meta.humanTakeover.byName}
                </Badge>
              )}
              {thread.meta.tags.map((t) => (
                <Badge key={t} variant="outline" className="text-[11px]">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            {onToggleScorePanel && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 hidden lg:inline-flex"
                onClick={onToggleScorePanel}
                title={scorePanelOpen ? "收起 AI 意向评分" : "展开 AI 意向评分"}
              >
                {scorePanelOpen ? (
                  <PanelRightClose className="h-3.5 w-3.5" />
                ) : (
                  <PanelRightOpen className="h-3.5 w-3.5" />
                )}
                <TargetIcon className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs">AI 意向</span>
              </Button>
            )}
            <ActionBar thread={thread} />
          </div>
        </div>
      </div>

      {/* 时间线 */}
      <Tabs defaultValue="thread" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-6 mt-2 h-9 shrink-0 self-start">
          <TabsTrigger value="thread" className="text-xs gap-1">
            <MessageCircleReply className="h-3.5 w-3.5" />
            会话
          </TabsTrigger>
          <TabsTrigger value="profile" className="text-xs gap-1">
            <UserIcon className="h-3.5 w-3.5" />
            客户资料
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1">
            <History className="h-3.5 w-3.5" />
            触达历史
          </TabsTrigger>
        </TabsList>
        <TabsContent value="thread" className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4 mt-0">
        {(thread.meta.assignmentEvents ?? []).map((ev) => (
          <div
            key={ev.id}
            className="flex items-center gap-2 text-[11px] text-muted-foreground border-l-2 border-primary/30 pl-3 py-1"
          >
            <UserCheck className="h-3 w-3 text-primary" />
            <span>
              {ev.from ? memberById(ev.from)?.name ?? "未知" : "未分配"} →{" "}
              {ev.to ? memberById(ev.to)?.name ?? "未知" : "未分配"}
            </span>
            {ev.crossGroup && (
              <Badge variant="outline" className="text-[10px] h-4 px-1 bg-amber-50 text-amber-700 border-amber-200">
                跨组
              </Badge>
            )}
            {ev.greetingSent && (
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                已发切换招呼
              </Badge>
            )}
            {ev.reason && <span className="text-foreground/70">· {ev.reason}</span>}
            <span className="ml-auto">{formatDateTime(ev.at)}</span>
          </div>
        ))}
        {thread.messages.map((m) => (
          <div key={m.id} className="flex gap-3">
            <div
              className={cn(
                "h-8 w-8 rounded-full shrink-0 flex items-center justify-center text-xs font-medium",
                m.direction === "outbound"
                  ? "bg-primary/10 text-primary"
                  : "bg-emerald-100 text-emerald-700",
              )}
            >
              {m.direction === "outbound" ? "我" : "TA"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {m.direction === "outbound" ? "你发出" : "对方回复"}
                </span>
                <span>· {formatDateTime(m.createdAt)}</span>
                {m.aiGenerated && (
                  <Badge variant="outline" className="text-[10px] py-0 h-4">
                    <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                    AI
                  </Badge>
                )}
              </div>
              {m.direction === "outbound" && m.events && m.events.length > 0 && (
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  {m.events.map((ev, i) => (
                    <span key={i} className="inline-flex items-center gap-0.5">
                      {ev.type === "delivered" && (
                        <>
                          <CheckCheck className="h-3 w-3 text-emerald-500" />
                          已送达
                        </>
                      )}
                      {ev.type === "opened" && (
                        <>
                          <MailOpen className="h-3 w-3 text-sky-500" />
                          已打开
                        </>
                      )}
                      {ev.type === "clicked" && (
                        <>
                          <MousePointerClick className="h-3 w-3 text-violet-500" />
                          已点击
                        </>
                      )}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-2 rounded-md border bg-card p-3 text-sm whitespace-pre-wrap leading-relaxed">
                {m.content}
              </div>
              {m.direction === "inbound" && m.contentZh && (
                <div className="mt-1.5 rounded-md border border-dashed border-sky-200 bg-sky-50/60 p-3 text-sm whitespace-pre-wrap leading-relaxed text-sky-900">
                  <div className="mb-1 text-[11px] font-medium text-sky-700 inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    中文译文（AI 自动翻译）
                  </div>
                  {m.contentZh}
                </div>
              )}
            </div>
          </div>
        ))}
        </TabsContent>
        <TabsContent value="profile" className="flex-1 min-h-0 overflow-y-auto px-6 py-4 mt-0">
          <ProfilePanel thread={thread} />
        </TabsContent>
        <TabsContent value="history" className="flex-1 min-h-0 overflow-y-auto px-6 py-4 mt-0">
          <ReachHistoryPanel thread={thread} />
        </TabsContent>
      </Tabs>

      {/* 回复区 */}
      <div className="border-t bg-muted/20 p-4 shrink-0">
        {winInfo && (
          <div
            className={cn(
              "mb-3 rounded-md border px-3 py-2 text-xs flex items-center gap-2",
              winInfo.closed
                ? "bg-rose-50 border-rose-200 text-rose-700"
                : winInfo.leftMs < 2 * 3600_000
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800",
            )}
          >
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            {winInfo.closed ? (
              <span>
                {CHANNEL_LABEL[thread.channel]} 客服窗口已关闭，
                {thread.channel === "whatsapp"
                  ? "请从下方选择已审核的 HSM 模板发送。"
                  : thread.channel === "facebook"
                    ? "需附合规消息标签（如 CONFIRMED_EVENT_UPDATE）。"
                    : "窗口外禁止外发消息。"}
              </span>
            ) : (
              <span>
                {CHANNEL_LABEL[thread.channel]} 客服窗口剩余{" "}
                <b>{formatHm(winInfo.leftMs)}</b>，窗口内可自由文本回复。
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 mb-2">
          <MessageCircleReply className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">回复</span>
          <span className="text-xs text-muted-foreground">
            {thread.channel === "email"
              ? `将以 ${thread.senderEmail || "outreach@bytetech.cn"} 发出`
              : thread.channel === "whatsapp"
                ? "由公司共享 WhatsApp 商号发出（对客户显示同一号码）"
                : `将以 ${CHANNEL_LABEL[thread.channel]} 渠道发出`}
            ，保持在同一会话内
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto gap-1 h-7"
            onClick={aiGenerate}
            disabled={aiLoading || winInfo?.closed}
          >
            {aiLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            AI 生成回复
          </Button>
          <QuickTemplateMenu
            channel={thread.channel}
            disabled={!!winInfo?.closed}
            onPick={(body) => setReply(body)}
          />
        </div>
        {winInfo?.closed && templates.length > 0 ? (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTpl(t.id)}
                  className={cn(
                    "text-left rounded-md border bg-background p-3 hover:border-primary transition-colors",
                    selectedTpl === t.id && "border-primary ring-1 ring-primary/40",
                  )}
                >
                  <div className="text-xs font-medium mb-1">{t.name}</div>
                  <div className="text-xs text-muted-foreground whitespace-pre-wrap">{t.body}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder='写点什么，或点击"AI 生成回复"由 AI 起草…'
            rows={4}
            className="resize-none bg-background"
            disabled={winInfo?.closed}
          />
        )}
        <div className="mt-2 flex items-center gap-2">
          <Button
            onClick={() => doSend(false)}
            disabled={
              sending ||
              (winInfo?.closed && templates.length > 0 && !selectedTpl) ||
              (winInfo?.closed && templates.length === 0)
            }
            className="gap-1.5"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {winInfo?.closed && templates.length > 0 ? "发送模板消息" : "发送回复"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setReply("");
              setSelectedTpl("");
              if (typeof window !== "undefined")
                window.localStorage.removeItem(draftKey);
              setDraftSavedAt(null);
            }}
            disabled={(!reply && !selectedTpl) || sending}
          >
            清空
          </Button>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            {draftSavedAt && (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <CheckCheck className="h-3 w-3" />
                草稿已自动保存 · {relTime(draftSavedAt)}
              </span>
            )}
            <span>回复后本会话状态自动切换为「等待回复」</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatHm(ms: number) {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

function formatShort(ms: number) {
  const total = Math.max(0, Math.floor(ms / 60000));
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function ActionBar({ thread }: { thread: Thread }) {
  return _ActionBar({ thread });
}

function QuickTemplateMenu({
  channel,
  disabled,
  onPick,
}: {
  channel: Channel;
  disabled?: boolean;
  onPick: (body: string) => void;
}) {
  const smsTpls = channel === "sms" ? getApprovedSmsTemplates() : [];
  const list: { id: string; name: string; body: string }[] =
    channel === "email"
      ? EMAIL_QUICK_REPLIES
      : channel === "sms"
        ? smsTpls.map((t) => ({ id: t.id, name: t.name, body: t.content }))
        : [];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 h-7"
          disabled={disabled || list.length === 0}
        >
          <FileText className="h-3.5 w-3.5" />
          模板
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground">
          {channel === "email" ? "邮件快捷回复" : "短信审核通过模板"}
        </DropdownMenuLabel>
        {list.map((t) => (
          <DropdownMenuItem
            key={t.id}
            className="flex flex-col items-start gap-0.5 py-2"
            onClick={() => onPick(t.body)}
          >
            <span className="text-xs font-medium">{t.name}</span>
            <span className="text-[11px] text-muted-foreground line-clamp-2">
              {t.body}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function _ActionBar({ thread }: { thread: Thread }) {
  return __ActionBarImpl({ thread });
}

function ProfilePanel({ thread }: { thread: Thread }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {thread.targetKind === "enterprise" ? (
            <Building2 className="h-3.5 w-3.5" />
          ) : (
            <UserRound className="h-3.5 w-3.5" />
          )}
          <span>{thread.targetKind === "enterprise" ? "企业" : "联系人"}</span>
        </div>
        <div className="text-base font-semibold">{thread.targetName}</div>
        {thread.parentRef && (
          <div className="text-xs text-muted-foreground">
            所属：{thread.parentRef.name}
          </div>
        )}
        <div className="text-xs">
          <span className="text-muted-foreground">联系方式：</span>
          <span className="font-mono">{thread.counterpartyAddress}</span>
        </div>
        <div className="text-xs">
          <span className="text-muted-foreground">渠道：</span>
          {CHANNEL_LABEL[thread.channel]}
        </div>
        {thread.meta.assigneeId && (
          <div className="text-xs">
            <span className="text-muted-foreground">当前跟进：</span>
            {memberById(thread.meta.assigneeId)?.name}
          </div>
        )}
      </div>
      <div className="rounded-md border bg-card p-4">
        <div className="text-xs text-muted-foreground mb-2">前往完整档案</div>
        <Link
          to={
            thread.targetKind === "enterprise"
              ? "/outreach/enterprise/$id"
              : "/outreach/enterprise/$id/contact/$idx"
          }
          params={
            thread.targetKind === "enterprise"
              ? { id: thread.targetId }
              : {
                  id: thread.targetId.split(":")[0],
                  idx: thread.targetId.split(":")[1] ?? "0",
                }
          }
          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
        >
          打开{thread.targetKind === "enterprise" ? "企业" : "联系人"}详情
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function ReachHistoryPanel({ thread }: { thread: Thread }) {
  const list = useMemo(() => {
    return getAllLedger().filter(
      (e) =>
        e.kind === "reach" &&
        e.targetKind === thread.targetKind &&
        e.targetId === thread.targetId,
    );
  }, [thread.targetKind, thread.targetId]);
  if (list.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-10">
        暂无触达记录
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {list.map((r) => (
        <div
          key={r.id}
          className="rounded-md border bg-card p-3 text-xs flex items-start gap-3"
        >
          <div className="shrink-0 pt-0.5">
            <Zap className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {r.channel === "email" ? "邮件" : r.channel === "phone" ? "短信" : "社媒"}
                {r.platform ? ` · ${r.platform}` : ""}
              </span>
              <span className="text-muted-foreground">
                {formatDateTime(r.createdAt)}
              </span>
              <span className="ml-auto text-rose-600 font-semibold tabular-nums">
                -{r.cost}
              </span>
            </div>
            {r.subject && (
              <div className="mt-1 text-foreground/80 truncate">{r.subject}</div>
            )}
            {r.detail && (
              <div className="mt-0.5 text-muted-foreground font-mono truncate">
                {r.detail}
              </div>
            )}
          </div>
        </div>
      ))}
      <div className="pt-2">
        <Link
          to="/outreach/reach"
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          打开触达任务列表
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function __ActionBarImpl({ thread }: { thread: Thread }) {
  const [tagInput, setTagInput] = useState("");
  const [taskTitle, setTaskTitle] = useState("");

  return (
    <div className="flex items-center gap-1 shrink-0">
      <AssignMenu thread={thread} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1 h-8">
            <Clock className="h-3.5 w-3.5" />
            稍后
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Snooze 到</DropdownMenuLabel>
          {SNOOZE_PRESETS.map((p) => (
            <DropdownMenuItem
              key={p.label}
              onClick={() => {
                snoozeThread(thread.id, p.ms);
                toast.success(`已 Snooze：${p.label}`);
              }}
            >
              {p.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {thread.meta.status === "won" || thread.meta.status === "lost" ? (
        <Button
          variant="outline"
          size="sm"
          className="gap-1 h-8"
          onClick={() => {
            reopenThread(thread.id);
            toast.success("已恢复为待跟进");
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          恢复跟进
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 h-8">
              <CheckCheck className="h-3.5 w-3.5" />
              标记关单
              <ChevronDownIcon className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                closeThread(thread.id, "won");
                toast.success("已标记为已成交");
              }}
            >
              <CheckCheck className="h-4 w-4 text-emerald-600" />
              已成交
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                closeThread(thread.id, "lost");
                toast.success("已标记为已流失");
              }}
            >
              <Ban className="h-4 w-4 text-slate-500" />
              已流失
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* 模式：人工接管 — 紧凑 toggle */}
      <button
        type="button"
        onClick={() => {
          const on = !thread.meta.humanTakeover;
          setHumanTakeover(thread.id, on);
          toast.success(
            on ? "已切换为人工接管，跟进序列已暂停" : "已撤销人工接管，恢复自动跟进",
          );
        }}
        title={
          thread.meta.humanTakeover
            ? "人工接管中 · 点击撤销"
            : "切换为人工接管（暂停自动跟进）"
        }
        className={cn(
          "ml-1 inline-flex items-center gap-1 h-8 px-2 rounded-md border text-xs transition-colors",
          thread.meta.humanTakeover
            ? "bg-sky-500 border-sky-500 text-white hover:bg-sky-600"
            : "border-border text-muted-foreground hover:bg-muted",
        )}
      >
        <Hand className="h-3.5 w-3.5" />
        <span
          className={cn(
            "h-3 w-6 rounded-full relative transition-colors",
            thread.meta.humanTakeover ? "bg-white/40" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-2 w-2 rounded-full bg-white transition-all",
              thread.meta.humanTakeover ? "left-3.5" : "left-0.5",
            )}
          />
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => {
              toggleStar(thread.id);
              toast.success(thread.meta.starred ? "已取消加星" : "已加星");
            }}
          >
            <Star
              className={cn(
                "h-3.5 w-3.5 mr-2",
                thread.meta.starred ? "fill-amber-400 text-amber-400" : "",
              )}
            />
            {thread.meta.starred ? "取消加星" : "加星"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              enrollCadence(thread.id, !thread.meta.cadenceEnrolled);
              toast.success(
                thread.meta.cadenceEnrolled
                  ? "已退出跟进序列"
                  : "已加入 3/7/14 天跟进序列",
              );
            }}
          >
            <Repeat className="h-3.5 w-3.5 mr-2" />
            {thread.meta.cadenceEnrolled ? "退出跟进序列" : "加入跟进序列"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>标签 / 分类</DropdownMenuLabel>
          <div className="px-2 py-1.5 flex items-center gap-1">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="打标签"
              className="h-7"
              onKeyDown={(e) => {
                if (e.key === "Enter" && tagInput.trim()) {
                  addTag(thread.id, tagInput.trim());
                  setTagInput("");
                  toast.success("已加标签");
                }
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0"
              onClick={() => {
                if (tagInput.trim()) {
                  addTag(thread.id, tagInput.trim());
                  setTagInput("");
                  toast.success("已加标签");
                }
              }}
            >
              <Tag className="h-3 w-3" />
            </Button>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>修正 AI 分类</DropdownMenuLabel>
          {(
            ["interested", "quote", "ooo", "reject", "unsubscribe", "other"] as AiIntent[]
          ).map((i) => (
            <DropdownMenuItem
              key={i}
              onClick={() => {
                updateIntent(thread.id, i);
                toast.success(`已修正为「${INTENT_LABEL[i]}」`);
              }}
            >
              {INTENT_LABEL[i]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>任务</DropdownMenuLabel>
          <div className="px-2 py-1.5 flex items-center gap-1">
            <Input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="加待办"
              className="h-7"
              onKeyDown={(e) => {
                if (e.key === "Enter" && taskTitle.trim()) {
                  addTaskForThread(thread.id, taskTitle.trim());
                  setTaskTitle("");
                  toast.success("已创建待办");
                }
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0"
              onClick={() => {
                if (taskTitle.trim()) {
                  addTaskForThread(thread.id, taskTitle.trim());
                  setTaskTitle("");
                  toast.success("已创建待办");
                }
              }}
            >
              <ListTodo className="h-3 w-3" />
            </Button>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-rose-600 focus:text-rose-600"
            onClick={() => {
              suppressThread(thread.id);
              toast.success("已加入抑制名单，后续将不再向该地址发送");
            }}
          >
            <Ban className="h-3.5 w-3.5 mr-2" /> 加入抑制名单
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function AssignMenu({ thread }: { thread: Thread }) {
  const group = threadGroup(thread);
  const cur = memberById(thread.meta.assigneeId);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(cur?.id ?? null);
  const [reason, setReason] = useState("");
  const [crossGroup, setCrossGroup] = useState(false);
  const [sendGreeting, setSendGreeting] = useState(false);

  const prevIds = previousAssigneeIds(thread.id);
  const inGroup = TEAM_MEMBERS.filter((m) => m.groups.includes(group));
  const outGroup = TEAM_MEMBERS.filter((m) => !m.groups.includes(group));
  const eligible = crossGroup ? [...inGroup, ...outGroup] : inGroup;
  // 排序：上次跟进人 → 组内 → 组外
  const sorted = [...eligible].sort((a, b) => {
    const ai = prevIds.indexOf(a.id);
    const bi = prevIds.indexOf(b.id);
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return 0;
  });

  const isReassign = !!cur && selectedId !== cur.id;
  const canSubmit = selectedId && (!isReassign || reason.trim().length > 0);

  function reset() {
    setSelectedId(cur?.id ?? null);
    setReason("");
    setCrossGroup(false);
    setSendGreeting(false);
  }
  function submit() {
    if (!canSubmit) return;
    const target = TEAM_MEMBERS.find((m) => m.id === selectedId!);
    const isCross = !!target && !target.groups.includes(group);
    assignThread(thread.id, selectedId, {
      reason: reason.trim() || undefined,
      crossGroup: isCross,
      sendGreeting,
    });
    toast.success(cur ? `已转派给 ${target?.name}` : `已分配给 ${target?.name}`);
    setOpen(false);
    reset();
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant={cur ? "outline" : "default"}
          size="sm"
          className={cn("gap-1 h-8", !cur && "bg-amber-500 hover:bg-amber-600 text-white")}
        >
          {cur ? (
            <>
              <UserCheck className="h-3.5 w-3.5" />
              {cur.name}
            </>
          ) : (
            <>
              <UserPlus className="h-3.5 w-3.5" />
              分配
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b flex items-center gap-2">
          <span className="text-sm font-medium">
            {cur ? "转派会话" : "分配会话"} · {GROUP_LABEL[group]}
          </span>
          {!cur && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 gap-1 text-xs"
              onClick={() => {
                assignThread(thread.id, CURRENT_TEAM_USER_ID);
                toast.success("我来跟：会话已分配给我");
                setOpen(false);
              }}
            >
              <Hand className="h-3 w-3" /> 我来跟
            </Button>
          )}
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          {sorted.map((m) => {
            const isPrev = prevIds[0] === m.id;
            const isCross = !m.groups.includes(group);
            return (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted",
                  selectedId === m.id && "bg-primary/5",
                )}
              >
                <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-[11px] flex items-center justify-center">
                  {m.avatarLetter}
                </span>
                <span className="font-medium">{m.name}</span>
                {m.role === "lead" && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                    组长
                  </Badge>
                )}
                {isPrev && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1 bg-emerald-50 text-emerald-700 border-emerald-200">
                    上次跟进人
                  </Badge>
                )}
                {isCross && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1 bg-amber-50 text-amber-700 border-amber-200">
                    跨组
                  </Badge>
                )}
                {selectedId === m.id && (
                  <CheckCheck className="ml-auto h-3.5 w-3.5 text-emerald-500" />
                )}
              </button>
            );
          })}
        </div>
        <div className="p-3 border-t space-y-2">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={crossGroup}
              onChange={(e) => setCrossGroup(e.target.checked)}
            />
            允许跨分组转派（管理员）
          </label>
          {isReassign && (
            <div>
              <Label className="text-xs">转派原因 <span className="text-rose-500">*</span></Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder='例如："客户在我休假期"'
                rows={2}
                className="mt-1 resize-none text-xs"
              />
            </div>
          )}
          {thread.channel === "whatsapp" && isReassign && (
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={sendGreeting}
                onChange={(e) => setSendGreeting(e.target.checked)}
              />
              向客户发送一条切换招呼语（共享号需要）
            </label>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={submit} disabled={!canSubmit} className="flex-1">
              {cur ? "确认转派" : "确认分配"}
            </Button>
            {cur && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  assignThread(thread.id, null, { reason: reason.trim() || "退回池" });
                  toast.success("已回退到未分配池");
                  setOpen(false);
                  reset();
                }}
              >
                退回池
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
