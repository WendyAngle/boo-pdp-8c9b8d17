import { useEffect, useMemo, useState, useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  KeyRound,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Ban,
  Building2,
  User,
  Eye,
  EyeOff,
  CalendarDays,
  Calendar as CalendarIcon,
  X,
  Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { ReachButton } from "@/components/ReachButton";
import {
  useUnlockedContacts,
  type ContactType,
  type UnlockedContact,
} from "@/lib/unlocked-contacts";
import { seedDemoLedgerIfEmpty } from "@/lib/credits-ledger";
import { isSuppressed } from "@/lib/suppressions-store";
import type { DateRange } from "react-day-picker";

export const Route = createFileRoute("/_app/outreach/unlocked")({
  head: () => ({
    meta: [
      { title: "解锁记录 | 出海大数据平台" },
      {
        name: "description",
        content:
          "汇总所有已解锁的企业与联系人联系方式，支持按企业/时间分组、按渠道筛选，避免重复解锁。",
      },
    ],
  }),
  component: UnlockedPage,
});

type ChannelFilter = "all" | "email" | "sms" | "social" | "whatsapp";
type OwnerFilter = "all" | "enterprise" | "person";
type AggregateMode = "none" | "owner";

const REVEAL_LIMIT = 10;

function maskContact(t: ContactType, v: string): string {
  if (t === "email") {
    const [name, domain] = v.split("@");
    if (!domain) return v;
    const head = name.slice(0, 1);
    return `${head}${"*".repeat(Math.max(3, name.length - 1))}@${domain}`;
  }
  if (t === "phone") {
    const digits = v.replace(/\D/g, "");
    if (digits.length <= 4) return v;
    const head = v.slice(0, Math.min(3, v.length - 4));
    const tail = v.slice(-4);
    return `${head}${"*".repeat(Math.max(4, v.length - head.length - tail.length))}${tail}`;
  }
  if (v.length <= 3) return v;
  return `${v.slice(0, 2)}${"*".repeat(Math.max(3, v.length - 3))}${v.slice(-1)}`;
}

/** 显示分类：邮件 / 电话 / WhatsApp / 社媒 */
type DisplayKind = "email" | "phone" | "whatsapp" | "social";

function toDisplayKind(c: UnlockedContact): DisplayKind {
  if (c.contact_type === "email") return "email";
  if (c.contact_type === "phone") return "phone";
  return c.platform === "WhatsApp" ? "whatsapp" : "social";
}

const KIND_LABEL: Record<DisplayKind, string> = {
  email: "邮件",
  phone: "电话",
  whatsapp: "WhatsApp",
  social: "社媒",
};

function kindIcon(k: DisplayKind) {
  if (k === "email") return <Mail className="h-3.5 w-3.5" />;
  if (k === "phone") return <Phone className="h-3.5 w-3.5" />;
  return <MessageSquare className="h-3.5 w-3.5" />;
}

function kindTone(k: DisplayKind) {
  if (k === "email") return "bg-sky-50 text-sky-700 border-sky-200";
  if (k === "phone") return "bg-violet-50 text-violet-700 border-violet-200";
  if (k === "whatsapp") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function matchChannel(c: UnlockedContact, ch: ChannelFilter): boolean {
  if (ch === "all") return true;
  const k = toDisplayKind(c);
  if (ch === "email") return k === "email";
  if (ch === "sms") return k === "phone";
  if (ch === "whatsapp") return k === "whatsapp";
  return k === "social";
}

function fmtDate(d?: Date) {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateKeyOf(ts: number): string {
  const d = new Date(ts);
  return fmtDate(d);
}

function weekdayCN(dateStr: string) {
  const d = new Date(dateStr);
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
}

type ContactGroup = {
  key: string;
  owner_type: "enterprise" | "person";
  owner_id: string;
  owner_name: string;
  parent_ref?: UnlockedContact["parent_ref"];
  contacts: UnlockedContact[];
  latestUnlock: number;
};

function ContactValue({ value }: { value: string }) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span className="font-mono text-sm text-foreground tracking-wide truncate cursor-default">
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-[420px] break-all font-mono text-xs">
        {value}
      </TooltipContent>
    </Tooltip>
  );
}

function ContactRow({
  c,
  revealed,
  onToggle,
}: {
  c: UnlockedContact;
  revealed: boolean;
  onToggle: () => void;
}) {
  const kind = toDisplayKind(c);
  const display = revealed ? c.contact_value : maskContact(c.contact_type, c.contact_value);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
          kindTone(kind),
        )}
      >
        {kindIcon(kind)}
        {KIND_LABEL[kind]}
      </span>
      <div className="flex-1 min-w-0 flex items-center gap-1">
        <ContactValue value={display} />
      </div>
      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
        {formatDateTime(new Date(c.unlock_time).toISOString())}
      </span>
      <button
        type="button"
        onClick={onToggle}
        className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        aria-label={revealed ? "隐藏明文" : "查看明文"}
        title={revealed ? "隐藏明文" : "查看明文"}
      >
        {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function GroupCard({
  g,
  revealed,
  onToggle,
}: {
  g: ContactGroup;
  revealed: Set<string>;
  onToggle: (key: string) => void;
}) {
  const isPerson = g.owner_type === "person";
  const enterpriseRef = isPerson ? g.parent_ref : undefined;
  const enterpriseLink = isPerson
    ? enterpriseRef
      ? `/outreach/enterprise/${enterpriseRef.id}`
      : undefined
    : `/outreach/enterprise/${g.owner_id}`;
  const personLink = (() => {
    if (!isPerson) return undefined;
    const [entId, idxStr] = g.owner_id.split(":");
    if (!entId || !idxStr) return undefined;
    return { entId, idx: idxStr };
  })();

  return (
    <Card className="p-4 flex flex-col gap-3 hover:shadow-md hover:border-primary/30 transition-all">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 text-sm text-foreground min-w-0">
            {isPerson ? (
              <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate font-medium">{g.owner_name}</span>
          </div>
          {isPerson && (
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground min-w-0 pl-5">
              <Building2 className="h-3 w-3 shrink-0" />
              {enterpriseRef && enterpriseLink ? (
                <Link
                  to={enterpriseLink}
                  className="truncate hover:text-primary hover:underline underline-offset-2"
                >
                  {enterpriseRef.name}
                </Link>
              ) : (
                <span className="truncate italic">未关联企业</span>
              )}
            </div>
          )}
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]",
            isPerson
              ? "border-slate-200 bg-slate-50 text-slate-700"
              : "border-primary/30 bg-primary/5 text-primary",
          )}
        >
          {isPerson ? <User className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
          {isPerson ? "人物" : "企业"}
          <span className="ml-1 tabular-nums opacity-70">· {g.contacts.length}</span>
        </span>
      </div>

      <div className="border-t pt-3 space-y-2">
        {g.contacts.map((c) => {
          const key = `${c.owner_type}:${c.owner_id}:${c.contact_type}:${c.contact_value}`;
          return (
            <ContactRow
              key={key}
              c={c}
              revealed={revealed.has(key)}
              onToggle={() => onToggle(key)}
            />
          );
        })}
      </div>

      {(enterpriseLink || personLink) && (
        <div className="flex items-center justify-end text-[11px]">
          {isPerson && personLink ? (
            <Link
              to="/outreach/enterprise/$id/contact/$idx"
              params={{ id: personLink.entId, idx: personLink.idx }}
              className="text-primary hover:underline underline-offset-2"
            >
              查看人物 →
            </Link>
          ) : (
            !isPerson && enterpriseLink && (
              <Link
                to={enterpriseLink}
                className="text-primary hover:underline underline-offset-2"
              >
                查看企业 →
              </Link>
            )
          )}
        </div>
      )}
    </Card>
  );
}

function UnlockedPage() {
  return <UnlockedPageInner />;
}

function StatTile({ label, value, hint, unit }: { label: string; value: number; hint: string; unit?: string }) {
  return (
    <div className="rounded-xl bg-white/15 backdrop-blur-sm px-4 py-3 ring-1 ring-white/25 min-w-[110px]">
      <div className="flex items-center gap-1 text-[11px] text-white/80">
        <span>{label}</span>
        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${label}统计口径说明`}
              className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-white/70 hover:text-white transition-colors"
            >
              <Info className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="max-w-[260px] text-xs leading-relaxed">
            {hint}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="text-xl font-bold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-xs font-medium text-white/80">{unit}</span>}
      </div>
    </div>
  );
}

function UnlockedPageInner() {
  useEffect(() => {
    seedDemoLedgerIfEmpty();
  }, []);

  const all = useUnlockedContacts();
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [owner, setOwner] = useState<OwnerFilter>("all");
  const [aggregate, setAggregate] = useState<AggregateMode>("none");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [bulkAcked, setBulkAcked] = useState(false);

  const toggleReveal = useCallback(
    (key: string) => {
      setRevealed((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
          return next;
        }
        if (!bulkAcked && next.size >= REVEAL_LIMIT) {
          setPendingKey(key);
          setConfirmOpen(true);
          return prev;
        }
        next.add(key);
        return next;
      });
    },
    [bulkAcked],
  );

  const confirmReveal = () => {
    setBulkAcked(true);
    setConfirmOpen(false);
    if (pendingKey) {
      setRevealed((prev) => {
        const next = new Set(prev);
        next.add(pendingKey);
        return next;
      });
      setPendingKey(null);
    }
    toast.info("已开启本次会话的批量明示，请注意防止截屏泄露");
  };

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const from = dateRange?.from ? new Date(dateRange.from).setHours(0, 0, 0, 0) : -Infinity;
    const to = dateRange?.to
      ? new Date(dateRange.to).setHours(23, 59, 59, 999)
      : dateRange?.from
        ? new Date(dateRange.from).setHours(23, 59, 59, 999)
        : Infinity;
    return all.filter((c) => {
      if (!matchChannel(c, channel)) return false;
      if (owner !== "all" && c.owner_type !== owner) return false;
      if (c.unlock_time < from || c.unlock_time > to) return false;
      if (kw) {
        const hay = `${c.owner_name} ${c.contact_value} ${c.parent_ref?.name ?? ""} ${c.platform ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [all, q, channel, owner, dateRange]);

  const stats = useMemo(() => {
    const enterprises = new Set(
      filtered.map((c) =>
        c.owner_type === "enterprise" ? c.owner_id : c.parent_ref?.id ?? c.owner_id,
      ),
    ).size;
    const persons = new Set(
      filtered
        .filter((c) => c.owner_type === "person")
        .map((c) => c.owner_id),
    ).size;
    return { count: filtered.length, enterprises, persons };
  }, [filtered]);

  const dateLabel = dateRange?.from
    ? dateRange.to && dateRange.to.getTime() !== dateRange.from.getTime()
      ? `${fmtDate(dateRange.from)} ~ ${fmtDate(dateRange.to)}`
      : fmtDate(dateRange.from)
    : "解锁时间";

  const groupedByDate = useMemo(() => {
    // First bucket contacts by date, then optionally aggregate by owner within each day
    const byDate = new Map<string, UnlockedContact[]>();
    for (const c of filtered) {
      const k = dateKeyOf(c.unlock_time);
      if (!byDate.has(k)) byDate.set(k, []);
      byDate.get(k)!.push(c);
    }
    const out: { dateKey: string; count: number; groups: ContactGroup[] }[] = [];
    for (const [dateKey, list] of byDate.entries()) {
      let groups: ContactGroup[];
      if (aggregate === "owner") {
        const map = new Map<string, ContactGroup>();
        for (const c of list) {
          const k = `${c.owner_type}:${c.owner_id}`;
          let g = map.get(k);
          if (!g) {
            g = {
              key: `${dateKey}:${k}`,
              owner_type: c.owner_type,
              owner_id: c.owner_id,
              owner_name: c.owner_name,
              parent_ref: c.parent_ref,
              contacts: [],
              latestUnlock: 0,
            };
            map.set(k, g);
          }
          g.contacts.push(c);
          if (!g.parent_ref && c.parent_ref) g.parent_ref = c.parent_ref;
          if (c.unlock_time > g.latestUnlock) g.latestUnlock = c.unlock_time;
        }
        groups = Array.from(map.values()).sort(
          (a, b) => b.latestUnlock - a.latestUnlock,
        );
      } else {
        // Flat: one card per contact
        groups = list
          .slice()
          .sort((a, b) => b.unlock_time - a.unlock_time)
          .map((c) => ({
            key: `${dateKey}:${c.owner_type}:${c.owner_id}:${c.contact_type}:${c.contact_value}`,
            owner_type: c.owner_type,
            owner_id: c.owner_id,
            owner_name: c.owner_name,
            parent_ref: c.parent_ref,
            contacts: [c],
            latestUnlock: c.unlock_time,
          }));
      }
      out.push({ dateKey, count: list.length, groups });
    }
    return out.sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
  }, [filtered, aggregate]);

  return (
    <TooltipProvider delayDuration={150}>
    <div className="p-6 space-y-4">
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
            <KeyRound className="h-7 w-7" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-wide">解锁记录</h1>
            <p className="text-white/90 text-sm mt-1">
              集中查看您已解锁的企业与人物联系方式，支持按渠道、归属和解锁时间快速检索。
            </p>
          </div>
          <div className="hidden md:flex items-stretch gap-3">
            <StatTile
              label="解锁联系方式"
              value={stats.count}
              hint="累计解锁的联系方式条数（手机 / 邮箱 / 社媒各计 1 条），非去重企业数。"
              unit="次"
            />
            <StatTile
              label="解锁企业"
              value={stats.enterprises}
              hint="去重后的企业数，同一企业多次解锁只计 1 家。"
              unit="家"
            />
            <StatTile
              label="解锁联系人"
              value={stats.persons}
              hint="去重后的联系人数，同一联系人多次解锁只计 1 位。"
              unit="位"
            />
          </div>
        </div>
      </section>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-[400px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索企业 / 联系人 / 邮箱 / 电话等联系方式"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-9 gap-2 font-normal",
                  !dateRange?.from && "text-muted-foreground",
                )}
              >
                <CalendarDays className="h-4 w-4" />
                {dateLabel}
                {dateRange?.from && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDateRange(undefined);
                    }}
                    className="ml-1 rounded-sm p-0.5 hover:bg-muted"
                    aria-label="清除日期"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
          <Select value={channel} onValueChange={(v) => setChannel(v as ChannelFilter)}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="全部渠道" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部渠道</SelectItem>
              <SelectItem value="email">邮件</SelectItem>
              <SelectItem value="sms">短信</SelectItem>
              <SelectItem value="social">社媒</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
            </SelectContent>
          </Select>
          <Tabs value={owner} onValueChange={(v) => setOwner(v as OwnerFilter)}>
            <TabsList className="h-9">
              <TabsTrigger value="all">全部归属</TabsTrigger>
              <TabsTrigger value="enterprise">企业</TabsTrigger>
              <TabsTrigger value="person">人物</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">展示方式</span>
            <Tabs
              value={aggregate}
              onValueChange={(v) => setAggregate(v as AggregateMode)}
            >
              <TabsList className="h-8">
                <TabsTrigger value="none" className="text-xs px-2.5">
                  平铺
                </TabsTrigger>
                <TabsTrigger value="owner" className="text-xs px-2.5">
                  按企业 / 人物聚合
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-16 text-center text-sm text-muted-foreground">
          <KeyRound className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <div>还没有匹配的解锁记录。</div>
          <div className="mt-1 text-xs">
            前往「客户发现」查看企业联系方式后，将自动出现在此处。
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedByDate.map(({ dateKey, count, groups }) => (
            <div key={dateKey} className="space-y-3">
              <div className="flex items-center gap-3 sticky top-0 z-10 bg-background/95 backdrop-blur py-1">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <CalendarIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{dateKey}</div>
                    <div className="text-xs text-muted-foreground">
                      {weekdayCN(dateKey)}
                    </div>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {count} 条记录
                </Badge>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {groups.map((g) => (
                  <GroupCard
                    key={g.key}
                    g={g}
                    revealed={revealed}
                    onToggle={toggleReveal}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>连续揭示超过 {REVEAL_LIMIT} 条</AlertDialogTitle>
            <AlertDialogDescription>
              为防止截屏泄露联系方式，请确认继续以明文展示。确认后本次会话内将不再提示。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingKey(null)}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmReveal}>
              我已知晓，继续
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}