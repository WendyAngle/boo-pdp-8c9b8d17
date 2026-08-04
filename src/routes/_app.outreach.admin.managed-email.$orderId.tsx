import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft, Handshake, Users, Sparkles, Play, Info, Gauge, Mail, Coins, Clock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ManagedStatusBadge } from "@/components/outreach/ManagedStatusBadge";
import {
  useManagedOrders,
  useManagedEngine,
  acceptManagedOrder,
  rejectManagedOrder,
  MANAGED_EMAIL_COST_PER_TARGET,
  type ManagedOrder,
} from "@/lib/managed-email";

export const Route = createFileRoute("/_app/outreach/admin/managed-email/$orderId")({
  head: () => ({
    meta: [
      { title: "工单详情 | 托管工单" },
      {
        name: "description",
        content: "查看邮件托管触达工单的客户需求、发送文案、计费与执行时间线，并进行受理或驳回。",
      },
      { property: "og:title", content: "托管工单详情" },
      {
        property: "og:description",
        content: "邮件托管触达工单的只读详情与受理入口。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagedOrderDetailPage,
});

function fmt(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}

function Section({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-medium text-sm">{title}</span>
        {desc && <span className="text-xs text-muted-foreground">{desc}</span>}
      </div>
      {children}
    </Card>
  );
}

function timeline(o: ManagedOrder) {
  const items: { label: string; at?: string; note?: string }[] = [
    { label: "客户提交需求", at: o.createdAt, note: `${o.qty} 个目标，扣除 ${o.charged.toLocaleString()} 积分` },
  ];
  if (o.status === "rejected") {
    items.push({ label: "运营驳回", at: o.updatedAt, note: o.rejectReason });
    return items;
  }
  if (o.acceptedAt) items.push({ label: "运营受理", at: o.acceptedAt, note: "系统开始自动执行" });
  if (o.exec?.sourcing.done)
    items.push({
      label: "AI 寻源完成",
      note: `有效目标 ${o.exec.sourcing.valid} 个，候选池 ${o.exec.sourcing.pool} 个`,
    });
  if (o.exec && o.exec.delivery.sent > 0)
    items.push({
      label: "自动分日发送",
      note: `已发出 ${o.exec.delivery.sent} 封，成功触达 ${o.exec.delivery.success} 个，自动补量 ${o.exec.delivery.refill} 个`,
    });
  if (o.status === "paused") items.push({ label: "已暂停", at: o.updatedAt, note: o.opsNote });
  if (o.status === "completed") items.push({ label: "任务完成", at: o.updatedAt, note: o.opsNote });
  if (o.status === "cancelled")
    items.push({
      label: "已中止",
      at: o.updatedAt,
      note: `${o.opsNote ?? ""}（退回 ${o.refunded.toLocaleString()} 积分）`,
    });
  return items;
}

function ManagedOrderDetailPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const orders = useManagedOrders();
  useManagedEngine();
  const o = orders.find((x) => x.id === orderId);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!o) {
    return (
      <div className="p-8">
        <Card className="p-12 text-center space-y-3">
          <div className="text-sm text-muted-foreground">工单不存在或已被清理</div>
          <Button asChild variant="outline">
            <Link to="/outreach/admin/managed-email">返回托管工单</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const pct = o.qty ? Math.round((o.sent / o.qty) * 100) : 0;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 gap-1">
            <Link to="/outreach/admin/managed-email">
              <ArrowLeft className="h-4 w-4" />
              返回托管工单
            </Link>
          </Button>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Handshake className="h-5 w-5 text-primary" />
            {o.orderNo}
            <ManagedStatusBadge status={o.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {o.company}｜{o.contact}｜提交于 {fmt(o.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {o.status === "pending" ? (
            <>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  setReason("");
                  setRejectOpen(true);
                }}
              >
                驳回
              </Button>
              <Button
                className="gap-1.5"
                onClick={() => {
                  acceptManagedOrder(o.id);
                  toast.success("已受理，系统开始自动寻源");
                }}
              >
                <Play className="h-4 w-4" />
                受理并自动执行
              </Button>
            </>
          ) : (
            o.exec && (
              <Button asChild className="gap-1.5">
                <Link to="/outreach/admin/managed-exec/$orderId" params={{ orderId: o.id }}>
                  <Gauge className="h-4 w-4" />
                  前往执行台
                </Link>
              </Button>
            )
          )}
        </div>
      </div>

      {o.status !== "pending" && (
        <Card className="p-5 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">完成进度（成功触达 / 目标数）</span>
            <span className="tabular-nums text-muted-foreground">
              {o.sent} / {o.qty}（{pct}%）
            </span>
          </div>
          <Progress value={pct} className="h-2" />
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Section icon={<Users className="h-4 w-4 text-primary" />} title="客户与需求">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="目标来源"
              value={
                <span className="inline-flex items-center gap-1.5">
                  {o.source === "own" ? (
                    <Users className="h-3.5 w-3.5" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {o.source === "own" ? "自有名单" : "AI 智能寻源"}
                </span>
              }
            />
            <Field label="目标数" value={<span className="tabular-nums">{o.qty}</span>} />
            <Field label="推广产品" value={o.product} />
            <Field label="目标市场" value={o.market} />
            <Field label="目标关键词" value={o.keywords} />
            <Field label="期望开始日" value={o.expectStartAt} />
            <Field
              label="每日发送上限"
              value={o.dailyCap ? `${o.dailyCap} 封/天` : "按邮箱健康度自动"}
            />
            <Field label="对接人" value={o.contact} />
          </div>
          {o.note && <Field label="补充说明" value={o.note} />}
        </Section>

        <Section
          icon={<Coins className="h-4 w-4 text-primary" />}
          title="计费"
          desc={`${MANAGED_EMAIL_COST_PER_TARGET} 积分 / 目标，按成功触达数结算`}
        >
          <div className="grid grid-cols-3 gap-4">
            <Field
              label="提单扣除"
              value={<span className="tabular-nums">{o.charged.toLocaleString()}</span>}
            />
            <Field
              label="已退回"
              value={
                <span className="tabular-nums text-emerald-600">
                  {o.refunded.toLocaleString()}
                </span>
              }
            />
            <Field
              label="实际消耗"
              value={
                <span className="tabular-nums">{(o.charged - o.refunded).toLocaleString()}</span>
              }
            />
          </div>
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5" />
            退信 / 失败目标不单独退款，由候选池自动补量；仅当候选池耗尽且增量寻源仍不足，或中止 / 结算时未达目标数，才按缺口退回积分。
          </div>
        </Section>
      </div>

      <Section
        icon={<Mail className="h-4 w-4 text-primary" />}
        title="发送文案（客户提交，只读）"
        desc={`目标语言 ${o.copy.lang.toUpperCase()}`}
      >
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">中文原文</div>
            <div className="rounded-md border border-border p-3 space-y-2">
              <div className="text-sm font-medium">{o.copy.subject}</div>
              <div className="text-sm whitespace-pre-wrap text-muted-foreground">{o.copy.body}</div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">目标语言译文（实际发送版本）</div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="text-sm font-medium">
                {o.copy.translatedSubject || o.copy.subject}
              </div>
              <div className="text-sm whitespace-pre-wrap text-muted-foreground">
                {o.copy.translatedBody || o.copy.body}
              </div>
            </div>
          </div>
        </div>
        {o.exec && (
          <div className="rounded-md bg-muted/40 p-3 space-y-1">
            <div className="text-xs text-muted-foreground">跟进信（系统按模板自动生成）</div>
            <div className="text-sm font-medium">{o.exec.copy.followupSubject}</div>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap">
              {o.exec.copy.followupBody}
            </div>
          </div>
        )}
      </Section>

      <Section icon={<Clock className="h-4 w-4 text-primary" />} title="执行时间线">
        <ol className="space-y-3">
          {timeline(o).map((t, i) => (
            <li key={i} className="flex gap-3">
              <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
              <div className="space-y-0.5">
                <div className="text-sm font-medium">
                  {t.label}
                  {t.at && (
                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                      {fmt(t.at)}
                    </span>
                  )}
                </div>
                {t.note && <div className="text-xs text-muted-foreground">{t.note}</div>}
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>驳回托管工单</DialogTitle>
            <DialogDescription>
              驳回后已扣的 {o.charged.toLocaleString()} 积分将全额退回客户，原因对客户可见。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="detail-reject">驳回原因</Label>
            <Textarea
              id="detail-reject"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="如：名单有效邮箱不足、目标条件过窄、文案存在合规风险等"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim()}
              onClick={() => {
                rejectManagedOrder(o.id, reason.trim());
                toast.success("已驳回，积分已退回客户");
                setRejectOpen(false);
                navigate({ to: "/outreach/admin/managed-email" });
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
