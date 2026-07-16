import { useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Search,
  Package,
  Building2,
  Globe2,
  Users2,
  X as XIcon,
  TrendingUp,
  Hash,
  User,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/outreach/search")({
  head: () => ({ meta: [{ title: "出海大数据平台 · 搜索 | 出海大数据平台" }] }),
  component: SearchPage,
});

/* ------------------------------- 本地最近搜索 ------------------------------- */
const RECENT_KEY = "boo:global-search:recent";
const RECENT_MAX = 8;

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return ["铝材", "钢材", "铝合金门窗", "apple", "疏浚船、灯船、消防船及起重船等特种工程船舶"];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function pushRecent(kw: string) {
  if (typeof window === "undefined") return;
  const k = kw.trim();
  if (!k) return;
  const cur = loadRecent().filter((x) => x !== k);
  cur.unshift(k);
  localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, RECENT_MAX)));
}
function removeRecent(kw: string) {
  if (typeof window === "undefined") return;
  const cur = loadRecent().filter((x) => x !== kw);
  localStorage.setItem(RECENT_KEY, JSON.stringify(cur));
}
function clearRecent() {
  if (typeof window === "undefined") return;
  localStorage.setItem(RECENT_KEY, JSON.stringify([]));
}

/* ------------------------------- 热门搜索（mock） ------------------------------- */
const HOT_SEARCHES = ["花岗岩", "光伏组件", "新能源汽车", "锂电池", "680100", "germany"];

/* ------------------------------- 搜索类型 ------------------------------- */
type SearchScope = "product" | "hs" | "enterprise" | "person";

const SCOPES: {
  key: SearchScope;
  label: string;
  icon: typeof Package;
  placeholder: string;
}[] = [
  { key: "product", label: "商品描述", icon: Package, placeholder: "输入商品名称或描述关键词" },
  { key: "hs", label: "HS编码", icon: Hash, placeholder: "输入 HS 编码（4 位及以上数字）" },
  { key: "enterprise", label: "企业名称/描述", icon: Building2, placeholder: "输入企业名称或描述关键词" },
  { key: "person", label: "人物姓名/描述", icon: User, placeholder: "输入联系人姓名或描述关键词" },
];

