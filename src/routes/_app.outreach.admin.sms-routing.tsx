import { useEffect, useMemo, useState } from "react";
import { ListPagination } from "@/components/ListPagination";
import { createFileRoute } from "@tanstack/react-router";
import { Route as RouteIcon, ArrowRight, Plus, Trash2, GripVertical, HelpCircle, Pencil, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/outreach/admin/sms-routing")({
  head: () => ({
    meta: [
      { title: "短信路由策略 · 系统管理 | 出海大数据平台" },
      {
        name: "description",
        content: "配置目的国家、渠道类型与合规状态对服务商的路由映射与 Failover 规则。",
      },
    ],
  }),
  component: SmsRoutingPage,
});

interface Rule {
  id: string;
  name: string;
  match: {
    country: string;
    channel: "marketing" | "otp" | "notification" | "any";
  };
  primary: string;
  failover: string[];
  minDeliveryRate: number;
  respectQuietHours: boolean;
  enabled: boolean;
  priority: number;
}

const SEED: Rule[] = [
  {
    id: "r1",
    name: "北美 · 营销",
    match: { country: "US/CA", channel: "marketing" },
    primary: "Twilio 主账号",
    failover: ["Sinch A2P"],
    minDeliveryRate: 0.95,
    respectQuietHours: true,
    enabled: true,
    priority: 1,
  },
  {
    id: "r2",
    name: "欧洲 · 通知",
    match: { country: "EU", channel: "notification" },
    primary: "Vonage 备用",
    failover: ["Twilio 主账号"],
    minDeliveryRate: 0.93,
    respectQuietHours: true,
    enabled: true,
    priority: 2,
  },
  {
    id: "r3",
    name: "亚太 · 全渠道",
    match: { country: "APAC", channel: "any" },
    primary: "阿里云国际站",
    failover: ["Vonage 备用", "Twilio 主账号"],
    minDeliveryRate: 0.9,
    respectQuietHours: true,
    enabled: true,
    priority: 3,
  },
  {
    id: "r4",
    name: "全球 · 验证码 OTP",
    match: { country: "全球", channel: "otp" },
    primary: "Infobip",
    failover: ["Twilio 主账号"],
    minDeliveryRate: 0.98,
    respectQuietHours: false,
    enabled: true,
    priority: 4,
  },
];

const PROVIDERS = ["Twilio 主账号", "Sinch A2P", "Vonage 备用", "阿里云国际站", "Infobip"];
const COUNTRIES = ["US/CA", "EU", "APAC", "LATAM", "MEA", "全球"];
const CHANNELS: Array<{ value: Rule["match"]["channel"]; label: string }> = [
  { value: "marketing", label: "营销" },
  { value: "notification", label: "通知" },
  { value: "otp", label: "验证码" },
  { value: "any", label: "全部渠道" },
];

