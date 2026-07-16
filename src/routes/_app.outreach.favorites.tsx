import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Star,
  ChevronRight,
  Calendar as CalendarIcon,
  Building2,
  Package,
  FileText,
  UserRound,
  Search,
  X,
  ArrowUpDown,
  Trash2,
  Send,
  MailPlus,
  MessageSquare,
  MailWarning,
  Mailbox as MailboxIcon,
  ExternalLink,
  Mail,
  Phone,
  Briefcase,
  ArrowRight,
  Anchor,
  EyeOff,
  Linkedin,
  Facebook,
  Twitter,
  MessageCircle,
  ChevronDown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useFavorites,
  removeFavoritesByIds,
  seedDemoFavoritesIfEmpty,
  type FavoriteKind,
  type FavoriteRecord,
} from "@/lib/favorites";
import { MaskedField } from "@/components/MaskedField";
import { ReachButton } from "@/components/ReachButton";
import { WhatsAppReachButton } from "@/components/WhatsAppReachButton";
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { findEnterprise } from "@/data/enterprises";
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
  useUsableMailboxes,
  getDefaultUsableMailbox,
} from "@/lib/mailboxes";
import { formatDateTime } from "@/lib/format-date";
import { toast } from "sonner";
import { ComposeSendDialog } from "@/components/ComposeSendDialog";
import { recipientsFromFavorites, myContext } from "@/lib/message-vars";
import { useLeadProfile } from "@/lib/lead-profile";
import { useCurrentUser } from "@/lib/current-user";
import {
  BatchSocialDialog,
  type SocialCandidate,
} from "@/components/BatchSocialDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_app/outreach/favorites")({
  head: () => ({ meta: [{ title: "出海大数据平台 · 收藏 | 出海大数据平台" }] }),
  component: FavoritesPage,
});

type KindFilter = "all" | FavoriteKind;

const KIND_META: Record<
  FavoriteKind,
  { label: string; icon: typeof Building2; tone: string; toneBg: string }
> = {
  enterprise: {
    label: "企业",
    icon: Building2,
    tone: "text-primary",
    toneBg: "bg-primary/10",
  },
  contact: {
    label: "人物",
    icon: UserRound,
    tone: "text-violet-600",
    toneBg: "bg-violet-500/10",
  },
  bill: {
    label: "提单",
    icon: FileText,
    tone: "text-emerald-600",
    toneBg: "bg-emerald-500/10",
  },
  product: {
    label: "商品",
    icon: Package,
    tone: "text-amber-600",
    toneBg: "bg-amber-500/10",
  },
};

function fmtDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function FavoritesPage() {
  const all = useFavorites();
  useEffect(() => {
    seedDemoFavoritesIfEmpty();
  }, []);
  const [kind, setKind] = useState<KindFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  type SortKey =
    | "newest"
    | "oldest"
    | "name-asc"
    | "name-desc"
    | "kind"
    | "relevance";
  const [sort, setSort] = useState<SortKey>("newest");
  const [lastNonRelevance, setLastNonRelevance] = useState<SortKey>("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const usableMailboxes = useUsableMailboxes();
  const [noMailboxOpen, setNoMailboxOpen] = useState(false);
  const [batchEmailOpen, setBatchEmailOpen] = useState(false);
  const [batchSmsOpen, setBatchSmsOpen] = useState(false);
  const [batchSenderId, setBatchSenderId] = useState("");
  const [batchSocialOpen, setBatchSocialOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const profile = useLeadProfile();
  const user = useCurrentUser();
  const myVars = myContext(profile, user);

  const selectedRecords = useMemo(
    () => all.filter((r) => selected.has(r.id)),
    [all, selected],
  );
  const emailRecipients = useMemo(
    () => recipientsFromFavorites(selectedRecords, "email", myVars),
    [selectedRecords, myVars],
  );
  const smsRecipients = useMemo(
    () => recipientsFromFavorites(selectedRecords, "phone", myVars),
    [selectedRecords, myVars],
  );

  // WhatsApp 候选人：从选中的收藏（企业/联系人）里取 whatsapp 号码
  const waCandidates = useMemo<SocialCandidate[]>(() => {
    const out: SocialCandidate[] = [];
    for (const r of selectedRecords) {
      if (r.kind === "enterprise") {
        const e = findEnterprise(r.refId);
        if (!e) continue;
        out.push({
          key: r.id,
          address: e.whatsapp ?? "",
          name: r.title,
          targetKind: "enterprise",
          targetId: r.refId,
          enterpriseId: r.refId,
          ctx: {
            企业名: e.name,
            联系人名: e.contacts?.[0]?.name,
            行业: e.industry,
            城市: e.city,
            ...myVars,
          },
        });
      } else if (r.kind === "contact") {
        const entId = r.parentRef?.id ?? r.refId.split(":")[0];
        const idx = Number(r.refId.split(":")[1] ?? "0");
        const e = entId ? findEnterprise(entId) : undefined;
        const c = e?.contacts?.[idx];
        out.push({
          key: r.id,
          address: c?.whatsapp ?? "",
          name: r.title,
          targetKind: "contact",
          targetId: `${entId}:${idx}`,
          parentRef: r.parentRef
            ? { id: r.parentRef.id, name: r.parentRef.name }
            : undefined,
          enterpriseId: entId,
          ctx: {
            企业名: r.parentRef?.name ?? e?.name,
            联系人名: r.title,
            行业: e?.industry,
            城市: e?.city,
            ...myVars,
          },
        });
      }
    }
    return out;
  }, [selectedRecords, myVars]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: 0,
      enterprise: 0,
      contact: 0,
      bill: 0,
      product: 0,
    };
    for (const r of all) {
      c.all++;
      c[r.kind]++;
    }
    return c;
  }, [all]);

  const trimmed = keyword.trim().toLowerCase();
  const hasKeyword = trimmed.length > 0;

  // Auto-switch sort when keyword toggles
  useEffect(() => {
    if (hasKeyword && sort !== "relevance") {
      setLastNonRelevance(sort);
      setSort("relevance");
    } else if (!hasKeyword && sort === "relevance") {
      setSort(lastNonRelevance);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasKeyword]);

  function relevanceScore(r: FavoriteRecord, k: string): number {
    if (!k) return 0;
    const fields: { v: string; w: number }[] = [
      { v: r.title, w: 3 },
      { v: r.subtitle ?? "", w: 2 },
      { v: r.parentRef?.name ?? "", w: 2 },
      ...Object.values(r.meta ?? {}).map((v) => ({ v, w: 1 })),
    ];
    let score = 0;
    for (const f of fields) {
      const s = f.v.toLowerCase();
      if (!s) continue;
      const idx = s.indexOf(k);
      if (idx < 0) continue;
      score += f.w * 10;
      if (idx === 0) score += f.w * 5; // prefix bonus
      // additional occurrences
      let from = idx + k.length;
      while (true) {
        const j = s.indexOf(k, from);
        if (j < 0) break;
        score += f.w;
        from = j + k.length;
      }
    }
    return score;
  }

  const KIND_ORDER: Record<FavoriteKind, number> = {
    enterprise: 0,
    contact: 1,
    bill: 2,
    product: 3,
  };

  const filtered = useMemo(() => {
    const dKey = date ? fmtDateKey(date) : null;
    const list = all.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (dKey && !r.createdAt.startsWith(dKey)) return false;
      if (trimmed) {
        const hay = [
          r.title,
          r.subtitle || "",
          r.parentRef?.name || "",
          ...Object.values(r.meta || {}),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(trimmed)) return false;
      }
      return true;
    });
    const cmpNewest = (a: FavoriteRecord, b: FavoriteRecord) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
    const cmpName = (a: FavoriteRecord, b: FavoriteRecord) =>
      a.title.localeCompare(b.title, "zh-Hans-CN");
    switch (sort) {
      case "oldest":
        list.sort((a, b) => -cmpNewest(a, b));
        break;
      case "name-asc":
        list.sort(cmpName);
        break;
      case "name-desc":
        list.sort((a, b) => -cmpName(a, b));
        break;
      case "kind":
        list.sort(
          (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || cmpNewest(a, b),
        );
        break;
      case "relevance": {
        const k = trimmed;
        list.sort((a, b) => {
          const sa = relevanceScore(a, k);
          const sb = relevanceScore(b, k);
          if (sa !== sb) return sb - sa;
          return cmpNewest(a, b);
        });
        break;
      }
      case "newest":
      default:
        list.sort(cmpNewest);
        break;
    }
    return list;
  }, [all, kind, trimmed, date, sort]);

  const allSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.id)));
    }
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const removeSelected = () => {
    removeFavoritesByIds(Array.from(selected));
    setSelected(new Set());
  };

  const kindOptions: { key: KindFilter; label: string; icon: typeof Building2 }[] = [
    { key: "all", label: "全部", icon: Star },
    { key: "enterprise", label: "企业", icon: Building2 },
    { key: "contact", label: "人物", icon: UserRound },
    { key: "product", label: "商品", icon: Package },
  ];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span>出海大数据平台</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">收藏</span>
      </div>

      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-2xl p-6 text-white"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Star className="h-6 w-6 fill-amber-300 text-amber-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold">收藏中心</h1>
            <p className="text-white/85 text-sm mt-0.5">
              你主动加星的企业、联系人与商品，长期保留、便于持续跟进（与足迹不同：足迹为浏览记录，自动生成）
            </p>
          </div>
          <div className="ml-auto hidden md:flex items-center gap-6 text-sm">
            {(["enterprise", "contact", "product"] as FavoriteKind[]).map(
              (k) => (
                <div key={k} className="text-center">
                  <div className="text-2xl font-bold tabular-nums">
                    {counts[k] ?? 0}
                  </div>
                  <div className="text-white/70 text-xs">{KIND_META[k].label}</div>
                </div>
              ),
            )}
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          <Button
            asChild
            size="sm"
            variant="secondary"
            className="h-8 bg-white/15 text-white border-white/20 hover:bg-white/25"
          >
            <Link to="/outreach/favorites-empty">
              <EyeOff className="h-3.5 w-3.5 mr-1.5" />
              查看空状态演示
            </Link>
          </Button>
        </div>
      </section>

      {/* 筛选 */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground mr-1">类型</span>
          {kindOptions.map((opt) => {
            const active = kind === opt.key;
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                onClick={() => setKind(opt.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm border transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:bg-muted",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {opt.label}
                <Badge
                  variant="secondary"
                  className={cn(
                    "ml-1 h-5 px-1.5 text-[11px]",
                    active && "bg-primary-foreground/20 text-primary-foreground",
                  )}
                >
                  {counts[opt.key] ?? 0}
                </Badge>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索标题、副标题、所属企业或元数据"
              className="pl-9 h-9"
            />
          </div>
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-9 justify-start text-left font-normal min-w-[180px]",
                  !date && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="h-4 w-4 mr-2" />
                {date ? fmtDateKey(date) : "收藏时间"}
                {date && (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDate(undefined);
                    }}
                    className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5" />
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => {
                  setDate(d);
                  setCalOpen(false);
                }}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <Select
            value={sort}
            onValueChange={(v) => {
              const next = v as SortKey;
              setSort(next);
              if (next !== "relevance") setLastNonRelevance(next);
            }}
          >
            <SelectTrigger className="h-9 w-[170px]">
              <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {hasKeyword && (
                <SelectItem value="relevance">匹配度（关键词）</SelectItem>
              )}
              <SelectItem value="newest">最近收藏</SelectItem>
              <SelectItem value="oldest">最早收藏</SelectItem>
              <SelectItem value="name-asc">名称 A → Z</SelectItem>
              <SelectItem value="name-desc">名称 Z → A</SelectItem>
              <SelectItem value="kind">按类型分组</SelectItem>
            </SelectContent>
          </Select>
          {(date || keyword || kind !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDate(undefined);
                setKeyword("");
                setKind("all");
              }}
            >
              <X className="h-4 w-4 mr-1" />
              清除
            </Button>
          )}
        </div>
      </Card>

      {/* 批量操作栏 */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            aria-label="全选"
          />
          <span className="text-muted-foreground">
            已选 <span className="text-foreground font-medium">{selected.size}</span> /{" "}
            {filtered.length} 条
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={selected.size === 0}
              className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
              onClick={() => {
                if (usableMailboxes.length === 0) {
                  setNoMailboxOpen(true);
                  return;
                }
                setBatchSenderId(
                  getDefaultUsableMailbox(usableMailboxes)?.id ?? "",
                );
                setBatchEmailOpen(true);
              }}
            >
              <MailPlus className="h-4 w-4" />
              批量发邮件
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selected.size === 0}
              className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
              onClick={() => setBatchSmsOpen(true)}
            >
              <MessageSquare className="h-4 w-4" />
              批量发短信
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selected.size === 0}
              className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
              onClick={() => setBatchSocialOpen(true)}
            >
              <MessageCircle className="h-4 w-4" />
              批量 WhatsApp 触达
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={selected.size === 0}
                  className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                  title="批量社媒触达"
                >
                  批量社媒触达
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem disabled>
                  <span className="inline-block h-4 w-4" />
                  TikTok
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    即将上线
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <span className="inline-block h-4 w-4" />
                  Facebook
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    即将上线
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <span className="inline-block h-4 w-4" />
                  LinkedIn
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    即将上线
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              disabled={selected.size === 0}
              className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              onClick={removeSelected}
            >
              <Trash2 className="h-4 w-4" />
              取消收藏
            </Button>
          </div>
        </div>
      )}

      {/* 列表 */}
      {filtered.length === 0 ? (
        <Card className="p-16 flex flex-col items-center justify-center text-center gap-3 border-dashed">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
            <Star className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="text-base font-medium">
            {all.length === 0 ? "还没有收藏的内容" : "当前筛选条件下没有匹配结果"}
          </div>
          <div className="text-sm text-muted-foreground max-w-md">
            前往
            <Link to="/outreach/enterprise" className="text-primary mx-1 hover:underline">
              企业
            </Link>
            页面，点击星标即可收藏感兴趣的企业与人物
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <FavoriteCard
              key={r.id}
              record={r}
              selected={selected.has(r.id)}
              onToggleSelect={() => toggleOne(r.id)}
            />
          ))}
        </div>
      )}

      {/* 未配置邮箱提示 */}
      <AlertDialog open={noMailboxOpen} onOpenChange={setNoMailboxOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-700">
              <MailWarning className="h-5 w-5" />
              未配置发件邮箱
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  批量发邮件需要先在「邮箱」模块配置至少一个状态为「正常」的发件邮箱。
                </p>
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                  请先前往「系统管理 · 邮箱」新增邮箱并完成连接测试。
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary"
              onClick={() => {
                setNoMailboxOpen(false);
                navigate({ to: "/outreach/mailboxes" });
              }}
            >
              去设置邮箱
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ComposeSendDialog
        open={batchEmailOpen}
        onOpenChange={setBatchEmailOpen}
        channel="email"
        recipients={emailRecipients}
        totalSelected={selectedRecords.length}
        initialSenderId={batchSenderId}
      />
      <ComposeSendDialog
        open={batchSmsOpen}
        onOpenChange={setBatchSmsOpen}
        channel="phone"
        recipients={smsRecipients}
        totalSelected={selectedRecords.length}
      />
      <BatchSocialDialog
        open={batchSocialOpen}
        onOpenChange={setBatchSocialOpen}
        platform="WhatsApp"
        candidates={waCandidates}
      />
    </div>
  );
}

