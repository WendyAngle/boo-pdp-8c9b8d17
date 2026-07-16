import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Users,
  Building2,
  UserRound,
  Clock,
  ShieldAlert,
  Inbox,
  Send,
  Pencil,
  Info,
  Mail,
  MessageSquare,
  MessageCircle,
  Send as SendPlane,
  Facebook,
  Music2,
  AlertTriangle,
  ArrowRight,
  Timer,
  CheckCircle2,
  Gauge,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  TEAM_MEMBERS,
  GROUP_LABEL,
  useThreads,
  threadGroup,
  assignThread,
  slaInfo,
  CHANNEL_LABEL,
  type Channel,
  type GroupKind,
  type TeamMember,
  type Thread,
} from "@/lib/inbox-store";

export const Route = createFileRoute("/_app/outreach/inquiry-dispatch")({
  head: () => ({ meta: [{ title: "询盘分派 | 出海大数据平台" }] }),
  component: InboxRoutingAdmin,
});

interface GroupConfig {
  kind: GroupKind;
  slaFirstResponseMin: number;
  slaReplyHour: number;
  members: TeamMember[];
}

const GROUP_SLA_HINT: Record<GroupKind, string> = {
  enterprise:
    "企业分组：以采购决策链为主，节奏较慢，容许更宽松的首响与回复时限（默认 30 分钟 / 8 小时）。",
  contact:
    "人物分组：多为一对一即时沟通，用户期待更快回复，采用更紧的时限（默认 20 分钟 / 4 小时）。",
};

function channelIconOf(ch: Channel) {
  switch (ch) {
    case "email":
      return Mail;
    case "sms":
      return MessageSquare;
    case "whatsapp":
      return MessageCircle;
    case "telegram":
      return SendPlane;
    case "facebook":
      return Facebook;
    case "tiktok":
      return Music2;
  }
}

function loadDotClass(assigned: number) {
  if (assigned >= 20) return "bg-rose-500";
  if (assigned >= 10) return "bg-amber-500";
  return "bg-emerald-500";
}

/** 每个成员的容量上限（Phase 1 mock：与"负载红线"一致，可后续做成分组可配置） */
const CAPACITY_LIMIT = 20;

/** 基于 id 生成稳定的伪演示指标（平均响应分钟数、本周已处理会话数） */
function memberStubStats(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const avgMin = 12 + (h % 34); // 12–45 分钟
  const weekDone = 8 + ((h >> 5) % 20); // 8–27 条
  return { avgMin, weekDone };
}

function formatLeft(ms: number) {
  const abs = Math.abs(ms);
  const min = Math.floor(abs / 60_000);
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  const rm = min % 60;
  return rm === 0 ? `${h} 小时` : `${h} 小时 ${rm} 分钟`;
}

function SlaBadge({ t }: { t: Thread }) {
  const s = slaInfo(t);
  if (!s) return null;
  const tone = s.overdue
    ? "bg-rose-50 text-rose-700 border-rose-200"
    : s.approaching
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-slate-50 text-slate-600 border-slate-200";
  const label = s.overdue
    ? `已超时 ${formatLeft(s.leftMs)}`
    : `SLA 剩 ${formatLeft(s.leftMs)}`;
  return (
    <span
      className={`inline-flex items-center gap-1 border rounded px-1.5 py-0.5 text-[10px] ${tone}`}
    >
      <Clock className="h-3 w-3" />
      {label}
    </span>
  );
}

