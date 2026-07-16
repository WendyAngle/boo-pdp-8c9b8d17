import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Mailbox as MailboxIcon,
  CheckCircle2,
  AlertCircle,
  Ban,
  Search,
  Plus,
  RotateCcw,
  Pencil,
  Trash2,
  Star,
  StarOff,
  Power,
  Zap,
  ChevronRight,
  Server,
  ShieldCheck,
  Activity,
  Loader2,
  Building2,
  HelpCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  useMailboxes,
  createMailbox,
  updateMailbox,
  deleteMailbox,
  setDefaultMailbox,
  setMailboxStatus,
  testMailbox,
  PROVIDER_PRESETS,
  type Mailbox,
  type MailboxProvider,
  type MailboxEncryption,
  type MailboxStatus,
  type MailboxScope,
} from "@/lib/mailboxes";
import {
  useTenantRole,
  setTenantRole,
  CURRENT_TENANT_USER,
  TENANT_DOMAINS,
  isTenantDomain,
} from "@/lib/tenant-role";
import { Users, UserRound, EyeOff, Eye } from "lucide-react";

const CURRENT_TENANT = { id: "T202600", name: "字节跳动" };

const PROVIDERS: MailboxProvider[] = [
  "Gmail",
  "Outlook",
  "腾讯企业邮",
  "阿里企业邮",
  "网易企业邮",
  "自定义SMTP",
];
const STATUSES: MailboxStatus[] = ["正常", "停用", "异常"];
const ENCRYPTIONS: MailboxEncryption[] = ["SSL", "TLS", "STARTTLS", "NONE"];

export const Route = createFileRoute("/_app/outreach/mailboxes")({
  head: () => ({ meta: [{ title: "出海大数据平台 · 邮箱 | 出海大数据平台" }] }),
  component: MailboxesPage,
});

function statusBadgeCls(s: MailboxStatus) {
  if (s === "正常") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (s === "异常") return "bg-rose-100 text-rose-700 border-rose-200";
  return "bg-muted text-muted-foreground border-border";
}

function formatDateTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function MailboxesPage() {
  const data = useMailboxes();
  const role = useTenantRole();
  const isAdmin = role === "admin";
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [formInitScope, setFormInitScope] = useState<MailboxScope>("personal");
  const [editing, setEditing] = useState<Mailbox | null>(null);
  const [delTarget, setDelTarget] = useState<Mailbox | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return data.filter((m) => {
      // 成员视角：team 只看到启用中；personal 仅看自己的
      if (!isAdmin) {
        if (m.scope === "team" && m.status !== "正常") return false;
        if (m.scope === "personal" && m.ownerId !== CURRENT_TENANT_USER.id)
          return false;
      }
      if (
        keyword &&
        !`${m.email} ${m.displayName} ${m.username}`
          .toLowerCase()
          .includes(keyword.toLowerCase())
      )
        return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (providerFilter !== "all" && m.provider !== providerFilter) return false;
      return true;
    });
  }, [data, keyword, statusFilter, providerFilter, isAdmin]);

  const teamList = useMemo(() => filtered.filter((m) => m.scope === "team"), [filtered]);
  const personalList = useMemo(
    () => filtered.filter((m) => m.scope === "personal"),
    [filtered],
  );

  const stats = useMemo(() => {
    const c = (s: MailboxStatus) => data.filter((m) => m.status === s).length;
    return {
      total: data.length,
      normal: c("正常"),
      disabled: c("停用"),
      error: c("异常"),
    };
  }, [data]);

  const reset = () => {
    setKeyword("");
    setStatusFilter("all");
    setProviderFilter("all");
  };

  const onTest = async (m: Mailbox) => {
    setTestingId(m.id);
    const r = await testMailbox(m.id);
    setTestingId(null);
    if (r.ok) toast.success(r.message);
    else toast.error(r.message);
  };

  const onToggleStatus = (m: Mailbox) => {
    if (m.status === "正常") {
      const normals = data.filter((x) => x.status === "正常").length;
      if (m.isDefault && normals === 1) {
        toast.error("当前为唯一可用的默认邮箱，停用前请先新增并设置其他邮箱为默认");
        return;
      }
      setMailboxStatus(m.id, "停用");
      toast.success(`已停用 ${m.email}`);
    } else {
      setMailboxStatus(m.id, "正常");
      toast.success(`已启用 ${m.email}`);
    }
  };

  const onSetDefault = (m: Mailbox) => {
    if (m.status !== "正常") {
      toast.error("仅「正常」状态的邮箱可设为默认");
      return;
    }
    setDefaultMailbox(m.id);
    toast.success(`已将 ${m.email} 设为默认发件邮箱`);
  };

  return (
    <div className="p-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span>出海大数据平台</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span>系统管理</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">邮箱</span>
      </div>

      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-2xl p-6 text-white"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <MailboxIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">我的邮箱</h1>
              <p className="text-white/85 text-sm mt-0.5">
                管理用于邮件触达的发件邮箱账号；至少配置一个「正常」状态的邮箱才可发起邮件触达
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 rounded-lg bg-white/15 backdrop-blur-sm px-3 py-2">
              <Building2 className="h-4 w-4" />
              <div className="leading-tight">
                <div className="text-xs text-white/80">当前企业</div>
                <div className="text-sm font-medium">
                  {CURRENT_TENANT.name}
                  <span className="ml-2 font-mono text-xs text-white/80">{CURRENT_TENANT.id}</span>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="h-9 bg-white/15 text-white border-white/20 hover:bg-white/25"
              onClick={() => setTenantRole(isAdmin ? "member" : "admin")}
              title="演示：切换当前用户角色"
            >
              {isAdmin ? (
                <>
                  <EyeOff className="h-4 w-4" /> 以员工身份预览
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" /> 恢复管理员视图
                </>
              )}
            </Button>
            <Button
              size="sm"
              className="h-9 bg-white text-primary hover:bg-white/90 shadow-sm"
              onClick={() => {
                setEditing(null);
                setFormInitScope(isAdmin ? "team" : "personal");
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> 新增邮箱
            </Button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={<MailboxIcon className="h-5 w-5" />} label="邮箱总数" value={stats.total} tone="primary" />
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="正常" value={stats.normal} tone="emerald" />
        <StatCard icon={<Ban className="h-5 w-5" />} label="停用" value={stats.disabled} tone="muted" />
        <StatCard icon={<AlertCircle className="h-5 w-5" />} label="异常" value={stats.error} tone="rose" />
      </div>

      {/* Filter */}
      <Card className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="xl:col-span-2 relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索邮箱地址 / 显示名称 / 用户名"
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger>
              <SelectValue placeholder="全部服务商" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部服务商</SelectItem>
              {PROVIDERS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={reset}>
            <RotateCcw className="h-4 w-4" /> 重置
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> 新增邮箱
          </Button>
        </div>
      </Card>

      {/* List */}
      <ScopeSection
        title="团队共享邮箱"
        subtitle={
          isAdmin
            ? "归企业所有，全员可用于发信。仅租户管理员可维护。"
            : "归企业所有，全员可用于发信。如需变更请联系租户管理员。"
        }
        icon={<Users className="h-4 w-4" />}
        count={teamList.length}
        canAdd={isAdmin}
        onAdd={() => {
          setEditing(null);
          setFormInitScope("team");
          setFormOpen(true);
        }}
        empty="暂无团队共享邮箱"
      >
        {teamList.map((m) => (
          <MailboxCard
            key={m.id}
            m={m}
            readOnly={!isAdmin}
            testing={testingId === m.id}
            onTest={() => onTest(m)}
            onEdit={() => {
              setEditing(m);
              setFormOpen(true);
            }}
            onDelete={() => setDelTarget(m)}
            onSetDefault={() => onSetDefault(m)}
            onToggleStatus={() => onToggleStatus(m)}
          />
        ))}
      </ScopeSection>

      <ScopeSection
        title={isAdmin ? "全员个人邮箱" : "我的发信邮箱"}
        subtitle={
          isAdmin
            ? "员工自助绑定，仅本人可用。管理员可查看/回收。"
            : "由你本人绑定，仅你可用；离职时管理员将回收。"
        }
        icon={<UserRound className="h-4 w-4" />}
        count={personalList.length}
        canAdd={true}
        onAdd={() => {
          setEditing(null);
          setFormInitScope("personal");
          setFormOpen(true);
        }}
        empty={
          isAdmin
            ? "暂无成员个人邮箱"
            : "尚未绑定个人邮箱，点击右上「新增邮箱」开始"
        }
      >
        {personalList.map((m) => {
          const isOwner = m.ownerId === CURRENT_TENANT_USER.id;
          return (
            <MailboxCard
              key={m.id}
              m={m}
              readOnly={!isAdmin && !isOwner}
              testing={testingId === m.id}
              onTest={() => onTest(m)}
              onEdit={() => {
                setEditing(m);
                setFormOpen(true);
              }}
              onDelete={() => setDelTarget(m)}
              onSetDefault={() => onSetDefault(m)}
              onToggleStatus={() => onToggleStatus(m)}
            />
          );
        })}
      </ScopeSection>

      <MailboxFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        initScope={formInitScope}
        isAdmin={isAdmin}
      />

      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除发件邮箱</AlertDialogTitle>
            <AlertDialogDescription>
              确认删除 <span className="font-mono">{delTarget?.email}</span> ？删除后该邮箱不可用于触达，已发送历史不受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => {
                if (delTarget) {
                  deleteMailbox(delTarget.id);
                  toast.success(`已删除 ${delTarget.email}`);
                }
                setDelTarget(null);
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ----------------- subcomponents ----------------- */

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "primary" | "emerald" | "rose" | "muted";
}) {
  const toneCls = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-100 text-emerald-700",
    rose: "bg-rose-100 text-rose-700",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${toneCls}`}>
          {icon}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold tabular-nums mt-0.5">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function MailboxCard({
  m,
  readOnly,
  testing,
  onTest,
  onEdit,
  onDelete,
  onSetDefault,
  onToggleStatus,
}: {
  m: Mailbox;
  readOnly?: boolean;
  testing: boolean;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onToggleStatus: () => void;
}) {
  const pct = Math.min(100, Math.round((m.sentToday / Math.max(1, m.dailyLimit)) * 100));
  return (
    <Card className="p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-primary/80 to-accent text-primary-foreground flex items-center justify-center text-base font-semibold uppercase">
          {m.email[0] ?? "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-mono text-sm font-medium truncate">{m.email}</div>
            {m.isDefault && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 border" variant="outline">
                <Star className="h-3 w-3 mr-0.5 fill-amber-500 stroke-amber-500" />
                默认
              </Badge>
            )}
            <Badge variant="outline" className={statusBadgeCls(m.status)}>
              {m.status}
            </Badge>
            {m.scope === "personal" && (
              <Badge variant="outline" className="text-[10px]">个人</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">{m.displayName}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <Meta icon={<Server className="h-3.5 w-3.5" />} label="服务商" value={m.provider} />
        <Meta
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          label="加密 / 端口"
          value={`${m.encryption} · ${m.smtpPort}`}
        />
        <Meta
          icon={<MailboxIcon className="h-3.5 w-3.5" />}
          label="SMTP"
          value={m.smtpHost || "—"}
          mono
        />
        <Meta
          icon={<Activity className="h-3.5 w-3.5" />}
          label="上次测试"
          value={formatDateTime(m.lastTestedAt)}
        />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">今日发送 / 日发上限</span>
          <span className="font-mono tabular-nums">
            {m.sentToday} / {m.dailyLimit}
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              pct >= 90 ? "bg-rose-500" : pct >= 60 ? "bg-amber-500" : "bg-primary"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {readOnly ? (
        <div className="mt-4 pt-4 border-t flex items-center justify-end">
          <span className="text-[11px] text-muted-foreground">只读 · 无操作权限</span>
        </div>
      ) : (
      <div className="mt-4 pt-4 border-t flex items-center justify-end gap-1">
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="ghost" onClick={onTest} disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>测试连接</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={onSetDefault}
                disabled={m.isDefault || m.status !== "正常"}
              >
                {m.isDefault ? <Star className="h-4 w-4 fill-amber-500 text-amber-500" /> : <StarOff className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {m.isDefault ? "已是默认" : "设为默认"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="ghost" onClick={onEdit}>
                <Pencil className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>编辑</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className={m.status === "正常" ? "text-muted-foreground" : "text-emerald-600"}
                onClick={onToggleStatus}
              >
                <Power className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{m.status === "正常" ? "停用" : "启用"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="text-rose-600 hover:text-rose-700"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>删除</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      )}
    </Card>
  );
}

function Meta({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-0.5 truncate text-foreground ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function ScopeSection({
  title,
  subtitle,
  icon,
  count,
  canAdd,
  onAdd,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  count: number;
  canAdd: boolean;
  onAdd: () => void;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
          {icon}
        </div>
        <div>
          <div className="text-base font-semibold flex items-center gap-2">
            {title}
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
              {count}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
        {canAdd && (
          <Button size="sm" variant="outline" className="ml-auto h-8" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5" /> 新增
          </Button>
        )}
      </div>
      {count === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">{empty}</Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{children}</div>
      )}
    </section>
  );
}

/* ----------------- form dialog ----------------- */

interface FormState {
  email: string;
  displayName: string;
  provider: MailboxProvider;
  smtpHost: string;
  smtpPort: number;
  encryption: MailboxEncryption;
  username: string;
  password: string;
  signature: string;
  dailyLimit: number;
  isDefault: boolean;
  status: MailboxStatus;
  scope: MailboxScope;
}

function emptyForm(scope: MailboxScope = "personal"): FormState {
  return {
    email: "",
    displayName: "",
    provider: "腾讯企业邮",
    ...PROVIDER_PRESETS["腾讯企业邮"],
    username: "",
    password: "",
    signature: "",
    dailyLimit: 100,
    isDefault: false,
    status: "正常",
    scope,
  };
}

function MailboxFormDialog({
  open,
  onOpenChange,
  editing,
  initScope,
  isAdmin,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Mailbox | null;
  initScope: MailboxScope;
  isAdmin: boolean;
}) {
  const [form, setForm] = useState<FormState>(emptyForm(initScope));
  const [testing, setTesting] = useState(false);

  // 同步 editing → form（依赖 open + editing.id）
  const editingKey = editing?.id ?? `new:${initScope}`;
  const [lastKey, setLastKey] = useState<string>("");
  if (open && lastKey !== editingKey) {
    setLastKey(editingKey);
    setForm(
      editing
        ? {
            email: editing.email,
            displayName: editing.displayName,
            provider: editing.provider,
            smtpHost: editing.smtpHost,
            smtpPort: editing.smtpPort,
            encryption: editing.encryption,
            username: editing.username,
            password: editing.password,
            signature: editing.signature ?? "",
            dailyLimit: editing.dailyLimit,
            isDefault: editing.isDefault,
            status: editing.status,
            scope: editing.scope,
          }
        : emptyForm(initScope),
    );
  }
  if (!open && lastKey !== "") setTimeout(() => setLastKey(""), 0);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const onProviderChange = (p: MailboxProvider) => {
    const preset = PROVIDER_PRESETS[p];
    setForm((s) => ({
      ...s,
      provider: p,
      smtpHost: preset.smtpHost || s.smtpHost,
      smtpPort: preset.smtpPort,
      encryption: preset.encryption,
    }));
  };

  const validate = (): string | null => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "请输入有效的邮箱地址";
    if (form.scope === "personal" && isTenantDomain(form.email)) {
      return `该域名 (${TENANT_DOMAINS.join("、")}) 归企业管理，请联系租户管理员添加为团队邮箱`;
    }
    if (!form.displayName.trim()) return "请输入显示名称";
    if (!form.smtpHost.trim()) return "请输入 SMTP 主机";
    if (!(form.smtpPort > 0 && form.smtpPort < 65536)) return "SMTP 端口无效";
    if (!form.username.trim()) return "请输入用户名";
    if (!form.password.trim()) return "请输入授权密码";
    if (form.dailyLimit < 1) return "日发上限至少为 1";
    return null;
  };

  const onSave = async (alsoTest: boolean) => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    let id = editing?.id;
    if (editing) {
      updateMailbox(editing.id, {
        email: form.email,
        displayName: form.displayName,
        provider: form.provider,
        smtpHost: form.smtpHost,
        smtpPort: form.smtpPort,
        encryption: form.encryption,
        username: form.username,
        password: form.password,
        signature: form.signature,
        dailyLimit: form.dailyLimit,
        status: form.status,
        isDefault: form.isDefault,
        scope: form.scope,
        ownerId: form.scope === "personal" ? (editing.ownerId ?? CURRENT_TENANT_USER.id) : undefined,
      });
      toast.success("已更新邮箱信息");
    } else {
      const created = createMailbox({
        email: form.email,
        displayName: form.displayName,
        provider: form.provider,
        smtpHost: form.smtpHost,
        smtpPort: form.smtpPort,
        encryption: form.encryption,
        username: form.username,
        password: form.password,
        signature: form.signature,
        dailyLimit: form.dailyLimit,
        status: form.status,
        isDefault: form.isDefault,
        scope: form.scope,
        ownerId: form.scope === "personal" ? CURRENT_TENANT_USER.id : undefined,
      });
      id = created.id;
      toast.success("已新增邮箱");
    }
    if (alsoTest && id) {
      setTesting(true);
      const r = await testMailbox(id);
      setTesting(false);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑邮箱" : "新增邮箱"}</DialogTitle>
          <DialogDescription>
            配置用于邮件触达的 SMTP 发件账号，建议保存后立即测试连接。
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border bg-muted/30 p-3 flex items-start gap-3">
          <div className="pt-0.5">
            {form.scope === "team" ? (
              <Users className="h-4 w-4 text-primary" />
            ) : (
              <UserRound className="h-4 w-4 text-primary" />
            )}
          </div>
          <div className="flex-1 space-y-1">
            <div className="text-sm font-medium">
              归属：{form.scope === "team" ? "团队共享邮箱" : "我的个人邮箱"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {form.scope === "team"
                ? "全员可用；仅租户管理员可维护。"
                : `仅本人 (${CURRENT_TENANT_USER.name}) 可用。若为本企业域名邮箱，请改为团队邮箱。`}
            </div>
            {isAdmin && !editing && (
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant={form.scope === "team" ? "default" : "outline"}
                  className="h-7 px-2 text-xs"
                  onClick={() => update("scope", "team")}
                >
                  团队共享
                </Button>
                <Button
                  size="sm"
                  variant={form.scope === "personal" ? "default" : "outline"}
                  className="h-7 px-2 text-xs"
                  onClick={() => update("scope", "personal")}
                >
                  个人
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="邮箱地址" required>
            <Input
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="name@company.com"
            />
          </Field>
          <Field label="显示名称" required>
            <Input
              value={form.displayName}
              onChange={(e) => update("displayName", e.target.value)}
              placeholder="例如：业务部 / John"
            />
          </Field>
          <Field label="服务商">
            <Select value={form.provider} onValueChange={(v) => onProviderChange(v as MailboxProvider)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="状态">
            <Select value={form.status} onValueChange={(v) => update("status", v as MailboxStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="SMTP 主机" required>
            <Input
              value={form.smtpHost}
              onChange={(e) => update("smtpHost", e.target.value)}
              placeholder="smtp.example.com"
              className="font-mono"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="端口">
              <Input
                type="number"
                value={form.smtpPort}
                onChange={(e) => update("smtpPort", Number(e.target.value))}
              />
            </Field>
            <Field label="加密方式">
              <Select
                value={form.encryption}
                onValueChange={(v) => update("encryption", v as MailboxEncryption)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENCRYPTIONS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="用户名" required>
            <Input
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
              placeholder="多数情况与邮箱地址一致"
            />
          </Field>
          <Field label="授权密码 / Token" required>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="SMTP 授权密码或应用密码"
            />
          </Field>
          <div className="md:col-span-2 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  日发上限
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground focus:outline-none"
                          aria-label="日发上限说明"
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                        该值决定此邮箱每日可触达的邮件上限。设置过高易触发服务商风控，导致邮箱被限流或封禁。建议新邮箱从
                        <span className="font-medium"> 30–50 封/日 </span>起步，稳定养号 2–4 周后逐步提升；成熟邮箱推荐
                        <span className="font-medium"> 100–200 封/日</span>，一般不超过 300 封/日。
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input
                  type="number"
                  value={form.dailyLimit}
                  onChange={(e) => update("dailyLimit", Number(e.target.value))}
                />
              </div>
              <div className="flex items-center gap-3 h-9 md:mt-[26px]">
                <Switch
                  checked={form.isDefault}
                  onCheckedChange={(v) => update("isDefault", !!v)}
                  disabled={form.status !== "正常"}
                />
                <Label className="text-sm">设为默认发件邮箱</Label>
              </div>
            </div>
          </div>
          <Field label="邮件签名" className="md:col-span-2">
            <Textarea
              rows={3}
              value={form.signature}
              onChange={(e) => update("signature", e.target.value)}
              placeholder="可选，将自动附加到邮件末尾"
            />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="outline" disabled={testing} onClick={() => onSave(true)}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            保存并测试
          </Button>
          <Button onClick={() => onSave(false)}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs text-muted-foreground">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}