function FavoriteCard({
  record,
  selected,
  onToggleSelect,
}: {
  record: FavoriteRecord;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const meta = KIND_META[record.kind];
  const Icon = meta.icon;
  const navigate = useNavigate();
  const blankAreaPressStartedRef = useRef(false);

  const target = useTarget(record);

  const isCardBlankAreaEvent = (event: MouseEvent<HTMLElement>) => {
    const eventTarget = event.target;
    if (!(eventTarget instanceof Element)) return false;

    // Radix Dialog/Dropdown 内容通过 Portal 渲染，React 事件仍会向卡片冒泡；
    // 只允许来自当前卡片 DOM 内、且不属于交互控件的点击进入详情。
    if (!event.currentTarget.contains(eventTarget)) return false;
    return !eventTarget.closest(
      [
        "a",
        "button",
        "input",
        "textarea",
        "select",
        "label",
        "[role='button']",
        "[role='checkbox']",
        "[role='menuitem']",
        "[data-radix-popper-content-wrapper]",
      ].join(","),
    );
  };

  const openTargetDetail = () => {
    if (!target) return;
    if (target.kind === "enterprise") {
      navigate({ to: "/outreach/enterprise/$id", params: { id: target.id }, hash: target.hash });
      return;
    }
    if (target.kind === "contact") {
      navigate({ to: "/outreach/enterprise/$id/contact/$idx", params: { id: target.id, idx: target.idx } });
      return;
    }
    if (target.kind === "product") {
      navigate({ to: "/outreach/products/$hs", params: { hs: target.id } });
      return;
    }
    navigate({ to: "/outreach/bills" });
  };

  const handleContactCardClick = (event: MouseEvent<HTMLElement>) => {
    const isBlankAreaClick = isCardBlankAreaEvent(event);
    if (!blankAreaPressStartedRef.current || !isBlankAreaClick) {
      blankAreaPressStartedRef.current = false;
      return;
    }
    blankAreaPressStartedRef.current = false;

    openTargetDetail();
  };

  const content = (
    <>
      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", meta.toneBg, meta.tone)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge
            variant="outline"
            className={cn("text-[10px] px-1.5 py-0 h-4 border-current/40", meta.tone)}
          >
            {meta.label}
          </Badge>
          <span
            className="ml-auto mr-8 text-[11px] text-muted-foreground font-mono truncate"
            title="收藏时间"
          >
            {formatDateTime(record.createdAt)}
          </span>
        </div>
        <div className="font-medium text-sm truncate">{record.title}</div>
        {record.subtitle && <FavoriteSubtitle record={record} />}
        <FavoriteMeta record={record} />
      </div>
    </>
  );

  const contentClassName = "group flex items-start gap-3 flex-1 min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const card = (linkedContent: ReactNode, contactCardLink = false) => (
    <Card
      onPointerDownCapture={
        contactCardLink
          ? (event) => {
              blankAreaPressStartedRef.current = isCardBlankAreaEvent(event);
            }
          : undefined
      }
      onClick={contactCardLink ? handleContactCardClick : undefined}
      className={cn(
        "p-4 h-full transition-all relative",
        "hover:shadow-md hover:border-primary/40",
        contactCardLink && "cursor-pointer",
        selected && "ring-2 ring-primary/50",
      )}
    >
      <div
        className="absolute top-2 right-2 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <FavoriteToggle
          kind={record.kind}
          refId={record.refId}
          payload={{
            title: record.title,
            subtitle: record.subtitle,
            meta: record.meta,
            parentRef: record.parentRef,
          }}
          variant="inline"
          size="sm"
        />
      </div>
      <div className="flex items-start gap-3">
        <div className="pt-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            aria-label="选择"
          />
        </div>
        {linkedContent}
      </div>
    </Card>
  );

  if (!target) return card(<div className={contentClassName}>{content}</div>);

  if (target.kind === "enterprise") {
    return card(
      <Link
        to="/outreach/enterprise/$id"
        params={{ id: target.id }}
        hash={target.hash}
        className={contentClassName}
      >
        {content}
      </Link>,
    );
  }
  if (target.kind === "contact") {
    return card(
      <div className={contentClassName}>
        {content}
      </div>,
      true,
    );
  }
  if (target.kind === "product") {
    return card(
      <Link to="/outreach/products/$hs" params={{ hs: target.id }} className={contentClassName}>
        {content}
      </Link>,
    );
  }
  return card(
    <Link to="/outreach/bills" className={contentClassName}>
      {content}
    </Link>,
  );
}

