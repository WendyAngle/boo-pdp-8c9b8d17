import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Users,
  Facebook,
  Music2,
  CheckCircle2,
  Wallet,
  UserCheck,
  Search,
  RotateCcw,
} from "lucide-react";
import { useSocialFriends } from "@/lib/social-friends";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCreditBalance } from "@/lib/credits-balance";
import {
  regionLabel,
  REGION_OPTIONS,
  useSocialAccounts,
  type SocialAccount,
} from "@/data/social-accounts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/outreach/social/accounts")({
  head: () => ({
    meta: [
      { title: "我的账号 · 出海大数据平台" },
      { name: "description", content: "查看与管理已购买的 Facebook / TikTok 触达账号。" },
      { property: "og:title", content: "我的账号" },
      { property: "og:description", content: "统一管理你的社媒触达账号。" },
    ],
  }),
  component: SocialAccountsPage,
});

type PlatformFilter = "all" | "Facebook" | "TikTok";

/** 按到期时间返回分档（用于行底色与标签） */
type ExpiryBucket = "safe" | "quarter" | "month" | "week" | "expired" | "none";
function getExpiryBucket(expiresAt?: string): ExpiryBucket {
  if (!expiresAt) return "none";
  const now = new Date();
  const exp = new Date(expiresAt);
  const days = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return "expired";
  if (days < 7) return "week";
  if (days < 30) return "month";
  if (days <= 90) return "quarter";
  return "safe";
}
const EXPIRY_ROW_TONE: Record<ExpiryBucket, string> = {
  safe: "",
  quarter: "bg-amber-50/40",
  month: "bg-orange-50/60",
  week: "bg-rose-50/70",
  expired: "bg-rose-100/70",
  none: "",
};
const EXPIRY_TEXT_TONE: Record<ExpiryBucket, string> = {
  safe: "text-muted-foreground",
  quarter: "text-amber-700",
  month: "text-orange-700 font-medium",
  week: "text-rose-700 font-semibold",
  expired: "text-rose-700 font-semibold",
  none: "text-muted-foreground",
};
const EXPIRY_LABEL: Record<ExpiryBucket, string> = {
  safe: "充足",
  quarter: "1-3 个月",
  month: "剩余 <1 个月",
  week: "剩余 <1 周",
  expired: "已过期",
  none: "",
};

function SocialAccountsPage() {
  const balance = useCreditBalance();
  const accounts = useSocialAccounts();
  const friends = useSocialFriends();
  const friendCountByAccount = useMemo(() => {
    const m = new Map<string, number>();
    friends.forEach((f) => m.set(f.accountId, (m.get(f.accountId) ?? 0) + 1));
    return m;
  }, [friends]);

  const [keyword, setKeyword] = useState("");
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [region, setRegion] = useState<string>("all");

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return accounts.filter((a) => {
      if (platform !== "all" && a.platform !== platform) return false;
      if (region !== "all" && a.ownerRegion !== region) return false;
      if (kw) {
        const hay = `${a.handle ?? ""} ${a.displayName ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [accounts, keyword, platform, region]);

  const hasFilter = keyword !== "" || platform !== "all" || region !== "all";
  const reset = () => {
    setKeyword("");
    setPlatform("all");
    setRegion("all");
  };

  const regionOptionsInUse = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach((a) => a.ownerRegion && set.add(a.ownerRegion));
    return REGION_OPTIONS.filter((r) => set.has(r.code));
  }, [accounts]);

  return (
    <div className="p-6 space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">我的账号</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              统一查看与管理已购买的社媒触达账号，支持按平台、状态、所属地区、关键字筛选。
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            当前积分：<span className="font-semibold text-foreground tabular-nums">{balance.balance.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索账号 / 显示名"
              className="h-8 w-56 pl-8 text-xs"
            />
          </div>
          <Select value={platform} onValueChange={(v) => setPlatform(v as PlatformFilter)}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="平台" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">全部平台</SelectItem>
              <SelectItem value="Facebook" className="text-xs">Facebook</SelectItem>
              <SelectItem value="TikTok" className="text-xs">TikTok</SelectItem>
            </SelectContent>
          </Select>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="所属地区" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all" className="text-xs">全部地区</SelectItem>
              {regionOptionsInUse.map((r) => (
                <SelectItem key={r.code} value={r.code} className="text-xs">{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilter && (
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={reset}>
              <RotateCcw className="h-3 w-3" /> 重置
            </Button>
          )}
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">

            <span>
              共 <b className="text-foreground tabular-nums">{filtered.length}</b>
              {filtered.length !== accounts.length && (
                <span className="text-muted-foreground"> / {accounts.length}</span>
              )}
              {" "}个
            </span>
          </div>
        </div>
        {accounts.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">尚无社媒账号。</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            没有匹配的账号，请调整筛选条件。
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>平台</TableHead>
                <TableHead>账号</TableHead>
                <TableHead>显示名</TableHead>
                <TableHead className="w-[110px]">状态</TableHead>
                <TableHead className="w-[110px]">所属地区</TableHead>
                <TableHead className="w-[100px]">好友数量</TableHead>
                <TableHead className="w-[130px]">交付时间</TableHead>
                <TableHead className="w-[130px]">到期时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <AccountRow key={a.id} account={a} friendCount={friendCountByAccount.get(a.id) ?? 0} />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function AccountRow({ account, friendCount }: { account: SocialAccount; friendCount: number }) {
  const bucket = getExpiryBucket(account.expiresAt);
  return (
    <TableRow className={cn(EXPIRY_ROW_TONE[bucket])}>
      <TableCell>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          {account.platform === "Facebook" ? (
            <Facebook className="h-3.5 w-3.5 text-sky-600" />
          ) : account.platform === "TikTok" ? (
            <Music2 className="h-3.5 w-3.5 text-rose-600" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          )}
          {account.platform}
        </span>
      </TableCell>
      <TableCell className="font-mono text-xs">{account.handle}</TableCell>
      <TableCell className="text-sm">{account.displayName}</TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
          正常
        </span>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{regionLabel(account.ownerRegion)}</TableCell>
      <TableCell className="text-xs tabular-nums">
        {friendCount > 0 ? (
          <Link
            to="/outreach/social/reach/friends"
            search={{ accountId: account.id } as never}
            className="inline-flex items-center gap-1 text-primary hover:underline"
            title="查看该账号名下的所有好友"
          >
            <UserCheck className="h-3 w-3" />
            {friendCount}
          </Link>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {account.deliveredAt ? new Date(account.deliveredAt).toLocaleDateString() : "—"}
      </TableCell>
      <TableCell className="text-xs">
        {account.expiresAt ? (
          <span className={cn("inline-flex flex-col leading-tight", EXPIRY_TEXT_TONE[bucket])}>
            <span className="tabular-nums">{new Date(account.expiresAt).toLocaleDateString()}</span>
            {bucket !== "safe" && bucket !== "none" && (
              <span className="text-[11px]">{EXPIRY_LABEL[bucket]}</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