function SmsRoutingPage() {
  const [rules, setRules] = useState<Rule[]>(SEED);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const pageRules = useMemo(
    () => rules.slice((page - 1) * pageSize, page * pageSize),
    [rules, page],
  );
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(rules.length / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [rules.length, page]);

  function toggle(id: string) {
    setRules((s) => s.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  }
  function remove(id: string) {
    setRules((s) => s.filter((r) => r.id !== id));
    toast.success("已删除规则");
  }
  function openNew() {
    setEditing({
      id: "",
      name: "",
      match: { country: "US/CA", channel: "marketing" },
      primary: PROVIDERS[0],
      failover: [],
      minDeliveryRate: 0.95,
      respectQuietHours: true,
      enabled: true,
      priority: rules.length + 1,
    });
    setEditorOpen(true);
  }
  function openEdit(r: Rule) {
    setEditing({ ...r, failover: [...r.failover] });
    setEditorOpen(true);
  }
  function save(next: Rule) {
    if (!next.name.trim()) {
      toast.error("请填写规则名");
      return;
    }
    if (next.failover.includes(next.primary)) {
      toast.error("Failover 服务商不能与主服务商相同");
      return;
    }
    setRules((s) => {
      if (!next.id) {
        return [...s, { ...next, id: `r${Date.now()}` }];
      }
      return s.map((r) => (r.id === next.id ? next : r));
    });
    setEditorOpen(false);
    setEditing(null);
    toast.success(next.id ? "规则已更新" : "规则已新增");
  }

  return (
    <TooltipProvider delayDuration={200}>
    <div className="p-6 space-y-4">
      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-2xl p-6 lg:p-7 text-white"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="absolute -right-10 -bottom-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <RouteIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">短信路由策略</h1>
              <p className="text-white/85 text-sm mt-0.5 max-w-2xl">
                按「目的国家 × 渠道类型」匹配规则，选择主服务商，主服务商送达率跌破阈值或不可用时自动 Failover。规则按优先级从上至下匹配，首个命中即生效。
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6 text-white shrink-0">
            <MetricBlock label="路由规则" value={rules.length} suffix="条" />
            <MetricBlock label="启用中" value={rules.filter((r) => r.enabled).length} suffix="条" />
            <MetricBlock label="覆盖渠道" value={new Set(rules.map((r) => r.match.channel)).size} suffix="类" />
          </div>
        </div>
      </section>

      {/* 操作区 */}
      <div className="flex items-center justify-start gap-2">
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          新增规则
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
          <div className="col-span-3">规则名 / 匹配条件</div>
          <div className="col-span-4">主 → Failover 服务商链路</div>
          <div className="col-span-2">最低送达率</div>
          <div className="col-span-2 flex items-center gap-1">
            静默时段
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                以<strong>收件人所在时区</strong>为准（依据 TCPA / GDPR：营销短信须在收件人本地白天发送）。
                命中静默时段的消息不会被丢弃，而是排队至次日窗口再发出。
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="col-span-1 text-right">操作</div>
        </div>
        {pageRules.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-12 gap-2 items-center px-4 py-3 border-t"
          >
            <div className="col-span-3">
              <div className="flex items-center gap-1.5">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60" />
                <span className="font-medium text-sm">{r.name}</span>
              </div>
              <div className="mt-1 ml-5 flex flex-wrap gap-1">
                <Badge variant="outline" className="text-[10px]">
                  {r.match.country}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {r.match.channel === "any"
                    ? "全部渠道"
                    : r.match.channel === "otp"
                    ? "验证码"
                    : r.match.channel === "marketing"
                    ? "营销"
                    : "通知"}
                </Badge>
              </div>
            </div>
            <div className="col-span-4">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge className="bg-primary text-primary-foreground text-[11px]">
                  {r.primary}
                </Badge>
                {r.failover.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="outline" className="text-[11px]">
                      {f}
                    </Badge>
                  </span>
                ))}
              </div>
            </div>
            <div className="col-span-2 text-sm font-mono">
              {(r.minDeliveryRate * 100).toFixed(0)}%
            </div>
            <div className="col-span-2 text-xs text-muted-foreground">
              {r.respectQuietHours ? "收件人本地 08:00–21:00" : "24 小时（含深夜）"}
            </div>
            <div className="col-span-1 flex items-center justify-end gap-2">
              <Switch checked={r.enabled} onCheckedChange={() => toggle(r.id)} />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => openEdit(r)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-rose-600"
                onClick={() => remove(r.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        {rules.length > 0 && (
          <div className="px-4 py-3 border-t">
            <ListPagination page={page} pageSize={pageSize} total={rules.length} onPageChange={setPage} />
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-2 bg-sky-50/60 border-sky-200">
        <div className="text-sm font-medium text-sky-900">路由决策逻辑</div>
        <ol className="list-decimal ml-4 text-xs text-sky-800 space-y-0.5">
          <li>解析手机号 → 归属国家、运营商、A2P 合规状态。</li>
          <li>按渠道类型（营销/通知/验证码）匹配第一条命中的启用规则。</li>
          <li>命中收件人退订名单 → 直接终止，扣 0 积分。</li>
          <li>主服务商健康且未超配额 → 使用主服务商；<strong>降级态权重降至 50% 与 Failover 分流</strong>；<strong>异常/熔断</strong>则依次尝试 Failover。</li>
          <li>命中<strong>收件人本地时区</strong>的静默时段 → 排队至次日窗口。</li>
          <li>写入 <code>sms_messages.provider_id</code> 与 <code>route_reason</code> 供审计。</li>
        </ol>
      </Card>

      <RuleEditor
        open={editorOpen}
        rule={editing}
        onOpenChange={(v) => { setEditorOpen(v); if (!v) setEditing(null); }}
        onSave={save}
      />
    </div>
    </TooltipProvider>
  );
}

function RuleEditor({
  open, rule, onOpenChange, onSave,
}: {
  open: boolean;
  rule: Rule | null;
  onOpenChange: (v: boolean) => void;
  onSave: (r: Rule) => void;
}) {
  if (!rule) return null;
  return (
    <RuleEditorInner
      key={`${rule.id || "new"}-${open ? "o" : "c"}`}
      open={open}
      rule={rule}
      onOpenChange={onOpenChange}
      onSave={onSave}
    />
  );
}

function RuleEditorInner({
  open, rule, onOpenChange, onSave,
}: {
  open: boolean;
  rule: Rule;
  onOpenChange: (v: boolean) => void;
  onSave: (r: Rule) => void;
}) {
  const isNew = !rule.id;
  const [draft, setDraft] = useState<Rule>(rule);

  function patch(p: Partial<Rule>) {
    setDraft((d) => ({ ...d, ...p }));
  }
  function toggleFailover(name: string) {
    setDraft((d) => ({
      ...d,
      failover: d.failover.includes(name)
        ? d.failover.filter((n) => n !== name)
        : [...d.failover, name],
    }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "新增路由规则" : "编辑路由规则"}</DialogTitle>
          <DialogDescription>
            按「目的国家 × 渠道类型」匹配，命中后按主 → Failover 顺序发送。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>规则名</Label>
            <Input
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="例如：北美 · 营销"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>目的国家 / 地区</Label>
              <Select value={draft.match.country} onValueChange={(v) => patch({ match: { ...draft.match, country: v } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>渠道类型</Label>
              <Select
                value={draft.match.channel}
                onValueChange={(v) => patch({ match: { ...draft.match, channel: v as Rule["match"]["channel"] } })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>主服务商</Label>
            <Select value={draft.primary} onValueChange={(v) => patch({ primary: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Failover 服务商链路 <span className="text-xs text-muted-foreground font-normal">（按点击顺序生效）</span></Label>
            {draft.failover.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap p-2 rounded-md bg-muted/40">
                {draft.failover.map((f, i) => (
                  <Badge key={f} variant="outline" className="gap-1">
                    {i + 1}. {f}
                    <button onClick={() => toggleFailover(f)} className="hover:text-rose-600">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {PROVIDERS.filter((p) => p !== draft.primary && !draft.failover.includes(p)).map((p) => (
                <Button key={p} size="sm" variant="outline" className="h-7" onClick={() => toggleFailover(p)}>
                  <Plus className="h-3 w-3" />{p}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>最低送达率 (%)</Label>
              <Input
                type="number" min={0} max={100} step={1}
                value={Math.round(draft.minDeliveryRate * 100)}
                onChange={(e) => patch({ minDeliveryRate: Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>优先级</Label>
              <Input
                type="number" min={1} step={1}
                value={draft.priority}
                onChange={(e) => patch({ priority: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">遵守收件人本地静默时段</div>
              <div className="text-xs text-muted-foreground">08:00–21:00 之外的消息将排队至次日窗口</div>
            </div>
            <Switch checked={draft.respectQuietHours} onCheckedChange={(v) => patch({ respectQuietHours: v })} />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">启用此规则</div>
              <div className="text-xs text-muted-foreground">停用后不参与匹配</div>
            </div>
            <Switch checked={draft.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => onSave(draft)}>{isNew ? "创建规则" : "保存修改"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetricBlock({ label, value, suffix }: {
  label: string; value: string | number; suffix?: string;
}) {
  return (
    <div>
      <div className="text-xs text-white/75">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">
        {value}{suffix && <span className="text-sm font-medium text-white/80 ml-1">{suffix}</span>}
      </div>
    </div>
  );
}