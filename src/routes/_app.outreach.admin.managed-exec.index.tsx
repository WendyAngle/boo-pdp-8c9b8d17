import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Gauge, Search, Pause, PlayCircle, Ban, ArrowRight, AlertTriangle, Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { ManagedStatusBadge } from "@/components/outreach/ManagedStatusBadge";
import {
  useManagedOrders,
  useManagedEngine,
  pauseManagedOrder,
  resumeManagedOrder,
  cancelManagedOrder,
  MANAGED_EMAIL_COST_PER_TARGET,
  MANAGED_EXEC_STATUS,
  type ManagedOrder,
} from "@/lib/managed-email";

export const Route = createFileRoute("/_app/outreach/admin/managed-exec/")({
  head: () => ({
    meta: [
      { title: "托管执行台 | 出海大数据平台" },
      {
        name: "description",
        content: "监控全部邮件托管任务的自动执行情况：寻源、分日发送、退信补量与异常处理。",
      },
      { property: "og:title", content: "托管执行台 · 运营管理" },
      {
        property: "og:description",
        content: "邮件托管任务自动执行的运行监控与暂停、恢复、中止操作。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagedExecPage,
});

function ManagedExecPage() {
  const orders = useManagedOrders();
  useManagedEngine();
  const [kw, setKw] = useState("");
  const [scope, setScope] = useState<"exec" | "all" | "abnormal">("exec");
  const [cancelOf, setCancelOf] = useState<ManagedOrder | null>(null);
  const [reason, setReason] = useState("");

  const isAbnormal = (o: ManagedOrder) => o.status === "paused" || !!o.exec?.exhausted;

  const rows = useMemo(() => {
    const k = kw.trim().toLowerCase();
    return orders
      .filter((o) => !!o.exec)
      .filter((o) => {
        if (scope === "exec" && !MANAGED_EXEC_STATUS.includes(o.status)) return false;
        if (scope === "abnormal" && !isAbnormal(o)) return false;
        if (!k) return true;
        return [o.orderNo, o.company, o.product].some((v) => v.toLowerCase().includes(k));
      })
      .sort((a, b) => Number(isAbnormal(b)) - Number(isAbnormal(a)));
  }, [orders, kw, scope]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let sent = 0;
    let success = 0;
    let bounce = 0;
    let refill = 0;
    orders.forEach((o) => {
      const d = o.exec?.daily.find((x) => x.date === today);
      if (!d) return;
      sent += d.sent;
      success += d.success;
      bounce += d.bounce;
      refill += d.refill;
    });
    return {
      running: orders.filter((o) => MANAGED_EXEC_STATUS.includes(o.status)).length,
      sent,
      rate: sent ? Math.round((success / sent) * 100) : 0,
      bounceRate: sent ? Math.round((bounce / sent) * 100) : 0,
      refill,
      abnormal: orders.filter((o) => !!o.exec && isAbnormal(o)).length,
    };
  }, [orders]);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Gauge className="h-5 w-5 text-primary" />
          托管执行台
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          任务由系统自动寻源、排期与发送，退信 / 失败目标自动从候选池补量，直至完成客户设定的目标数；
          人工仅在异常时暂停、恢复或中止退款。
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "执行中任务", value: `${stats.running}` },
          { label: "今日已发", value: `${stats.sent}` },
          { label: "今日成功率", value: `${stats.rate}%` },
          { label: "今日退信率", value: `${stats.bounceRate}%` },
          { label: "今日自动补量", value: `${stats.refill}` },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">{s.value}</div>
          </Card>
        ))}
      </div>

      {stats.abnormal > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          有 {stats.abnormal} 个任务处于异常（已暂停 / 候选池不足），请优先处理。
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3 flex items-center gap-3 flex-wrap border-b border-border bg-muted/20">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder="搜索工单号 / 企业 / 产品"
              className="h-9 w-[260px] pl-8 bg-background"
            />
          </div>
          <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
            <SelectTrigger className="h-9 w-[150px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exec">执行中任务</SelectItem>
              <SelectItem value="abnormal">仅看异常</SelectItem>
              <SelectItem value="all">全部任务</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>工单号 / 任务号</TableHead>
              <TableHead className="min-w-[160px]">客户企业 / 产品</TableHead>
              <TableHead className="w-[200px]">目标完成进度</TableHead>
              <TableHead>今日配额</TableHead>
              <TableHead>排期</TableHead>
              <TableHead>发信邮箱</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right min-w-[230px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-12">
                  暂无符合条件的执行任务
                </TableCell>
              </TableRow>
            )}
            {rows.map((o) => {
              const exec = o.exec!;
              const pct = o.qty ? Math.round((o.sent / o.qty) * 100) : 0;
              const abnormal = isAbnormal(o);
              return (
                <TableRow key={o.id}>
                  <TableCell>
                    <div className="font-medium tabular-nums">{o.orderNo}</div>
                    <div className="text-xs text-muted-foreground">{exec.taskNo}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{o.company}</div>
                    <div className="text-xs text-muted-foreground">{o.product}</div>
                  </TableCell>
                  <TableCell>
                    <Progress value={pct} className="h-1.5" />
                    <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                      {o.sent} / {o.qty}（{pct}%）· 补量 {exec.delivery.refill}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums text-sm">
                    {exec.schedule.dailyCap} 封/天
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="tabular-nums">{exec.schedule.startAt}</div>
                    <div className="text-xs text-muted-foreground">共 {exec.schedule.days} 天</div>
                  </TableCell>
                  <TableCell className="tabular-nums text-sm">
                    {exec.schedule.mailboxes.length} 个
                  </TableCell>
                  <TableCell>
                    <ManagedStatusBadge status={o.status} />
                    {exec.exhausted && (
                      <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-600">
                        <AlertTriangle className="h-3 w-3" />
                        候选池不足
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {(o.status === "running" || o.status === "sourcing") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1"
                        onClick={() => {
                          pauseManagedOrder(o.id, "运营手动暂停");
                          toast.success("任务已暂停");
                        }}
                      >
                        <Pause className="h-3.5 w-3.5" />
                        暂停
                      </Button>
                    )}
                    {o.status === "paused" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1"
                        onClick={() => {
                          resumeManagedOrder(o.id);
                          toast.success("任务已恢复自动执行");
                        }}
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                        恢复
                      </Button>
                    )}
                    {MANAGED_EXEC_STATUS.includes(o.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1 text-destructive hover:text-destructive"
                        onClick={() => {
                          setCancelOf(o);
                          setReason("");
                        }}
                      >
                        <Ban className="h-3.5 w-3.5" />
                        中止
                      </Button>
                    )}
                    <Button asChild size="sm" variant="outline" className="h-8 gap-1 ml-1">
                      <Link to="/outreach/admin/managed-exec/$orderId" params={{ orderId: o.id }}>
                        详情
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!cancelOf} onOpenChange={(v) => !v && setCancelOf(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>中止托管任务</DialogTitle>
            <DialogDescription>
              工单 {cancelOf?.orderNo}｜未完成的{" "}
              {cancelOf ? cancelOf.qty - cancelOf.sent : 0} 个目标将按{" "}
              {MANAGED_EMAIL_COST_PER_TARGET} 积分/目标退回，共{" "}
              {cancelOf
                ? ((cancelOf.qty - cancelOf.sent) * MANAGED_EMAIL_COST_PER_TARGET).toLocaleString()
                : 0}{" "}
              积分。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="exec-cancel-reason">中止原因</Label>
            <Textarea
              id="exec-cancel-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="如：客户主动叫停、候选池耗尽无法补量、邮箱资源受限等"
            />
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5" />
              中止不可撤销，已成功触达部分不退积分。
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
                cancelManagedOrder(cancelOf.id, reason.trim() || undefined);
                toast.success("任务已中止，未完成目标积分已退回");
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
