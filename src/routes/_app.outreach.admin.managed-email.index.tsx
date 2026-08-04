import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Handshake, Search, Users, Sparkles, Play, AlertTriangle, ArrowRight, FileText,
} from "lucide-react";
import { toast } from "sonner";
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
import { cn } from "@/lib/utils";
import { ManagedStatusBadge } from "@/components/outreach/ManagedStatusBadge";
import {
  useManagedOrders,
  useManagedEngine,
  acceptManagedOrder,
  rejectManagedOrder,
  MANAGED_EMAIL_COST_PER_TARGET,
  MANAGED_STATUS_LABEL,
  managedSla,
  type ManagedOrder,
  type ManagedStatus,
} from "@/lib/managed-email";

export const Route = createFileRoute("/_app/outreach/admin/managed-email/")({
  head: () => ({
    meta: [
      { title: "托管工单 | 出海大数据平台" },
      {
        name: "description",
        content: "运营侧受理或驳回邮件托管触达需求，受理后由系统自动寻源、发送并按成功触达数结算",
      },
      { property: "og:title", content: "托管工单 · 运营管理" },
      {
        property: "og:description",
        content: "集中受理客户提交的邮件托管触达需求，查看工单详情与执行进度。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagedEmailAdminPage,
});

function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ManagedEmailAdminPage() {
  const orders = useManagedOrders();
  useManagedEngine();
  const [kw, setKw] = useState("");
  const [status, setStatus] = useState<"all" | ManagedStatus>("all");
  const [source, setSource] = useState<"all" | "own" | "ai">("all");
  const [rejectOf, setRejectOf] = useState<ManagedOrder | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const rows = useMemo(() => {
    const k = kw.trim().toLowerCase();
    return orders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (source !== "all" && o.source !== source) return false;
      if (!k) return true;
      return [o.orderNo, o.product, o.contact, o.company, o.market ?? ""].some((v) =>
        v.toLowerCase().includes(k),
      );
    });
  }, [orders, kw, status, source]);

  const stats = useMemo(() => {
    const month = new Date().getMonth();
    return {
      pending: orders.filter((o) => o.status === "pending").length,
      running: orders.filter((o) => o.status === "running" || o.status === "sourcing").length,
      today: orders.filter(
        (o) => new Date(o.createdAt).toDateString() === new Date().toDateString(),
      ).length,
      monthTargets: orders
        .filter((o) => new Date(o.createdAt).getMonth() === month)
        .reduce((s, o) => s + o.qty, 0),
      refunded: orders.reduce((s, o) => s + o.refunded, 0),
    };
  }, [orders]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Handshake className="h-5 w-5 text-primary" />
            托管工单
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            受理客户提交的邮件托管触达需求；受理后由系统自动寻源、按客户提交的目标语言文案发送，
            失败目标自动补量，按成功触达数以 {MANAGED_EMAIL_COST_PER_TARGET} 积分/目标结算。
          </p>
        </div>
        <Button asChild variant="outline" className="gap-1.5">
          <Link to="/outreach/admin/managed-exec">
            托管执行台
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "待受理", value: stats.pending },
          { label: "执行中", value: stats.running },
          { label: "今日新增", value: stats.today },
          { label: "本月目标总量", value: stats.monthTargets },
          { label: "累计退款积分", value: stats.refunded },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">
              {s.value.toLocaleString()}
            </div>
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
              placeholder="搜索工单号 / 企业 / 推广产品"
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
          <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
            <SelectTrigger className="h-9 w-[150px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部来源</SelectItem>
              <SelectItem value="own">自有名单</SelectItem>
              <SelectItem value="ai">AI 智能寻源</SelectItem>
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
              <TableHead className="w-[190px]">完成进度</TableHead>
              <TableHead className="text-right">积分</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right min-w-[220px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-12">
                  暂无托管工单
                </TableCell>
              </TableRow>
            )}
            {rows.map((o) => {
              const pct = o.qty ? Math.round((o.sent / o.qty) * 100) : 0;
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
                      目标语言：{o.copy.lang.toUpperCase()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{o.product}</div>
                    <div className="text-xs text-muted-foreground">{o.market || "—"}</div>
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
                    <ManagedStatusBadge status={o.status} />
                    {sla !== "ok" && (
                      <div
                        className={cn(
                          "mt-1 inline-flex items-center gap-1 text-[11px]",
                          sla === "overdue" ? "text-rose-600" : "text-amber-600",
                        )}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {sla === "overdue" ? "受理超时 >24h" : "执行异常预警"}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {o.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1 mr-1"
                          onClick={() => {
                            acceptManagedOrder(o.id);
                            toast.success(`工单 ${o.orderNo} 已受理，系统开始自动寻源`);
                          }}
                        >
                          <Play className="h-3.5 w-3.5" />
                          受理
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 mr-1 text-destructive hover:text-destructive"
                          onClick={() => {
                            setRejectOf(o);
                            setRejectReason("");
                          }}
                        >
                          驳回
                        </Button>
                      </>
                    )}
                    <Button asChild size="sm" variant="ghost" className="h-8 gap-1">
                      <Link
                        to="/outreach/admin/managed-email/$orderId"
                        params={{ orderId: o.id }}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        详情
                      </Link>
                    </Button>
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
              placeholder="如：名单有效邮箱不足、目标条件过窄无法凑齐起做量、文案存在合规风险等"
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
    </div>
  );
}
