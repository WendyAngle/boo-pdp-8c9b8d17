import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ShoppingBag, Facebook, Music2, Minus, Plus, CheckCircle2, Wallet, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useSocialFriends } from "@/lib/social-friends";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCreditBalance, spendCredits } from "@/lib/credits-balance";
import {
  chargeSocialAccountPurchase,
  COST_SOCIAL_ACCOUNT_PURCHASE,
} from "@/lib/credits-ledger";
import {
  addPurchasedAccounts,
  updateAccountStatus,
  useSocialAccounts,
  type SocialAccount,
} from "@/data/social-accounts";
import {
  computeHealth,
  poolAverageHealth,
  healthToneClass,
} from "@/lib/social-account-health";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/outreach/social/accounts")({
  head: () => ({
    meta: [
      { title: "社媒账号购买 · 出海大数据平台" },
      { name: "description", content: "购买 Facebook / TikTok 触达账号，用于社媒搜索加友与私信触达。" },
      { property: "og:title", content: "社媒账号购买" },
      { property: "og:description", content: "1000 积分 / 账号，即时到账。" },
    ],
  }),
  component: SocialAccountsPage,
});

const MAX_QTY = 50;

function SocialAccountsPage() {
  const balance = useCreditBalance();
  const accounts = useSocialAccounts();
  const friends = useSocialFriends();
  const friendCountByAccount = useMemo(() => {
    const m = new Map<string, number>();
    friends.forEach((f) => m.set(f.accountId, (m.get(f.accountId) ?? 0) + 1));
    return m;
  }, [friends]);
  const [confirm, setConfirm] = useState<{ platform: "Facebook" | "TikTok"; qty: number } | null>(null);

  const fbCount = useMemo(() => accounts.filter((a) => a.platform === "Facebook").length, [accounts]);
  const ttCount = useMemo(() => accounts.filter((a) => a.platform === "TikTok").length, [accounts]);

  function doPurchase(platform: "Facebook" | "TikTok", qty: number) {
    const total = qty * COST_SOCIAL_ACCOUNT_PURCHASE;
    if (balance.balance < total) {
      toast.error("积分不足，请先充值");
      return;
    }
    spendCredits(total);
    chargeSocialAccountPurchase({ platform, quantity: qty });
    const added = addPurchasedAccounts(platform, qty);
    toast.success(`已购买 ${qty} 个 ${platform} 账号，共扣 ${total.toLocaleString()} 积分`, {
      description: `${added.map((a) => a.handle).slice(0, 3).join("、")}${added.length > 3 ? ` 等 ${added.length} 个` : ""} 已入池`,
    });
    setConfirm(null);
  }

  return (
    <div className="p-6 space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <ShoppingBag className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">社媒账号购买</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              选择平台与数量即可下单，1 个账号消耗 1000 积分。账号将立即入池，可用于「社媒搜索加友」「社媒私信触达」。
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            当前积分：<span className="font-semibold text-foreground tabular-nums">{balance.balance.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BuyCard
          platform="Facebook"
          tone="sky"
          Icon={Facebook}
          owned={fbCount}
          balance={balance.balance}
          onBuy={(qty) => setConfirm({ platform: "Facebook", qty })}
        />
        <BuyCard
          platform="TikTok"
          tone="rose"
          Icon={Music2}
          owned={ttCount}
          balance={balance.balance}
          onBuy={(qty) => setConfirm({ platform: "TikTok", qty })}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-3.5 border-b flex items-center justify-between">
          <div className="text-sm font-semibold">我的社媒账号</div>
          <div className="text-xs text-muted-foreground">共 {accounts.length} 个</div>
        </div>
        {accounts.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">尚无社媒账号，请先购买。</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>平台</TableHead>
                <TableHead>账号</TableHead>
                <TableHead>显示名</TableHead>
                <TableHead className="w-[110px]">状态</TableHead>
                <TableHead className="w-[130px]">名下好友</TableHead>
                <TableHead className="w-[130px]">今日加友</TableHead>
                <TableHead className="w-[130px]">今日私信</TableHead>
                <TableHead className="w-[140px]">购买时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <AccountRow key={a.id} account={a} friendCount={friendCountByAccount.get(a.id) ?? 0} />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认购买</AlertDialogTitle>
            <AlertDialogDescription>
              将购买 <span className="font-semibold text-foreground">{confirm?.qty}</span> 个{" "}
              <span className="font-semibold text-foreground">{confirm?.platform}</span> 账号，
              共扣除{" "}
              <span className="font-semibold text-rose-600 tabular-nums">
                {((confirm?.qty ?? 0) * COST_SOCIAL_ACCOUNT_PURCHASE).toLocaleString()}
              </span>{" "}
              积分。账号绑定当前账户，不可转让 / 退款。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && doPurchase(confirm.platform, confirm.qty)}>
              确认购买
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BuyCard({
  platform,
  tone,
  Icon,
  owned,
  balance,
  onBuy,
}: {
  platform: "Facebook" | "TikTok";
  tone: "sky" | "rose";
  Icon: typeof Facebook;
  owned: number;
  balance: number;
  onBuy: (qty: number) => void;
}) {
  const [qty, setQty] = useState(1);
  const total = qty * COST_SOCIAL_ACCOUNT_PURCHASE;
  const afford = balance >= total;
  const tones =
    tone === "sky"
      ? "from-sky-500/10 via-sky-500/5 to-transparent border-sky-200 text-sky-700"
      : "from-rose-500/10 via-rose-500/5 to-transparent border-rose-200 text-rose-700";

  return (
    <Card className={cn("overflow-hidden border bg-gradient-to-br", tones)}>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <span className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1",
            tone === "sky" ? "bg-sky-50 ring-sky-200" : "bg-rose-50 ring-rose-200",
          )}>
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <div className="font-semibold text-foreground">{platform}</div>
            <div className="text-xs text-muted-foreground">已拥有 {owned} 个 · 1000 积分 / 账号</div>
          </div>
        </div>

        <div className="rounded-xl bg-background/70 backdrop-blur border p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">购买数量</div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setQty((n) => Math.max(1, n - 1))}
                disabled={qty <= 1}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <input
                type="number"
                value={qty}
                min={1}
                max={MAX_QTY}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(MAX_QTY, Number(e.target.value) || 1));
                  setQty(v);
                }}
                className="h-7 w-14 text-center border rounded-md tabular-nums text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setQty((n) => Math.min(MAX_QTY, n + 1))}
                disabled={qty >= MAX_QTY}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">合计</span>
            <span className="font-semibold text-rose-600 tabular-nums text-sm">
              -{total.toLocaleString()} 积分
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">扣费后余额</span>
            <span
              className={cn(
                "tabular-nums",
                afford ? "text-foreground" : "text-rose-600 font-semibold",
              )}
            >
              {afford
                ? (balance - total).toLocaleString()
                : `不足 ${(total - balance).toLocaleString()}`}
            </span>
          </div>
        </div>

        <Button
          type="button"
          className="w-full"
          onClick={() => onBuy(qty)}
          disabled={!afford || qty < 1}
        >
          {afford ? "立即购买" : "积分不足"}
        </Button>
        <div className="text-[11px] text-muted-foreground text-center">
          单次上限 {MAX_QTY} 个 · 下单即入池，账号绑定当前账户
        </div>
      </div>
    </Card>
  );
}