function FavoriteSubtitle({ record }: { record: FavoriteRecord }) {
  if (!record.subtitle) return null;
  if (record.kind === "enterprise") {
    const e = findEnterprise(record.refId);
    if (!e?.industry) return null;
    return (
      <div className="text-xs text-muted-foreground truncate mt-0.5">
        {e.industry}
      </div>
    );
  }
  if (record.kind === "contact") {
    const entId = record.parentRef?.id ?? record.refId.split(":")[0];
    const idx = record.refId.split(":")[1] ?? "0";
    const targetId = `${entId}:${idx}`;
    const parentRef = record.parentRef
      ? { id: record.parentRef.id, name: record.parentRef.name }
      : undefined;
    return (
      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 min-w-0">
        <Briefcase className="h-3 w-3 shrink-0" />
        <MaskedField
          targetKind="contact"
          targetId={targetId}
          targetName={record.title}
          parentRef={parentRef}
          field="title"
          value={record.subtitle}
        />
      </div>
    );
  }
  return (
    <div className="text-xs text-muted-foreground truncate mt-0.5">
      {record.subtitle}
    </div>
  );
}

function FavoriteMeta({ record }: { record: FavoriteRecord }) {
  // declared below
  return _renderMeta(record);
}

function SocialMiniBadge({
  active,
  kind,
}: {
  active: boolean;
  kind: "linkedin" | "facebook" | "twitter" | "whatsapp";
}) {
  const Icon =
    kind === "linkedin"
      ? Linkedin
      : kind === "facebook"
        ? Facebook
        : kind === "whatsapp"
          ? MessageCircle
          : Twitter;
  const color =
    kind === "linkedin"
      ? "bg-[#0a66c2] text-white"
      : kind === "facebook"
        ? "bg-[#1877f2] text-white"
        : kind === "whatsapp"
          ? "bg-[#25d366] text-white"
          : "bg-foreground text-background";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center h-5 w-5 rounded",
        active ? color : "bg-muted text-muted-foreground/60",
      )}
      aria-label={kind}
    >
      <Icon className="h-2.5 w-2.5" />
    </span>
  );
}

