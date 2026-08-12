import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Search,
  Building2,
  Globe2,
  Users2,
  X as XIcon,
  TrendingUp,
  ChevronDown,
  Check,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/outreach/search")({
  head: () => ({
    meta: [
      { title: "商机线索 · 全球贸易搜索 | 出海大数据平台" },
      {
        name: "description",
        content:
          "按商品关键词、HS Code 或公司名称检索全球贸易商机，可筛选国家与进出口商角色。",
      },
      { property: "og:title", content: "商机线索 · 全球贸易搜索" },
      {
        property: "og:description",
        content: "按商品关键词、HS Code 或公司名称检索全球贸易商机。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SearchPage,
});

/* ------------------------------- 本地最近搜索 ------------------------------- */
const RECENT_KEY = "boo:global-search:recent";
const RECENT_MAX = 8;

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw)
      return ["铝材", "钢材", "铝合金门窗", "apple", "850760 锂电池"];
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

/* ------------------------------- 国家列表 ------------------------------- */
const COUNTRIES = [
  "安道尔",
  "阿拉伯联合酋长国",
  "阿富汗",
  "安提瓜和巴布达",
  "安圭拉",
  "阿尔巴尼亚",
  "亚美尼亚",
  "库拉索",
  "安哥拉",
  "阿根廷",
  "奥地利",
  "澳大利亚",
  "巴西",
  "比利时",
  "加拿大",
  "瑞士",
  "智利",
  "中国",
  "哥伦比亚",
  "捷克",
  "德国",
  "丹麦",
  "埃及",
  "西班牙",
  "法国",
  "英国",
  "印度",
  "印度尼西亚",
  "意大利",
  "日本",
  "韩国",
  "墨西哥",
  "马来西亚",
  "荷兰",
  "尼日利亚",
  "菲律宾",
  "波兰",
  "葡萄牙",
  "俄罗斯",
  "沙特阿拉伯",
  "瑞典",
  "新加坡",
  "泰国",
  "土耳其",
  "美国",
  "越南",
  "南非",
];

const PLACEHOLDER =
  '商品关键词或HS Code、公司名称等，支持逗号/分号/顿号/换行或中英文空格，如"850760 锂电池"';

/* ============================== 页面 ============================== */
function SearchPage() {
  const navigate = useNavigate();
  const [kw, setKw] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [countryKw, setCountryKw] = useState("");
  const [importer, setImporter] = useState(true);
  const [exporter, setExporter] = useState(true);
  const [recentTick, setRecentTick] = useState(0);
  const [mounted, setMounted] = useState(false);
  const recent = useMemo(() => loadRecent(), [recentTick]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const filteredCountries = useMemo(() => {
    const q = countryKw.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.toLowerCase().includes(q));
  }, [countryKw]);

  const countryLabel =
    countries.length === 0
      ? "全部国家"
      : countries.length === 1
        ? countries[0]
        : `已选 ${countries.length} 个国家`;

  const toggleCountry = (c: string) =>
    setCountries((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );

  const go = (keyword: string) => {
    const k = keyword.trim();
    if (!k) {
      toast.error("请输入搜索关键词");
      return;
    }
    if (!importer && !exporter) {
      toast.error("请至少选择进口商或出口商");
      return;
    }
    pushRecent(k);
    setRecentTick((n) => n + 1);
    if (/^\d{4,}$/.test(k)) {
      navigate({ to: "/outreach/products/$hs", params: { hs: k } });
    } else {
      navigate({ to: "/outreach/enterprise", search: { q: k } as never });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      go(kw);
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
          出海大数据平台 / <span className="text-foreground/80">商机线索</span>
        </div>

        {/* 标题 */}
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900">
            商机线索
          </h1>
          <p className="mt-4 text-base md:text-lg text-slate-500">
            从商品、HS 编码到企业，发现全球贸易机会
          </p>
        </div>

        {/* 搜索框 */}
        <div className="relative mx-auto mt-10 max-w-4xl">
          <div className="flex items-center gap-2 rounded-2xl bg-white pl-5 h-16 overflow-hidden shadow-[0_18px_60px_-20px_rgba(56,189,248,0.45)] ring-1 ring-white/80 focus-within:ring-primary/60 transition-all">
            <Search className="h-5 w-5 text-muted-foreground shrink-0 self-center" />
            <Input
              ref={inputRef}
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={PLACEHOLDER}
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
              onClick={() => go(kw)}
              className="inline-flex h-full items-center gap-2 rounded-none bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 shrink-0"
            >
              <Search className="h-4 w-4" />
              搜索
            </button>
          </div>

          {/* 过滤条件：国家 + 进出口商 */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <button className="inline-flex h-10 w-[240px] items-center justify-between rounded-lg bg-white px-3 text-sm text-slate-700 ring-1 ring-slate-200 hover:ring-primary/50 transition-colors">
                  <span className="truncate">{countryLabel}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[280px] p-0">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={countryKw}
                      onChange={(e) => setCountryKw(e.target.value)}
                      placeholder="搜索国家"
                      className="h-9 pl-7 text-sm"
                    />
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto py-1">
                  {filteredCountries.length === 0 && (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      无匹配国家
                    </div>
                  )}
                  {filteredCountries.map((c) => {
                    const checked = countries.includes(c);
                    return (
                      <button
                        key={c}
                        onClick={() => toggleCountry(c)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted/60"
                      >
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded border ${
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-slate-300"
                          }`}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <span className="truncate">{c}</span>
                      </button>
                    );
                  })}
                </div>
                {countries.length > 0 && (
                  <div className="flex items-center justify-between border-t px-3 py-2">
                    <span className="text-xs text-muted-foreground">
                      已选 {countries.length} 个
                    </span>
                    <button
                      onClick={() => setCountries([])}
                      className="text-xs text-primary hover:underline"
                    >
                      清空
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            <label className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-3 text-sm text-slate-700 ring-1 ring-slate-200 cursor-pointer">
              <Checkbox
                checked={importer}
                onCheckedChange={(v) => setImporter(v === true)}
              />
              进口商
            </label>
            <label className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-3 text-sm text-slate-700 ring-1 ring-slate-200 cursor-pointer">
              <Checkbox
                checked={exporter}
                onCheckedChange={(v) => setExporter(v === true)}
              />
              出口商
            </label>

            {countries.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {countries.slice(0, 4).map((c) => (
                  <Badge
                    key={c}
                    variant="secondary"
                    className="gap-1 bg-primary/8 text-primary"
                  >
                    {c}
                    <XIcon
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => toggleCountry(c)}
                    />
                  </Badge>
                ))}
                {countries.length > 4 && (
                  <Badge variant="secondary">+{countries.length - 4}</Badge>
                )}
              </div>
            )}
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
                <button
                  onClick={() => {
                    clearRecent();
                    setRecentTick((n) => n + 1);
                  }}
                  className="text-xs text-muted-foreground/70 hover:text-foreground ml-1"
                >
                  清空
                </button>
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
                  className="rounded-full px-3 py-1 text-sm text-primary/90 hover:bg-primary/12 transition-colors"
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
