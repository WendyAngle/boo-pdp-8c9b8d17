import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft, Gauge, Pause, PlayCircle, Ban, CheckCircle2, Loader2, Circle,
  RefreshCcw, AlertTriangle, Mail, Info, FileText,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ManagedStatusBadge } from "@/components/outreach/ManagedStatusBadge";
import {
  useManagedOrders,
  useManagedEngine,
  pauseManagedOrder,
  resumeManagedOrder,
  cancelManagedOrder,
  MANAGED_EMAIL_COST_PER_TARGET,
  MANAGED_EXEC_STATUS,
} from "@/lib/managed-email";

export const Route = createFileRoute("/_app/outreach/admin/managed-exec/$orderId")({
  head: () => ({
    meta: [
      { title: "任务执行详情 | 托管执行台" },
      {
        name: "description",
        content: "查看单个邮件托管任务的自动执行管线：寻源结果、文案、排期、分日发送与补量明细。",
      },
      { property: "og:title", content: "托管任务执行详情" },
      {
        property: "og:description",
        content: "邮件托管任务的执行管线与发送明细监控。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagedExecDetailPage,
});

function fmtTime(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Stage({
  state,
  title,
  desc,
}: {
  state: "done" | "active" | "todo";
  title: string;
  desc: React.ReactNode;
}) {
  const Icon = state === "done" ? CheckCircle2 : state === "active" ? Loader2 : Circle;
  return (
    <div className="flex gap-3">
      <Icon
        className={`h-4 w-4 mt-0.5 shrink-0 ${
          state === "done"
            ? "text-emerald-500"
            : state === "active"
              ? "text-primary animate-spin"
              : "text-muted-foreground/50"
        }`}
      />
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}

function ManagedExecDetailPage() {
  const { orderId } = Route.useParams();
  const orders = useManagedOrders();
  useManagedEngine();
  const o = orders.find((x) => x.id === orderId);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  const logs = useMemo(() => (o?.exec ? [...o.exec.logs].reverse().slice(0, 60) : []), [o]);

  if (!o || !o.exec) {
    return (
      <div className="p-8">
        <Card className="p-12 text-center space-y-3">
          <div className="text-sm text-muted-foreground">该任务尚未受理或不存在执行数据</div>
          <Button asChild variant="outline">
            <Link to="/outreach/admin/managed-exec">返回托管执行台</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const exec = o.exec;
  const pct = o.qty ? Math.round((o.sent / o.qty) * 100) : 0;
  const sourcingDone = exec.sourcing.done;
  const sending = exec.delivery.sent > 0;
  const finished = o.status === "completed" || o.status === "cancelled";
  const successRate = exec.delivery.sent
    ? Math.round((exec.delivery.success / exec.delivery.sent) * 100)
    : 0;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 gap-1">
            <Link to="/outreach/admin/managed-exec">
              <ArrowLeft className="h-4 w-4" />
              返回托管执行台
            </Link>
          </Button>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            {exec.taskNo}
            <ManagedStatusBadge status={o.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            工单 {o.orderNo}｜{o.company}｜{o.product}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="gap-1.5">
            <Link to="/outreach/admin/managed-email/$orderId" params={{ orderId: o.id }}>
              <FileText className="h-4 w-4" />
              工单详情
            </Link>
          </Button>
          {(o.status === "running" || o.status === "sourcing") && (
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                pauseManagedOrder(o.id, "运营手动暂停");
                toast.success("任务已暂停");
              }}
            >
              <Pause className="h-4 w-4" />
              暂停
            </Button>
          )}
          {o.status === "paused" && (
            <Button
              className="gap-1.5"
              onClick={() => {
                resumeManagedOrder(o.id);
                toast.success("任务已恢复自动执行");
              }}
            >
              <PlayCircle className="h-4 w-4" />
              恢复执行
            </Button>
          )}
          {MANAGED_EXEC_STATUS.includes(o.status) && (
            <Button
              variant="outline"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => {
                setReason("");
                setCancelOpen(true);
              }}
            >
              <Ban className="h-4 w-4" />
              中止
            </Button>
          )}
        </div>
      </div>

      {exec.exhausted && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          候选池已耗尽，系统正在发起增量寻源；若仍无法补足，将在结算时按缺口自动退回积分。
        </div>
      )}

      <Card className="p-5 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">目标完成进度（成功触达 / 目标数）</span>
          <span className="tabular-nums text-muted-foreground">
            {o.sent} / {o.qty}（{pct}%）
          </span>
        </div>
        <Progress value={pct} className="h-2" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
          {[
            { label: "累计发出", value: exec.delivery.sent },
            { label: "成功触达", value: exec.delivery.success },
            { label: "退信 / 失败", value: exec.delivery.bounce },
            { label: "自动补量", value: exec.delivery.refill },
            { label: "候选池余量", value: Math.max(0, exec.sourcing.pool - exec.delivery.sent) },
          ].map((s) => (
            <div key={s.label} className="rounded-md bg-muted/40 px-3 py-2">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-lg font-semibold tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5 space-y-4">
          <div className="text-sm font-medium">自动执行管线</div>
          <Stage
            state={sourcingDone ? "done" : "active"}
            title="1. AI 自动寻源"
            desc={
              sourcingDone
                ? `抓取 ${exec.sourcing.raw} 条，去重 ${exec.sourcing.dup}、无效 ${exec.sourcing.invalid}、屏蔽 ${exec.sourcing.blocked}，有效目标 ${exec.sourcing.valid} 个，候选池 ${exec.sourcing.pool} 个`
                : "正在按目标市场与关键词检索并校验邮箱有效性…"
            }
          />
          <Stage
            state={sourcingDone ? "done" : "todo"}
            title="2. 文案就绪"
            desc={`直接使用客户提交的 ${exec.copy.lang.toUpperCase()} 文案，系统自动生成 1 封跟进信`}
          />
          <Stage
            state={sourcingDone ? "done" : "todo"}
            title="3. 自动排期"
            desc={`${exec.schedule.startAt} 起，${exec.schedule.dailyCap} 封/天，预计 ${exec.schedule.days} 天，使用 ${exec.schedule.mailboxes.length} 个发信邮箱`}
          />
          <Stage
            state={finished ? "done" : sending ? "active" : "todo"}
            title="4. 分日发送与自动补量"
            desc={
              finished
                ? `已结束，成功触达 ${exec.delivery.success} 个，成功率 ${successRate}%`
                : `发送中，成功率 ${successRate}%，退信目标自动由候选池替换`
            }
          />
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Mail className="h-4 w-4 text-primary" />
            发送文案与邮箱
          </div>
          <div className="rounded-md border border-border p-3 space-y-1">
            <div className="text-sm font-medium">{exec.copy.subject}</div>
            <div className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">
              {exec.copy.body}
            </div>
          </div>
          <div className="rounded-md bg-muted/40 p-3 space-y-1">
            <div className="text-xs text-muted-foreground">跟进信</div>
            <div className="text-sm">{exec.copy.followupSubject}</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {exec.schedule.mailboxes.map((m) => (
              <Badge key={m} variant="secondary" className="font-normal">
                {m}
              </Badge>
            ))}
          </div>
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5" />
            文案由客户提交，后台不可编辑；如需修改请驳回工单或联系客户重新提交。
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <Tabs defaultValue="daily">
          <div className="px-5 pt-4">
            <TabsList>
              <TabsTrigger value="daily">分日执行</TabsTrigger>
              <TabsTrigger value="logs">发送明细</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="daily" className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日期</TableHead>
                  <TableHead className="text-right">计划</TableHead>
                  <TableHead className="text-right">已发</TableHead>
                  <TableHead className="text-right">成功</TableHead>
                  <TableHead className="text-right">退信</TableHead>
                  <TableHead className="text-right">自动补量</TableHead>
                  <TableHead className="text-right">成功率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exec.daily.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-sm text-muted-foreground py-10"
                    >
                      尚未开始发送
                    </TableCell>
                  </TableRow>
                )}
                {exec.daily.map((d) => (
                  <TableRow key={d.date}>
                    <TableCell className="tabular-nums">{d.date}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.plan}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.sent}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600">
                      {d.success}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      {d.bounce}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{d.refill}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {d.sent ? Math.round((d.success / d.sent) * 100) : 0}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
          <TabsContent value="logs" className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>目标企业</TableHead>
                  <TableHead>联系邮箱</TableHead>
                  <TableHead className="text-right">结果</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-sm text-muted-foreground py-10"
                    >
                      暂无发送记录
                    </TableCell>
                  </TableRow>
                )}
                {logs.map((l, i) => (
                  <TableRow key={`${l.email}-${i}`}>
                    <TableCell className="tabular-nums text-sm">{fmtTime(l.at)}</TableCell>
                    <TableCell className="text-sm">{l.company}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{l.email}</TableCell>
                    <TableCell className="text-right">
                      {l.state === "success" && (
                        <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">
                          成功触达
                        </Badge>
                      )}
                      {l.state === "bounce" && <Badge variant="destructive">退信</Badge>}
                      {l.state === "refilled" && (
                        <Badge variant="secondary" className="gap-1">
                          <RefreshCcw className="h-3 w-3" />
                          已自动补量
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </Card>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>中止托管任务</DialogTitle>
            <DialogDescription>
              未完成的 {o.qty - o.sent} 个目标将按 {MANAGED_EMAIL_COST_PER_TARGET} 积分/目标退回，共{" "}
              {((o.qty - o.sent) * MANAGED_EMAIL_COST_PER_TARGET).toLocaleString()} 积分。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="exec-detail-cancel">中止原因</Label>
            <Textarea
              id="exec-detail-cancel"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="如：客户主动叫停、候选池耗尽无法补量等"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                cancelManagedOrder(o.id, reason.trim() || undefined);
                toast.success("任务已中止，未完成目标积分已退回");
                setCancelOpen(false);
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
