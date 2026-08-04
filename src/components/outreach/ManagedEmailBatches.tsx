import { useState } from "react";
import { toast } from "sonner";
import { Handshake, Users, Sparkles, Ban, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  useManagedOrders,
  cancelManagedOrder,
  MANAGED_EMAIL_COST_PER_TARGET,
  MANAGED_STATUS_LABEL,
  type ManagedOrder,
  type ManagedStatus,
} from "@/lib/managed-email";

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

/** 用户侧：邮件托管批次进度与中途叫停 */
export function ManagedEmailBatches() {
  const orders = useManagedOrders();
  const [cancelOf, setCancelOf] = useState<ManagedOrder | null>(null);
  if (orders.length === 0) return null;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Handshake className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm">邮件托管批次</span>
        <span className="text-xs text-muted-foreground">
          由平台营销团队以你的企业名义代为执行，{MANAGED_EMAIL_COST_PER_TARGET} 积分/目标
        </span>
      </div>

      <div className="grid gap-3">
        {orders.map((o) => {
          const pct = o.qty ? Math.round((o.sent / o.qty) * 100) : 0;
          const active = o.status === "pending" || o.status === "running";
          return (
            <div key={o.id} className="rounded-lg border border-border p-4 space-y-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm tabular-nums">{o.orderNo}</span>
                <Badge variant="outline" className={cn("font-normal", STATUS_CLS[o.status])}>
                  {MANAGED_STATUS_LABEL[o.status]}
                </Badge>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {o.source === "own" ? (
                    <Users className="h-3.5 w-3.5" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {o.source === "own" ? "自有名单" : "AI 智能寻源"}
                </span>
                <span className="text-xs text-muted-foreground">推广产品：{o.product}</span>
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    已扣 {o.charged.toLocaleString()} 积分
                    {o.refunded > 0 && `，已退回 ${o.refunded.toLocaleString()}`}
                  </span>
                  {active && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 text-destructive hover:text-destructive"
                      onClick={() => setCancelOf(o)}
                    >
                      <Ban className="h-3.5 w-3.5" />
                      中途叫停
                    </Button>
                  )}
                </div>
              </div>
              <Progress value={pct} className="h-1.5" />
              <div className="text-xs text-muted-foreground tabular-nums">
                执行进度 {o.sent} / {o.qty}（{pct}%）
                {o.status === "pending" && " · 营销团队将在 1 个工作日内受理"}
                {o.assignee && ` · 对接顾问：${o.assignee}`}
              </div>
              {(o.rejectReason || o.opsNote) && (
                <div className="text-xs text-muted-foreground rounded-md bg-muted/50 px-2.5 py-1.5">
                  {o.rejectReason ? `驳回原因：${o.rejectReason}` : `顾问备注：${o.opsNote}`}
                </div>
              )}

            </div>
          );
        })}
      </div>

      <Dialog open={!!cancelOf} onOpenChange={(v) => !v && setCancelOf(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认中途叫停？</DialogTitle>
            <DialogDescription>
              批次 {cancelOf?.orderNo} 剩余 {cancelOf ? cancelOf.qty - cancelOf.sent : 0} 个未执行目标将停止发送，
              并退回{" "}
              {cancelOf
                ? ((cancelOf.qty - cancelOf.sent) * MANAGED_EMAIL_COST_PER_TARGET).toLocaleString()
                : 0}{" "}
              积分。
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5" />
            已执行部分不退积分；叫停后不可恢复，如需继续需重新提交托管需求。
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOf(null)}>
              再想想
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!cancelOf) return;
                cancelManagedOrder(cancelOf.id, "客户中途叫停");
                toast.success("已叫停，未执行目标的积分已退回");
                setCancelOf(null);
              }}
            >
              确认叫停
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
