import { useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  Users,
  Sparkles,
  FileText,
  CalendarClock,
  Rocket,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  useManagedOrders,
  updateManagedExec,
  submitManagedPlan,
  confirmManagedPlan,
  generateManagedTasks,
  MANAGED_MAILBOXES,
  MANAGED_STATUS_LABEL,
  MANAGED_EMAIL_COST_PER_TARGET,
  type ManagedExecStep,
} from "@/lib/managed-email";

export const Route = createFileRoute("/_app/outreach/admin/managed-email/$orderId")({
  head: () => ({
    meta: [
      { title: "托管任务执行台 | 出海大数据平台" },
      {
        name: "description",
        content: "顾问在执行台完成目标确认、文案撰写、投递排期与发信任务生成四步交付流程。",
      },
      { property: "og:title", content: "托管任务执行台" },
      {
        property: "og:description",
        content: "邮件托管工单受理后的四步执行工作区：目标确认、文案、排期、生成任务。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagedEmailExecPage,
});

const STEPS = [
  { title: "目标确认", icon: Users },
  { title: "文案准备", icon: FileText },
  { title: "投递排期", icon: CalendarClock },
  { title: "生成任务", icon: Rocket },
];

function ManagedEmailExecPage() {
  const { orderId } = useParams({ from: "/_app/outreach/admin/managed-email/$orderId" });
  const orders = useManagedOrders();
  const order = orders.find((o) => o.id === orderId);

  if (!order || !order.exec) {
    return (
      <Card className="p-10 text-center space-y-3">
        <div className="text-sm text-muted-foreground">
          工单不存在或尚未受理，受理后才会生成执行台工作区。
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/outreach/admin/managed-email">返回工单池</Link>
        </Button>
      </Card>
    );
  }

  const exec = order.exec;
  const step = exec.step;

  const setStep = (s: ManagedExecStep) => updateManagedExec(order.id, { step: s });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Button asChild variant="ghost" size="sm" className="h-7 -ml-2 mb-1 gap-1">
            <Link to="/outreach/admin/managed-email">
              <ArrowLeft className="h-3.5 w-3.5" />
              返回工单池
            </Link>
          </Button>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            托管任务执行台
            <Badge variant="outline" className="font-normal">
              {MANAGED_STATUS_LABEL[order.status]}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            工单 {order.orderNo} · {order.company} · {order.contact} · 负责顾问{" "}
            {order.assignee || "未指派"}
          </p>
        </div>
        <Card className="p-3 text-sm space-y-1 min-w-[220px]">
          <div className="flex items-center gap-1.5">
            {order.source === "own" ? (
              <Users className="h-3.5 w-3.5 text-primary" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            )}
            {order.source === "own" ? "自有名单" : "AI 智能寻源"} · {order.qty} 个目标
          </div>
          <div className="text-xs text-muted-foreground">
            推广产品：{order.product}
            {order.market ? ` · ${order.market}` : ""}
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            已扣 {order.charged.toLocaleString()} 积分（{MANAGED_EMAIL_COST_PER_TARGET} /目标）
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done =
              (i === 0 && exec.targets.confirmed) ||
              (i === 1 && exec.copy.confirmed) ||
              (i === 2 && exec.schedule.confirmed) ||
              (i === 3 && !!exec.taskNo);
            return (
              <button
                key={s.title}
                onClick={() => setStep(i as ManagedExecStep)}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-left transition-colors",
                  step === i
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">
                  {i + 1}. {s.title}
                </span>
                {done && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              </button>
            );
          })}
        </div>
      </Card>

      {step === 0 && <TargetStep order={order} />}
      {step === 1 && <CopyStep order={order} />}
      {step === 2 && <ScheduleStep order={order} />}
      {step === 3 && <GenerateStep order={order} />}
    </div>
  );
}

type P = { order: NonNullable<ReturnType<typeof useManagedOrders>>[number] };

function TargetStep({ order }: P) {
  const t = order.exec!.targets;
  const [dup, setDup] = useState(String(t.dup));
  const [invalid, setInvalid] = useState(String(t.invalid));
  const [blocked, setBlocked] = useState(String(t.blocked));
  const [note, setNote] = useState(t.note ?? "");

  const valid = useMemo(
    () => Math.max(0, t.raw - (+dup || 0) - (+invalid || 0) - (+blocked || 0)),
    [t.raw, dup, invalid, blocked],
  );
  const gap = order.qty - valid;

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-medium">1. 目标确认</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {order.source === "own"
            ? "载入客户勾选的目标名单，做去重、无效邮箱剔除、退订/黑名单过滤，输出目标池供客户确认。"
            : "顾问在企业名录中按关键词检索筛选，凑够约定数量；数量不足时与客户协商下调，差额按积分退回。"}
          {order.keywords ? ` 关键词：${order.keywords}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-md border border-border p-3">
          <div className="text-xs text-muted-foreground">原始目标</div>
          <div className="text-xl font-semibold tabular-nums">{t.raw}</div>
        </div>
        <Field label="重复剔除" value={dup} onChange={setDup} />
        <Field label="无效邮箱" value={invalid} onChange={setInvalid} />
        <Field label="退订/黑名单" value={blocked} onChange={setBlocked} />
      </div>

      <div className="rounded-md bg-muted/40 border border-border p-3 text-sm">
        有效目标池：<span className="font-semibold tabular-nums">{valid}</span> 个
        {gap > 0 && (
          <span className="ml-2 text-amber-600 inline-flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            较约定数量缺口 {gap} 个，结算时按 {gap * MANAGED_EMAIL_COST_PER_TARGET} 积分退回
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>目标池说明（客户可见）</Label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="如：已剔除 3 家现有经销商，德国区补充 40 家新目标。"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            updateManagedExec(order.id, {
              targets: {
                ...t,
                dup: +dup || 0,
                invalid: +invalid || 0,
                blocked: +blocked || 0,
                valid,
                note,
              },
            });
            toast.success("目标池已保存");
          }}
        >
          保存
        </Button>
        <Button
          onClick={() => {
            updateManagedExec(order.id, {
              step: 1,
              targets: {
                ...t,
                dup: +dup || 0,
                invalid: +invalid || 0,
                blocked: +blocked || 0,
                valid,
                note,
                confirmed: true,
              },
            });
            toast.success("目标池已确认，进入文案准备");
          }}
        >
          确认目标池并继续
        </Button>
      </div>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-md border border-border p-3 space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className="h-8"
        inputMode="numeric"
      />
    </div>
  );
}

function CopyStep({ order }: P) {
  const c = order.exec!.copy;
  const [subject, setSubject] = useState(c.subject);
  const [body, setBody] = useState(c.body);
  const [fs, setFs] = useState(c.followupSubject ?? "");
  const [fb, setFb] = useState(c.followupBody ?? "");

  const save = (confirmed: boolean) => {
    updateManagedExec(order.id, {
      step: confirmed ? 2 : 1,
      copy: { ...c, subject, body, followupSubject: fs, followupBody: fb, confirmed },
    });
    toast.success(confirmed ? "文案已确认，进入投递排期" : "文案已保存");
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-medium">2. 文案准备</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {order.copyMode === "client"
            ? "客户提供文案：录入客户文案，顾问做合规与送达率优化。"
            : "顾问代写：基于企业资料与推广产品生成首封开发信与一封跟进信，供客户确认。"}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>首封邮件主题</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>首封邮件正文</Label>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} />
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>跟进信主题（可选）</Label>
          <Input value={fs} onChange={(e) => setFs(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>跟进信正文（可选）</Label>
          <Textarea value={fb} onChange={(e) => setFb(e.target.value)} rows={3} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => save(false)}>
          保存
        </Button>
        <Button onClick={() => save(true)} disabled={!subject.trim() || !body.trim()}>
          确认文案并继续
        </Button>
      </div>
    </Card>
  );
}

function ScheduleStep({ order }: P) {
  const s = order.exec!.schedule;
  const valid = order.exec!.targets.valid || order.qty;
  const [startAt, setStartAt] = useState(s.startAt);
  const [cap, setCap] = useState(String(s.dailyCap));
  const [boxes, setBoxes] = useState<string[]>(s.mailboxes);

  const days = Math.max(1, Math.ceil(valid / Math.max(1, +cap || 1)));

  const toggle = (m: string) =>
    setBoxes((b) => (b.includes(m) ? b.filter((x) => x !== m) : [...b, m]));

  const save = (confirmed: boolean) => {
    updateManagedExec(order.id, {
      step: confirmed ? 3 : 2,
      schedule: { startAt, dailyCap: +cap || 0, days, mailboxes: boxes, confirmed },
    });
    toast.success(confirmed ? "排期已确认，可生成发信任务" : "排期已保存");
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-medium">3. 投递排期</h2>
        <p className="text-sm text-muted-foreground mt-1">
          以客户企业名义使用平台发信资源代发；按邮箱健康度分配每日发送量，避免触发风控。
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>开始日期</Label>
          <Input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>每日发送上限</Label>
          <Input
            value={cap}
            inputMode="numeric"
            onChange={(e) => setCap(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>预计投递天数</Label>
          <div className="h-9 flex items-center text-sm tabular-nums">
            {days} 天（{valid} 个目标）
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>发信邮箱资源</Label>
        <div className="flex flex-wrap gap-2">
          {MANAGED_MAILBOXES.map((m) => (
            <button
              key={m}
              onClick={() => toggle(m)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                boxes.includes(m)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/50",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          已选 {boxes.length} 个邮箱，单邮箱建议不超过 {Math.ceil((+cap || 1) / Math.max(1, boxes.length))} 封/天。
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => save(false)}>
          保存
        </Button>
        <Button onClick={() => save(true)} disabled={boxes.length === 0 || !startAt}>
          确认排期并继续
        </Button>
      </div>
    </Card>
  );
}

function GenerateStep({ order }: P) {
  const exec = order.exec!;
  const ready = exec.targets.confirmed && exec.copy.confirmed && exec.schedule.confirmed;
  const pct = order.qty ? Math.round((order.sent / order.qty) * 100) : 0;

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-medium">4. 生成任务</h2>
        <p className="text-sm text-muted-foreground mt-1">
          方案经客户确认后生成发信任务，投递结果与回复统一归集到客户的触达任务与会话中。
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-3 text-sm">
        <Summary label="有效目标" value={`${exec.targets.valid} 个`} ok={exec.targets.confirmed} />
        <Summary
          label="文案"
          value={exec.copy.confirmed ? exec.copy.subject : "未确认"}
          ok={exec.copy.confirmed}
        />
        <Summary
          label="排期"
          value={`${exec.schedule.startAt} 起 / ${exec.schedule.days} 天 / ${exec.schedule.dailyCap} 封每日`}
          ok={exec.schedule.confirmed}
        />
      </div>

      {order.status === "claimed" && (
        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div className="text-sm">方案准备完成后提交给客户确认。</div>
          <Button
            disabled={!ready}
            onClick={() => {
              submitManagedPlan(order.id);
              toast.success("方案已提交，等待客户确认");
            }}
          >
            提交方案确认
          </Button>
        </div>
      )}

      {order.status === "confirming" && (
        <div className="flex items-center justify-between rounded-md border border-violet-200 bg-violet-50 p-3">
          <div className="text-sm text-violet-800">方案已提交，等待客户确认。</div>
          <Button
            variant="outline"
            onClick={() => {
              confirmManagedPlan(order.id);
              toast.success("客户已确认方案，进入待执行");
            }}
          >
            登记客户已确认
          </Button>
        </div>
      )}

      {order.status === "queued" && (
        <div className="flex items-center justify-between rounded-md border border-sky-200 bg-sky-50 p-3">
          <div className="text-sm text-sky-800">方案已确认，可生成发信任务开始投递。</div>
          <Button
            onClick={() => {
              generateManagedTasks(order.id);
              toast.success("发信任务已生成，工单进入执行中");
            }}
          >
            生成发信任务
          </Button>
        </div>
      )}

      {exec.taskNo && (
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="text-sm">
            发信任务号 <span className="font-medium tabular-nums">{exec.taskNo}</span>
          </div>
          <Progress value={pct} className="h-1.5" />
          <div className="text-xs text-muted-foreground tabular-nums">
            已发出 {order.sent} / {order.qty}（{pct}%）· 进度回填与结算在工单池操作
          </div>
        </div>
      )}
    </Card>
  );
}

function Summary({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {label}
        {ok ? (
          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
        ) : (
          <AlertTriangle className="h-3 w-3 text-amber-500" />
        )}
      </div>
      <div className="text-sm mt-1 line-clamp-2">{value}</div>
    </div>
  );
}
