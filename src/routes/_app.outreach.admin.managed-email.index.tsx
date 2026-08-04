import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Handshake, Search, Users, Sparkles, Play, CheckCircle2, Ban, Info, AlertTriangle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useManagedOrders,
  acceptManagedOrder,
  updateManagedProgress,
  completeManagedOrder,
  cancelManagedOrder,
  assignManagedOrder,
  rejectManagedOrder,
  MANAGED_ASSIGNEES,
  MANAGED_EMAIL_COST_PER_TARGET,
  MANAGED_STATUS_LABEL,
  MANAGED_ACTIVE_STATUS,
  managedSla,
  type ManagedOrder,
  type ManagedStatus,
} from "@/lib/managed-email";

export const Route = createFileRoute("/_app/outreach/admin/managed-email/")({
  head: () => ({
    meta: [
      { title: "邮件托管工单 | 出海大数据平台" },
      {
        name: "description",
        content: "运营侧受理邮件托管触达需求、回填执行进度、结算批次并处理中途叫停退回",
      },
      { property: "og:title", content: "邮件托管工单 · 运营管理" },
      {
        property: "og:description",
        content: "集中管理客户提交的邮件托管触达批次：受理、执行、结算与退回。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagedEmailAdminPage,
});

const STATUS_CLS: Record<ManagedStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  claimed: "bg-indigo-50 text-indigo-700 border-indigo-200",
  confirming: "bg-violet-50 text-violet-700 border-violet-200",
  queued: "bg-sky-50 text-sky-700 border-sky-200",
  running: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-muted text-muted-foreground border-border",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
};

function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ManagedEmailAdminPage() {
  const orders = useManagedOrders();
  const [kw, setKw] = useState("");
  const [status, setStatus] = useState<"all" | ManagedStatus>("all");
  const [progressOf, setProgressOf] = useState<ManagedOrder | null>(null);
  const [progressVal, setProgressVal] = useState("");
  const [cancelOf, setCancelOf] = useState<ManagedOrder | null>(null);
  const [rejectOf, setRejectOf] = useState<ManagedOrder | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const rows = useMemo(() => {
    const k = kw.trim().toLowerCase();
    return orders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (!k) return true;
      return [o.orderNo, o.product, o.contact, o.market ?? ""].some((v) =>
        v.toLowerCase().includes(k),
      );
    });
  }, [orders, kw, status]);

  const stats = useMemo(() => {
    const pending = orders.filter((o) => o.status === "pending").length;
    const running = orders.filter((o) => o.status === "running").length;
    const targets = orders.reduce((s, o) => s + o.qty, 0);
    const sent = orders.reduce((s, o) => s + o.sent, 0);
    return { pending, running, targets, sent };
  }, [orders]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Handshake className="h-5 w-5 text-primary" />
          邮件托管工单
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          受理客户提交的邮件托管触达需求，回填执行进度并结算批次；中止或结算时未执行目标按{" "}
          {MANAGED_EMAIL_COST_PER_TARGET} 积分/目标自动退回。
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "待受理", value: stats.pending },
          { label: "执行中", value: stats.running },
          { label: "累计目标数", value: stats.targets },
          { label: "累计已发出", value: stats.sent },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">{s.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3 flex items-center gap-3 flex-wrap border-b border-border bg-muted/20">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder="搜索工单号 / 推广产品 / 对接人"
              className="h-9 w-[260px] pl-8 bg-background"
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="h-9 w-[140px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {(Object.keys(MANAGED_STATUS_LABEL) as ManagedStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {MANAGED_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>工单号 / 提交时间</TableHead>
              <TableHead className="min-w-[180px]">客户企业 / 对接人</TableHead>
              <TableHead className="min-w-[130px]">目标来源</TableHead>
              <TableHead className="min-w-[150px]">推广产品 / 市场</TableHead>
              <TableHead>负责顾问</TableHead>
              <TableHead className="w-[200px]">执行进度</TableHead>
              <TableHead className="text-right">积分</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right min-w-[220px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-12">
                  暂无托管工单
                </TableCell>
              </TableRow>
            )}
            {rows.map((o) => {
              const pct = o.qty ? Math.round((o.sent / o.qty) * 100) : 0;
              const active = MANAGED_ACTIVE_STATUS.includes(o.status);
              const sla = managedSla(o);
              return (
                <TableRow key={o.id}>
                  <TableCell>
                    <div className="font-medium tabular-nums">{o.orderNo}</div>
                    <div className="text-xs text-muted-foreground">{fmt(o.createdAt)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{o.company}</div>
                    <div className="text-xs text-muted-foreground">{o.contact}</div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      {o.source === "own" ? (
                        <Users className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                      )}
                      {o.source === "own" ? "自有名单" : "AI 智能寻源"}
                    </span>
                    <div className="text-xs text-muted-foreground">
                      {o.copyMode === "client" ? "客户自有文案" : "我方撰写文案"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{o.product}</div>
                    <div className="text-xs text-muted-foreground">{o.market || "—"}</div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={o.assignee ?? "none"}
                      onValueChange={(v) => {
                        assignManagedOrder(o.id, v === "none" ? "" : v);
                        if (v !== "none") toast.success(`已指派给 ${v}`);
                      }}
                    >
                      <SelectTrigger className="h-8 w-[132px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">未指派</SelectItem>
                        {MANAGED_ASSIGNEES.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>

                  <TableCell>
                    <Progress value={pct} className="h-1.5" />
                    <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                      {o.sent} / {o.qty}（{pct}%）
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    <div>扣 {o.charged.toLocaleString()}</div>
                    {o.refunded > 0 && (
                      <div className="text-xs text-emerald-600">退 {o.refunded.toLocaleString()}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("font-normal", STATUS_CLS[o.status])}>
                      {MANAGED_STATUS_LABEL[o.status]}
                    </Badge>
                    {sla !== "ok" && (
                      <div
                        className={cn(
                          "mt-1 inline-flex items-center gap-1 text-[11px]",
                          sla === "overdue" ? "text-rose-600" : "text-amber-600",
                        )}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {sla === "overdue" ? "受理超时 >24h" : "交付超期预警"}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {o.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1"
                          onClick={() => {
                            acceptManagedOrder(o.id);
                            toast.success(`工单 ${o.orderNo} 已受理，可进入执行台`);
                          }}
                        >
                          <Play className="h-3.5 w-3.5" />
                          受理
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1 text-destructive hover:text-destructive"
                          onClick={() => {
                            setRejectOf(o);
                            setRejectReason("");
                          }}
                        >
                          驳回
                        </Button>
                      </>
                    )}

                    {active && o.status !== "pending" && (
                      <Button asChild size="sm" variant="outline" className="h-8 gap-1 mr-1">
                        <Link
                          to="/outreach/admin/managed-email/$orderId"
                          params={{ orderId: o.id }}
                        >
                          执行台
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}

                    {active && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={() => {
                            setProgressOf(o);
                            setProgressVal(String(o.sent));
                          }}
                        >
                          回填进度
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1"
                          onClick={() => {
                            completeManagedOrder(o.id);
                            toast.success(`工单 ${o.orderNo} 已结算完成`);
                          }}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          结算
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1 text-destructive hover:text-destructive"
                          onClick={() => {
                            setCancelOf(o);
                            setCancelReason("");
                          }}
                        >
                          <Ban className="h-3.5 w-3.5" />
                          中止
                        </Button>
                      </>
                    )}
                    {!active && <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* 驳回 */}
      <Dialog open={!!rejectOf} onOpenChange={(v) => !v && setRejectOf(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>驳回托管工单</DialogTitle>
            <DialogDescription>
              工单 {rejectOf?.orderNo}｜驳回后该批次已扣的{" "}
              {rejectOf ? rejectOf.charged.toLocaleString() : 0} 积分将全额退回客户，原因对客户可见。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">驳回原因</Label>
            <Textarea
              id="reject-reason"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="如：名单有效邮箱不足、目标条件过窄无法凑齐起做量等"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOf(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim()}
              onClick={() => {
                if (!rejectOf) return;
                rejectManagedOrder(rejectOf.id, rejectReason.trim());
                toast.success(`工单 ${rejectOf.orderNo} 已驳回，积分已退回`);
                setRejectOf(null);
              }}
            >
              确认驳回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 回填进度 */}

      <Dialog open={!!progressOf} onOpenChange={(v) => !v && setProgressOf(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>回填执行进度</DialogTitle>
            <DialogDescription>
              工单 {progressOf?.orderNo}｜目标总数 {progressOf?.qty}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sent">已发出目标数</Label>
            <Input
              id="sent"
              inputMode="numeric"
              value={progressVal}
              onChange={(e) => setProgressVal(e.target.value.replace(/[^\d]/g, ""))}
            />
            <p className="text-xs text-muted-foreground">
              进度仅用于结算口径；未执行部分在结算或中止时按 {MANAGED_EMAIL_COST_PER_TARGET} 积分/目标退回。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProgressOf(null)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (!progressOf) return;
                updateManagedProgress(progressOf.id, Number(progressVal) || 0);
                toast.success("执行进度已更新");
                setProgressOf(null);
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 中止 */}
      <Dialog open={!!cancelOf} onOpenChange={(v) => !v && setCancelOf(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>中止托管工单</DialogTitle>
            <DialogDescription>
              工单 {cancelOf?.orderNo}｜剩余{" "}
              {cancelOf ? cancelOf.qty - cancelOf.sent : 0} 个未执行目标将退回{" "}
              {cancelOf
                ? ((cancelOf.qty - cancelOf.sent) * MANAGED_EMAIL_COST_PER_TARGET).toLocaleString()
                : 0}{" "}
              积分。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">中止原因</Label>
            <Textarea
              id="reason"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="如：客户主动叫停、名单质量不达标等"
            />
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5" />
              中止不可撤销，已执行部分不退积分。
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOf(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!cancelOf) return;
                cancelManagedOrder(cancelOf.id, cancelReason.trim() || undefined);
                toast.success(`工单 ${cancelOf.orderNo} 已中止，未执行目标积分已退回`);
                setCancelOf(null);
              }}
            >
              确认中止
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