function _renderMeta(record: FavoriteRecord) {
  if (record.kind === "enterprise") {
    const m = record.meta || {};
    const e = findEnterprise(record.refId);
    const est = e?.est || m.est || "";
    const role = e?.tradeRole || m.role || "";
    const socials = e?.socials;
    return (
      <div className="mt-1.5 space-y-2">
        {role && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-auto shrink-0">
              {role}
            </Badge>
          </div>
        )}
        {est && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono tabular-nums text-foreground/80 shrink-0 ml-auto">
              est. {est}
            </span>
          </div>
        )}
        {socials && (
          <div className="pt-2 border-t flex items-center gap-1.5">
            <SocialMiniBadge active={socials.linkedin} kind="linkedin" />
            <SocialMiniBadge active={socials.facebook} kind="facebook" />
            <SocialMiniBadge active={socials.twitter} kind="twitter" />
            <SocialMiniBadge active={socials.whatsapp} kind="whatsapp" />
          </div>
        )}
      </div>
    );
  }
  if (record.kind === "contact") {
    const m = record.meta || {};
    const entId = record.parentRef?.id ?? record.refId.split(":")[0];
    const idx = record.refId.split(":")[1] ?? "0";
    const targetId = `${entId}:${idx}`;
    const parentRef = record.parentRef
      ? { id: record.parentRef.id, name: record.parentRef.name }
      : undefined;
    return (
      <div className="text-xs text-muted-foreground mt-1.5 space-y-1">
        {m.email && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Mail className="h-3 w-3 shrink-0" />
            <MaskedField
              targetKind="contact"
              targetId={targetId}
              targetName={record.title}
              parentRef={parentRef}
              field="email"
              value={m.email}
              mono
            />
            <ReachButton
              targetKind="contact"
              targetId={targetId}
              targetName={record.title}
              parentRef={parentRef}
              channel="email"
              detail={m.email}
            />
          </div>
        )}
        {m.phone && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Phone className="h-3 w-3 shrink-0" />
            <MaskedField
              targetKind="contact"
              targetId={targetId}
              targetName={record.title}
              parentRef={parentRef}
              field="phone"
              value={m.phone}
              mono
            />
            <ReachButton
              targetKind="contact"
              targetId={targetId}
              targetName={record.title}
              parentRef={parentRef}
              channel="phone"
              detail={m.phone}
            />
            <WhatsAppReachButton
              targetKind="contact"
              targetId={targetId}
              targetName={record.title}
              parentRef={parentRef}
              phone={m.phone}
            />
          </div>
        )}
        {record.parentRef && (
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3 w-3" />
            <span className="truncate text-primary/90">
              {record.parentRef.name}
            </span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </div>
        )}
      </div>
    );
  }
  if (record.kind === "product") {
    const m = record.meta || {};
    return (
      <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2 flex-wrap">
        {m.hs && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-mono">
            HS {m.hs}
          </Badge>
        )}
        {m.category && <span className="truncate">{m.category}</span>}
      </div>
    );
  }
  // bill
  const m = record.meta || {};
  return (
    <div className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
      {(m.exporter || m.importer) && (
        <div className="flex items-center gap-1 truncate">
          <span className="text-foreground/80 truncate">{m.exporter || "—"}</span>
          <ArrowRight className="h-3 w-3 shrink-0" />
          <span className="text-foreground/80 truncate">{m.importer}</span>
        </div>
      )}
      {(m.fromPort || m.toPort) && (
        <div className="flex items-center gap-1 font-mono truncate">
          <Anchor className="h-3 w-3" />
          {m.fromPort}
          <ArrowRight className="h-3 w-3" />
          {m.toPort}
        </div>
      )}
      {m.hs && (
        <div className="font-mono">
          HS {m.hs} · {m.date}
        </div>
      )}
    </div>
  );
}

function useTarget(
  r: FavoriteRecord,
):
  | { kind: "enterprise"; id: string; hash?: string }
  | { kind: "contact"; id: string; idx: string }
  | { kind: "product"; id: string }
  | { kind: "bill" }
  | null {
  if (r.kind === "enterprise") return { kind: "enterprise", id: r.refId };
  if (r.kind === "contact") {
    // refId 形如 "<entId>:<idx>"；优先用 parentRef.id 作为企业 id
    const parts = r.refId.split(":");
    const entId = r.parentRef?.id ?? parts[0];
    const contactIdx = parts[1] ?? "0";
    if (!entId) return null;
    return { kind: "contact", id: entId, idx: contactIdx };
  }
  if (r.kind === "product") return { kind: "product", id: r.refId };
  if (r.kind === "bill") return { kind: "bill" };
  return null;
}