function InboxRoutingAdmin() {
  const threads = useThreads();
  // 每个分组的 pending 批量分配目标
  const [batchAssignee, setBatchAssignee] = useState<Record<GroupKind, string>>({
    enterprise: "",
    contact: "",
  });
  const [selected, setSelected] = useState<Record<GroupKind, Set<string>>>({
    enterprise: new Set(),
    contact: new Set(),
  });
  const [editingSla, setEditingSla] = useState<Record<GroupKind, boolean>>({
    enterprise: false,
    contact: false,
  });
  const [draftSla, setDraftSla] = useState<
    Record<GroupKind, { firstResponseMin: number; replyHour: number }>
  >({
    enterprise: { firstResponseMin: 30, replyHour: 8 },
    contact: { firstResponseMin: 20, replyHour: 4 },
  });
  const [config, setConfig] = useState<GroupConfig[]>(() => [
    {
      kind: "enterprise",
      slaFirstResponseMin: 30,
      slaReplyHour: 8,
      members: TEAM_MEMBERS.filter((m) => m.groups.includes("enterprise")),
    },
    {
      kind: "contact",
      slaFirstResponseMin: 20,
      slaReplyHour: 4,
      members: TEAM_MEMBERS.filter((m) => m.groups.includes("contact")),
    },
  ]);

  const workload = useMemo(() => {
    const m = new Map<string, { assigned: number; unread: number }>();
    for (const t of threads) {
      if (!t.meta.assigneeId) continue;
      const w = m.get(t.meta.assigneeId) ?? { assigned: 0, unread: 0 };
      w.assigned++;
      if (t.meta.unread > 0) w.unread++;
      m.set(t.meta.assigneeId, w);
    }
    return m;
  }, [threads]);

  const poolByGroup: Record<GroupKind, number> = useMemo(() => {
    const acc: Record<GroupKind, number> = { enterprise: 0, contact: 0 };
    for (const t of threads) {
      if (!t.meta.assigneeId) acc[threadGroup(t)]++;
    }
    return acc;
  }, [threads]);

  const unassignedByGroup = useMemo(() => {
    const acc: Record<GroupKind, typeof threads> = { enterprise: [], contact: [] };
    for (const t of threads) {
      if (!t.meta.assigneeId) acc[threadGroup(t)].push(t);
    }
    return acc;
  }, [threads]);

  function updateSla(kind: GroupKind, patch: Partial<GroupConfig>) {
    setConfig((prev) =>
      prev.map((g) => (g.kind === kind ? { ...g, ...patch } : g)),
    );
  }

  function startEditSla(kind: GroupKind) {
    const g = config.find((c) => c.kind === kind);
    if (!g) return;
    setDraftSla((p) => ({
      ...p,
      [kind]: {
        firstResponseMin: g.slaFirstResponseMin,
        replyHour: g.slaReplyHour,
      },
    }));
    setEditingSla((p) => ({ ...p, [kind]: true }));
  }
  function cancelEditSla(kind: GroupKind) {
    setEditingSla((p) => ({ ...p, [kind]: false }));
  }
  function saveEditSla(kind: GroupKind) {
    const d = draftSla[kind];
    updateSla(kind, {
      slaFirstResponseMin: d.firstResponseMin,
      slaReplyHour: d.replyHour,
    });
    setEditingSla((p) => ({ ...p, [kind]: false }));
    toast.success("SLA 已保存");
  }

  function toggleOne(kind: GroupKind, id: string, v: boolean) {
    setSelected((prev) => {
      const next = new Set(prev[kind]);
      if (v) next.add(id);
      else next.delete(id);
      return { ...prev, [kind]: next };
    });
  }
  function toggleAll(kind: GroupKind, ids: string[], v: boolean) {
    setSelected((prev) => ({
      ...prev,
      [kind]: v ? new Set(ids) : new Set(),
    }));
  }
  function doBatchAssign(kind: GroupKind) {
    const userId = batchAssignee[kind];
    const ids = Array.from(selected[kind]);
    if (!userId) {
      toast.error("请选择要分配的成员");
      return;
    }
    if (ids.length === 0) {
      toast.error("请先勾选要分配的会话");
      return;
    }
    ids.forEach((id) =>
      assignThread(id, userId, { reason: "管理后台批量派单" }),
    );
    toast.success(`已将 ${ids.length} 条会话分配给该成员`);
    setSelected((prev) => ({ ...prev, [kind]: new Set() }));
  }
  function doAssignOne(id: string, userId: string) {
    assignThread(id, userId, { reason: "管理后台单条分配" });
    toast.success("已分配");
  }

  return (
    <TooltipProvider delayDuration={200}>
    <div className="p-6 space-y-6 max-w-6xl">
      <section className="relative overflow-hidden rounded-2xl ring-1 ring-border">
        <div
          className="absolute inset-0"
          style={{ background: "var(--gradient-hero)" }}
        />
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 80% 30%, rgba(255,255,255,0.45) 0%, transparent 50%), radial-gradient(circle at 20% 80%, rgba(255,255,255,0.25) 0%, transparent 45%)",
          }}
        />
        <div className="relative px-8 py-10 flex items-center gap-5 text-white">
          <div className="h-14 w-14 rounded-2xl bg-white/25 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30">
            <Users className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-wide">询盘分派</h1>
            <p className="text-white/90 text-sm mt-1">
              按目标类型内置两个分组：企业分组、人物分组。全部会话人工分配，不做自动派单。
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {config.map((g) => (
          <Card key={g.kind} className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              {g.kind === "enterprise" ? (
                <Building2 className="h-5 w-5 text-primary" />
              ) : (
                <UserRound className="h-5 w-5 text-primary" />
              )}
              <div className="font-semibold">{GROUP_LABEL[g.kind]}</div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="分组说明"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  {GROUP_SLA_HINT[g.kind]}
                </TooltipContent>
              </Tooltip>
              <Badge variant="outline" className="ml-auto">
                池中未分配：{poolByGroup[g.kind]}
              </Badge>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> SLA 配置
                </div>
                {!editingSla[g.kind] ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 ml-auto text-xs"
                    onClick={() => startEditSla(g.kind)}
                  >
                    <Pencil className="h-3 w-3" />
                    编辑
                  </Button>
                ) : (
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => saveEditSla(g.kind)}
                    >
                      保存
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => cancelEditSla(g.kind)}
                    >
                      取消
                    </Button>
                  </div>
                )}
              </div>
              {!editingSla[g.kind] ? (
                <div className="rounded-md border bg-muted/20 px-3 py-2.5 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                      首次响应时限
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="hover:text-foreground" aria-label="首次响应说明">
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[240px] text-xs">
                          从会话进入未分配池开始计时，衡量分组首次接单速度；超时将自动提醒组长派单。
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="font-medium tabular-nums">
                      {formatMin(g.slaFirstResponseMin)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                      每次回复时限
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="hover:text-foreground" aria-label="每次回复说明">
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[240px] text-xs">
                          从客户最新一条消息发出开始计时，衡量已分配员工的跟进效率；超时将标记逾期并双向提醒。
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="font-medium tabular-nums">
                      {formatHour(g.slaReplyHour)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border px-3 py-2.5 space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs space-y-1 block">
                      <span className="text-muted-foreground">首次响应 (分钟)</span>
                      <div className="relative">
                        <Input
                          type="number"
                          min={1}
                          value={draftSla[g.kind].firstResponseMin}
                          onChange={(e) =>
                            setDraftSla((p) => ({
                              ...p,
                              [g.kind]: {
                                ...p[g.kind],
                                firstResponseMin: Number(e.target.value) || 0,
                              },
                            }))
                          }
                          className="h-8 pr-12 tabular-nums"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">
                          分钟
                        </span>
                      </div>
                    </label>
                    <label className="text-xs space-y-1 block">
                      <span className="text-muted-foreground">每次回复 (小时)</span>
                      <div className="relative">
                        <Input
                          type="number"
                          min={1}
                          value={draftSla[g.kind].replyHour}
                          onChange={(e) =>
                            setDraftSla((p) => ({
                              ...p,
                              [g.kind]: {
                                ...p[g.kind],
                                replyHour: Number(e.target.value) || 0,
                              },
                            }))
                          }
                          className="h-8 pr-12 tabular-nums"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">
                          小时
                        </span>
                      </div>
                    </label>
                  </div>
                  <div className="text-[11px] text-amber-700 flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    修改将影响分组内所有成员与未分配池的响应时限。
                  </div>
                </div>
              )}
              <div className="mt-2 text-[11px] text-muted-foreground flex items-start gap-1">
                <ShieldAlert className="h-3 w-3 mt-0.5 shrink-0" />
                未分配阶段的 SLA 挂在分组池，超时提醒组长派单；已分配后转由该员工负责。
              </div>
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/60 px-2.5 py-2 text-[11px] text-amber-800 space-y-0.5">
                <div className="font-medium flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> 违规后果
                </div>
                <div>• 未分配超时：自动提醒组长派单，会话高亮标记于分派池</div>
                <div>• 已分配超时：标记逾期，双向提醒员工与组长，计入 SLA 报表</div>
              </div>
            </div>

            <Separator />

            <div>
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <Users className="h-3 w-3" /> 成员（{g.members.length}）
              </div>
              <div className="space-y-1.5">
                {g.members.map((m) => {
                  const w = workload.get(m.id);
                  const assigned = w?.assigned ?? 0;
                  const loadTone =
                    assigned >= 20
                      ? "text-rose-600"
                      : assigned >= 10
                        ? "text-amber-600"
                        : "text-muted-foreground";
                  const stats = memberStubStats(m.id);
                  const remaining = Math.max(0, CAPACITY_LIMIT - assigned);
                  const capTone =
                    remaining === 0
                      ? "text-rose-600"
                      : remaining <= 5
                        ? "text-amber-600"
                        : "text-emerald-600";
                  return (
                    <div
                      key={m.id}
                      className="border rounded-md px-2.5 py-1.5 space-y-1"
                    >
                      <div className="flex items-center gap-2 text-sm">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${loadDotClass(assigned)}`}
                            aria-label="负载状态"
                          />
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          {assigned >= 20
                            ? "负载过高，建议暂停派单"
                            : assigned >= 10
                              ? "负载偏高，谨慎派单"
                              : "负载正常"}
                        </TooltipContent>
                      </Tooltip>
                      <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center">
                        {m.avatarLetter}
                      </span>
                      <span className="font-medium">{m.name}</span>
                      {m.role === "lead" && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1">
                          组长
                        </Badge>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={`ml-auto text-xs font-medium tabular-nums cursor-help ${loadTone}`}
                          >
                            在办 {assigned}
                            {w && w.unread > 0 && (
                              <span className="ml-2 text-rose-600">
                                未读 {w.unread}
                              </span>
                            )}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs max-w-[220px]">
                          <div><b>在办</b>：当前分配给该成员、尚未处理完成的会话数</div>
                          <div><b>未读</b>：其中含未读消息的会话数</div>
                        </TooltipContent>
                      </Tooltip>
                      </div>
                      <div className="flex items-center gap-3 pl-4 text-[11px] text-muted-foreground tabular-nums">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`inline-flex items-center gap-1 cursor-help ${capTone}`}>
                              <Gauge className="h-3 w-3" />余量 {remaining}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs max-w-[220px]">
                            可接单容量 = 上限 {CAPACITY_LIMIT} − 当前在办 {assigned}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help">
                              <Timer className="h-3 w-3" />平均 {stats.avgMin}分
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">近 7 天平均回复时长</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help">
                              <CheckCircle2 className="h-3 w-3" />本周 {stats.weekDone}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">本周已处理完成的会话数</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 text-[11px] text-muted-foreground">
                成员列表复用系统员工，编辑请前往「员工管理」。负载圆点：🟢 ≤10 / 🟠 ≥10 / 🔴 ≥20（在办会话数）。
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* IR-02 · 会话分配入口：未分配会话池 + 单条/批量派单 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(Object.keys(unassignedByGroup) as GroupKind[]).map((kind) => {
          const rows = unassignedByGroup[kind];
          const groupMembers = TEAM_MEMBERS.filter((m) => m.groups.includes(kind));
          const sel = selected[kind];
          const allChecked = rows.length > 0 && rows.every((r) => sel.has(r.id));
          const someChecked = rows.some((r) => sel.has(r.id));
          return (
            <Card key={kind} className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Inbox className="h-4 w-4 text-primary" />
                <div className="font-semibold">
                  {GROUP_LABEL[kind]} · 未分配会话池
                </div>
                <Badge variant="outline" className="ml-auto">
                  {rows.length} 条待派单
                </Badge>
              </div>

              {/* 批量派单工具条 */}
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
                <span className="text-xs text-muted-foreground">
                  已选 <span className="text-foreground font-medium">{sel.size}</span> / {rows.length}
                </span>
                <div className="flex-1 min-w-[160px]">
                  <Select
                    value={batchAssignee[kind]}
                    onValueChange={(v) => setBatchAssignee((p) => ({ ...p, [kind]: v }))}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="选择要分配的成员" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                          {m.role === "lead" ? "（组长）" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  className="h-8"
                  disabled={sel.size === 0 || !batchAssignee[kind]}
                  onClick={() => doBatchAssign(kind)}
                >
                  <Send className="h-3.5 w-3.5" />
                  批量派单
                </Button>
              </div>

              {/* 待派单列表 */}
              <div className="border rounded-md divide-y max-h-80 overflow-auto">
                {rows.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <Inbox className="h-6 w-6 text-muted-foreground/60" />
                    <div className="text-sm text-muted-foreground">
                      暂无待分配会话
                    </div>
                    <div className="text-[11px] text-muted-foreground/80 max-w-[260px]">
                      新会话进入后会自动出现在此。也可前往收件箱查看全部会话并手动分配。
                    </div>
                    <Button asChild variant="outline" size="sm" className="h-7 mt-1 gap-1">
                      <Link to="/outreach/conversations">
                        打开收件箱
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/40 text-[11px] text-muted-foreground">
                      <Checkbox
                        checked={allChecked ? true : someChecked ? "indeterminate" : false}
                        onCheckedChange={(v) => toggleAll(kind, rows.map((r) => r.id), v === true)}
                        aria-label="全选"
                      />
                      <span>会话</span>
                      <span className="ml-auto pr-1">快速分配</span>
                    </div>
                    {rows.slice(0, 30).map((t) => {
                      const CIcon = channelIconOf(t.channel);
                      return (
                        <div key={t.id} className="flex items-start gap-2 px-2 py-2">
                          <Checkbox
                            className="mt-1"
                            checked={sel.has(t.id)}
                            onCheckedChange={(v) => toggleOne(kind, t.id, v === true)}
                          />
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <CIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {CHANNEL_LABEL[t.channel]}
                              </span>
                              <span className="text-sm font-medium truncate">
                                {t.targetName}
                              </span>
                              <span className="text-[11px] text-muted-foreground truncate min-w-0">
                                · {t.counterpartyAddress}
                              </span>
                            </div>
                            {t.lastPreview && (
                              <div className="text-[11px] text-foreground/75 truncate">
                                {t.lastPreview}
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <SlaBadge t={t} />
                            </div>
                          </div>
                          <Select onValueChange={(v) => doAssignOne(t.id, v)}>
                            <SelectTrigger className="h-7 w-32 text-xs mt-1">
                              <SelectValue placeholder="分配给…" />
                            </SelectTrigger>
                            <SelectContent>
                              {groupMembers.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                    {rows.length > 30 && (
                      <div className="text-[11px] text-muted-foreground text-center py-2">
                        仅显示前 30 条，其余请在收件箱中处理
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
    </TooltipProvider>
  );
}

function formatMin(v: number) {
  if (!v) return "—";
  if (v < 60) return `${v} 分钟`;
  const h = Math.floor(v / 60);
  const m = v % 60;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`;
}
function formatHour(v: number) {
  if (!v) return "—";
  if (v < 24) return `${v} 小时`;
  const d = Math.floor(v / 24);
  const h = v % 24;
  return h === 0 ? `${d} 天` : `${d} 天 ${h} 小时`;
}