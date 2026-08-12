import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Search,
  Lightbulb,
  Star,
  MapPin,
  FileText,
  Globe2,
  ChevronDown,
  Check,
  X as XIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/outreach/search-results")({
  head: () => ({
    meta: [
      { title: "商机线索结果页 · 出海大数据平台" },
      {
        name: "description",
        content: "商机线索搜索结果页，展示匹配的企业线索列表。",
      },
      { property: "og:title", content: "商机线索结果页 · 出海大数据平台" },
      {
        property: "og:description",
        content: "商机线索搜索结果页，展示匹配的企业线索列表。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SearchResultsPage,
});

/* ------------------------------- 国家列表 ------------------------------- */
const COUNTRIES = [
  "安道尔", "阿拉伯联合酋长国", "阿富汗", "安提瓜和巴布达", "安圭拉",
  "阿尔巴尼亚", "亚美尼亚", "库拉索", "安哥拉", "阿根廷", "奥地利",
  "澳大利亚", "巴西", "比利时", "加拿大", "瑞士", "智利", "中国",
  "哥伦比亚", "捷克", "德国", "丹麦", "埃及", "西班牙", "法国",
  "英国", "印度", "印度尼西亚", "意大利", "日本", "韩国", "墨西哥",
  "马来西亚", "荷兰", "尼日利亚", "菲律宾", "波兰", "葡萄牙", "俄罗斯",
  "沙特阿拉伯", "瑞典", "新加坡", "泰国", "土耳其", "美国", "越南", "南非",
];

/* ------------------------------- 线索结果（mock） ------------------------------- */
const RESULTS = [
  { id: "1", name: "tesla", source: "HS Code 850760", location: "suite 120, 9201 arboretum parkway, austin, texas, 78759, united states" },
  { id: "2", name: "motorola solutions", source: "HS Code 850760", location: "500 west monroe street, chicago, illinois, 60661, united states" },
  { id: "3", name: "stanley black and decker", source: "HS Code 850760", location: "1000 stanley drive, new britain, connecticut, 06053, united states" },
  { id: "4", name: "truper", source: "HS Code 850760", location: "Mexico" },
  { id: "5", name: "vsun mobile", source: "HS Code 850760", location: "Dubai, Dubai, United Arab Emirates" },
  { id: "6", name: "rx infotech", source: "HS Code 850760", location: "New Delhi, Delhi, 110019, India" },
  { id: "7", name: "robert bosch power tools", source: "HS Code 850760", location: "Suite A, Level 9; Wawasan Open ..." },
  { id: "8", name: "technocom systems", source: "HS Code 850760", location: "India" },
  { id: "9", name: "electronica steren", source: "HS Code 850760", location: "Biologo Maxilmino Martinez No. ..." },
  { id: "10", name: "padget electronics", source: "HS Code 850760", location: "C-33, Noida Phase-II; Gautam Bu..." },
  { id: "11", name: "dell international services india pvt ltd", source: "HS Code 850760", location: "India" },
  { id: "12", name: "samsung india electronics", source: "HS Code 850760", location: "6TH FLOOR, DLF CENTRE SANSA..." },
  { id: "13", name: "byd electronics india", source: "HS Code 850760", location: "kanchipuram, tamil nadu, india" },
  { id: "14", name: "samsung sdi energy malaysia sdn bhd", source: "HS Code 850760", location: "Chamber E, Lian Seng Courts; No..." },
  { id: "15", name: "navitasys india", source: "HS Code 850760", location: "Plot No. 32; Sector 5, Rewari, Har..." },
  { id: "16", name: "samsung electronics viet nam", source: "HS Code 850760", location: "Vietnam" },
  { id: "17", name: "apple india", source: "HS Code 850760", location: "19th FLOOR; Concorde Tower C, ..." },
  { id: "18", name: "neelkanth crockery emporium", source: "HS Code 850760", location: "India" },
  { id: "19", name: "apple malaysia", source: "HS Code 850760", location: "Level 21, Suite 21.01; The Garden..." },
  { id: "20", name: "samsung sdi viet nam", source: "HS Code 850760", location: "Vietnam" },
];

/* ------------------------------- 国家选择器 ------------------------------- */
function CountryFilter({
  countries,
  setCountries,
  countryKw,
  setCountryKw,
  filteredCountries,
  countryLabel,
  children,
}: {
  countries: string[];
  setCountries: React.Dispatch<React.SetStateAction<string[]>>;
  countryKw: string;
  setCountryKw: (v: string) => void;
  filteredCountries: string[];
  countryLabel: string;
  children: React.ReactNode;
}) {
  const toggleCountry = (c: string) =>
    setCountries((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-[280px] p-0">
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
  );
}

/* ============================== 页面 ============================== */
function SearchResultsPage() {
  const navigate = useNavigate();
  const [kw, setKw] = useState("850760");
  const [countries, setCountries] = useState<string[]>([]);
  const [countryKw, setCountryKw] = useState("");
  const [importer, setImporter] = useState(true);
  const [exporter, setExporter] = useState(true);

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

  const go = () => {
    if (!kw.trim()) {
      toast.error("请输入搜索关键词");
      return;
    }
    if (!importer && !exporter) {
      toast.error("请至少选择进口商或出口商");
      return;
    }
    toast.success("搜索已提交");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      go();
    }
  };

  return (
    <div className="min-h-[calc(100vh-0px)] bg-[#f6f8fb] p-4 sm:p-6 lg:p-8">
      <div className="w-full">
        {/* 面包屑 */}
        <div className="text-sm text-muted-foreground mb-5">
          客户发现 / <span className="text-foreground/80">商机线索</span>
        </div>

        {/* 顶部横幅 */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-500 to-sky-500 px-6 py-5 text-white shadow-md mb-6">
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <Lightbulb className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">商机线索</h1>
              <p className="text-sm text-white/90">基于全球贸易数据，精准定位潜在客户</p>
            </div>
          </div>
          <div className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 opacity-20">
            <Globe2 className="h-24 w-24 text-white" />
          </div>
        </div>

        {/* 搜索栏 */}
        <div className="rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200 mb-4">
          <div className="flex items-center gap-2 h-14 px-3">
            <Search className="h-5 w-5 text-muted-foreground shrink-0" />
            <Input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="商品关键词或HS Code、公司名称等"
              className="border-0 shadow-none focus-visible:ring-0 text-base h-12 px-2 placeholder:text-muted-foreground/70 flex-1 min-w-0"
            />
            {kw && (
              <button
                onClick={() => setKw("")}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/60 shrink-0"
                aria-label="清空"
              >
                <XIcon className="h-4 w-4" />
              </button>
            )}

            <div className="hidden md:flex items-center shrink-0">
              <div className="h-6 w-px bg-slate-200 mx-1" />
              <CountryFilter
                countries={countries}
                setCountries={setCountries}
                countryKw={countryKw}
                setCountryKw={setCountryKw}
                filteredCountries={filteredCountries}
                countryLabel={countryLabel}
              >
                <button className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors max-w-[160px]">
                  <Globe2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{countryLabel}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </CountryFilter>

              <div className="h-6 w-px bg-slate-200 mx-1" />

              <label className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap">
                <Checkbox
                  checked={importer}
                  onCheckedChange={(v) => setImporter(v === true)}
                />
                进口商
              </label>
              <label className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap">
                <Checkbox
                  checked={exporter}
                  onCheckedChange={(v) => setExporter(v === true)}
                />
                出口商
              </label>

              <div className="h-6 w-px bg-slate-200 mx-1" />
            </div>

            <button
              onClick={go}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 shrink-0"
            >
              <Search className="h-4 w-4" />
              搜索
            </button>
          </div>
        </div>

        {/* 结果提示 */}
        <div className="rounded-lg bg-cyan-50 px-4 py-3 text-sm text-cyan-700 mb-3">
          以下结果基于 HS Code {kw} 查询得到。
        </div>

        {/* 结果统计 */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-slate-600">
            查询完成，找到 <span className="font-semibold text-slate-900">{RESULTS.length}</span> 条线索
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-white text-slate-600 ring-1 ring-slate-200">
              进口商
            </Badge>
            <Badge variant="secondary" className="bg-white text-slate-600 ring-1 ring-slate-200">
              出口商
            </Badge>
          </div>
        </div>

        {/* 结果卡片网格 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {RESULTS.map((item) => (
            <Card
              key={item.id}
              className="relative overflow-hidden rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 hover:shadow-md hover:ring-primary/20 transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
                  <FileText className="h-5 w-5" />
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.success("已收藏");
                  }}
                  className="rounded-full p-1.5 text-slate-300 hover:text-amber-400 hover:bg-amber-50 transition-colors"
                  aria-label="收藏"
                >
                  <Star className="h-5 w-5" />
                </button>
              </div>

              <h3 className="text-base font-semibold text-slate-900 truncate mb-2 group-hover:text-primary transition-colors">
                {item.name}
              </h3>

              <div className="space-y-2">
                <div className="flex items-start gap-2 text-sm text-slate-600">
                  <FileText className="h-4 w-4 shrink-0 text-cyan-500 mt-0.5" />
                  <span className="truncate">线索来源：{item.source}</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-slate-500">
                  <MapPin className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
                  <span className="line-clamp-2">{item.location}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