/* ============================== 页面 ============================== */
function SearchPage() {
  const navigate = useNavigate();
  const [kw, setKw] = useState("");
  const [scope, setScope] = useState<SearchScope>("product");
  const [recentTick, setRecentTick] = useState(0);
  const recent = useMemo(() => loadRecent(), [recentTick]);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentScope = SCOPES.find((s) => s.key === scope) ?? SCOPES[0];

  const go = (s: SearchScope, keyword: string) => {
    const k = keyword.trim();
    if (!k) {
      toast.error("请输入搜索关键词");
      return;
    }
    if (s === "hs" && !/^\d{4,}$/.test(k)) {
      toast.error("HS 编码需为 4 位及以上数字");
      return;
    }
    pushRecent(k);
    setRecentTick((n) => n + 1);
    if (s === "person") {
      navigate({ to: "/outreach/leads" });
    } else if (s === "enterprise") {
      navigate({ to: "/outreach/enterprise", search: { q: k } as never });
    } else if (s === "hs") {
      navigate({ to: "/outreach/products/$hs", params: { hs: k } });
    } else {
      navigate({ to: "/outreach/products" });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      go(scope, kw);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-0px)] overflow-hidden bg-gradient-to-b from-cyan-50 via-sky-50/60 to-white">
      {/* 顶部光带装饰 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(56,189,248,0.18),transparent_70%)]" />
      <div className="pointer-events-none absolute -left-1/4 top-1/3 h-[480px] w-[120%] rotate-[-6deg] bg-[linear-gradient(90deg,transparent,rgba(186,230,253,0.55),transparent)] blur-2xl" />

      <div className="relative mx-auto max-w-6xl px-6 pt-16 pb-24">
        {/* 面包屑 */}
        <div className="text-xs text-muted-foreground/80 mb-10">
          出海大数据平台 / <span className="text-foreground/80">搜索</span>
        </div>

        {/* 标题 */}
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900">
            出海大数据平台大数据平台
          </h1>
          <p className="mt-4 text-base md:text-lg text-slate-500">
            从商品、市场到企业，发现全球贸易机会
          </p>
        </div>

        {/* 搜索框 */}
        <div className="relative mx-auto mt-10 max-w-3xl">
          <div className="flex items-center gap-2 rounded-2xl bg-white pl-2 h-16 overflow-hidden shadow-[0_18px_60px_-20px_rgba(56,189,248,0.45)] ring-1 ring-white/80 focus-within:ring-primary/60 transition-all">
            <Select value={scope} onValueChange={(v) => setScope(v as SearchScope)}>
              <SelectTrigger className="h-11 w-[200px] border-0 bg-transparent shadow-none hover:bg-transparent focus:ring-0 focus:ring-offset-0 rounded-none text-sm font-medium text-slate-700 shrink-0 whitespace-nowrap px-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" className="min-w-[200px]">
                {SCOPES.map((s) => {
                  const Icon = s.icon;
                  return (
                    <SelectItem key={s.key} value={s.key}>
                      <span className="inline-flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {s.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <div className="w-px bg-slate-200 shrink-0 self-center h-8" />
            <Search className="h-5 w-5 text-muted-foreground shrink-0 ml-1 self-center" />
            <Input
              ref={inputRef}
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={currentScope.placeholder}
              className="border-0 shadow-none focus-visible:ring-0 text-base h-12 px-0 placeholder:text-muted-foreground/70"
            />
            {kw && (
              <button
                onClick={() => setKw("")}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/60 shrink-0 self-center"
                aria-label="清空"
              >
                <XIcon className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => go(scope, kw)}
              className="h-full rounded-none bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 shrink-0"
            >
              搜索
            </button>
          </div>

          {/* 最近搜索 / 热门 */}
          <div className="mt-6 space-y-3">
              {recent.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground shrink-0">最近搜索：</span>
                  {recent.slice(0, 6).map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        setKw(r);
                        inputRef.current?.focus();
                      }}
                      className="group inline-flex max-w-[280px] items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-200 hover:ring-primary/50 hover:text-primary transition-colors"
                    >
                      <span className="truncate">{r}</span>
                      <XIcon
                        className="h-3 w-3 text-muted-foreground/60 opacity-0 group-hover:opacity-100 hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRecent(r);
                          setRecentTick((n) => n + 1);
                        }}
                      />
                    </button>
                  ))}
                  {recent.length > 0 && (
                    <button
                      onClick={() => {
                        clearRecent();
                        setRecentTick((n) => n + 1);
                      }}
                      className="text-xs text-muted-foreground/70 hover:text-foreground ml-1"
                    >
                      清空
                    </button>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground shrink-0">
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                  热门搜索：
                </span>
                {HOT_SEARCHES.map((h) => (
                  <button
                    key={h}
                    onClick={() => {
                      setKw(h);
                      inputRef.current?.focus();
                    }}
                    className="rounded-full bg-primary/8 px-3 py-1 text-sm text-primary/90 hover:bg-primary/12 transition-colors"
                    style={{ backgroundColor: "rgba(20,184,166,0.08)" }}
                  >
                    {h}
                  </button>
                ))}
              </div>
          </div>
        </div>

        {/* 数据指标卡片 */}
        <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-3">
          <StatCard
            icon={Globe2}
            tone="from-cyan-400 to-sky-500"
            kpi="239+"
            title="覆盖国家/地区"
            sub="全球主要贸易体"
          />
          <StatCard
            icon={Building2}
            tone="from-emerald-400 to-teal-500"
            kpi="2亿+"
            title="全球企业"
            sub="全球进出口企业"
          />
          <StatCard
            icon={Users2}
            tone="from-sky-400 to-indigo-500"
            kpi="10亿+"
            title="全球联系人"
            sub="全球联系人统计"
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- 指标卡片 ------------------------------- */
function StatCard({
  icon: Icon,
  tone,
  kpi,
  title,
  sub,
}: {
  icon: typeof Globe2;
  tone: string;
  kpi: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white/70 backdrop-blur-sm p-6 ring-1 ring-white/80 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.25)] transition-transform hover:-translate-y-0.5">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${tone} text-white shadow-md shadow-sky-200/60`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-base font-medium text-slate-700">{title}</div>
      </div>
      <div className="mt-5 text-4xl font-bold tracking-tight text-slate-900">
        {kpi}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        {sub}
      </div>
      <div className="pointer-events-none absolute -right-8 -bottom-8 h-32 w-32 rounded-full bg-gradient-to-br from-white/40 to-sky-200/30 blur-2xl opacity-70" />
    </div>
  );
}