function AccountRow({ account, friendCount }: { account: SocialAccount; friendCount: number }) {
  const statusTone: Record<SocialAccount["status"], string> = {
    正常: "bg-emerald-50 text-emerald-700 border-emerald-200",
    养号中: "bg-amber-50 text-amber-700 border-amber-200",
    停用: "bg-slate-100 text-slate-600 border-slate-200",
    异常: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <TableRow>
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
        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md border text-xs", statusTone[account.status])}>
          {account.status}
        </span>
      </TableCell>
      <TableCell className="text-xs tabular-nums">
        {friendCount > 0 ? (
          <Link
            to="/outreach/social/friends"
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
      <TableCell className="text-xs tabular-nums text-muted-foreground">
        {account.dailyFriendLimit != null
          ? `${account.friendSentToday ?? 0} / ${account.dailyFriendLimit}`
          : "—"}
      </TableCell>
      <TableCell className="text-xs tabular-nums text-muted-foreground">
        {account.dailyDmLimit != null
          ? `${account.dmSentToday ?? 0} / ${account.dailyDmLimit}`
          : `${account.sentToday} / ${account.dailyLimit}`}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {account.purchasedAt ? new Date(account.purchasedAt).toLocaleDateString() : "—"}
      </TableCell>
    </TableRow>
  );
}
