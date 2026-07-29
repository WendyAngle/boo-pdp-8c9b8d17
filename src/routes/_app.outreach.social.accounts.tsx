import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShoppingBag,
  Facebook,
  Music2,
  Minus,
  Plus,
  CheckCircle2,
  Wallet,
  UserCheck,
  Clock,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useSocialFriends } from "@/lib/social-friends";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  addWorkdays,
  regionLabel,
  REGION_OPTIONS,
  simulateDeliver,
  updateAccountStatus,
  useSocialAccounts,
  workdaysUntil,
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
      { property: "og:description", content: "1000 积分 / 账号，7 个工作日交付。" },
    ],
  }),
  component: SocialAccountsPage,
});

const MAX_QTY = 50;

interface PurchaseIntent {
  platform: "Facebook" | "TikTok";
  qty: number;
  ownerRegion: string;
  proxyRegion: string;
}

function SocialAccountsPage() {
  const balance = useCreditBalance();
  const accounts = useSocialAccounts();
  const friends = useSocialFriends();
  const friendCountByAccount = useMemo(() => {
    const m = new Map<string, number>();
    friends.forEach((f) => m.set(f.accountId, (m.get(f.accountId) ?? 0) + 1));
    return m;
  }, [friends]);
  const [confirm, setConfirm] = useState<PurchaseIntent | null>(null);

  const fbCount = useMemo(() => accounts.filter((a) => a.platform === "Facebook").length, [accounts]);
  const ttCount = useMemo(() => accounts.filter((a) => a.platform === "TikTok").length, [accounts]);
  const pendingCount = useMemo(() => accounts.filter((a) => a.status === "备货中").length, [accounts]);

  function doPurchase(intent: PurchaseIntent) {
    const total = intent.qty * COST_SOCIAL_ACCOUNT_PURCHASE;
    if (balance.balance < total) {
      toast.error("积分不足，请先充值");
      return;
    }
    spendCredits(total);
    chargeSocialAccountPurchase({ platform: intent.platform, quantity: intent.qty });
    addPurchasedAccounts(intent.platform, intent.qty, {
      ownerRegion: intent.ownerRegion,
      proxyRegion: intent.proxyRegion,
    });
    const deliverAt = addWorkdays(new Date(), 7);
    toast.success(`已下单 ${intent.qty} 个 ${intent.platform} 账号，共扣 ${total.toLocaleString()} 积分`, {
      description: `账号所属 ${regionLabel(intent.ownerRegion)} · 代理 ${regionLabel(intent.proxyRegion)}，预计 ${deliverAt.toLocaleDateString()} 交付`,
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
              1 个账号 1000 积分，下单后需为账号配置设备与代理，预计 <b>7 个工作日</b>交付；下单时请指定「账号所属地区」与「代理国家/地区」。
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
          onBuy={(intent) => setConfirm(intent)}
        />
        <BuyCard
          platform="TikTok"
          tone="rose"
          Icon={Music2}
          owned={ttCount}
          balance={balance.balance}
          onBuy={(intent) => setConfirm(intent)}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-3.5 border-b flex items-center justify-between">
          <div className="text-sm font-semibold">我的社媒账号</div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {accounts.length > 0 && (
              <span>
                池平均健康度：
                <span className="font-semibold text-foreground tabular-nums">
                  {poolAverageHealth(accounts)}
                </span>
                <span> / 100</span>
              </span>
            )}
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-600">
                <Clock className="h-3 w-3" /> 备货中 {pendingCount}
              </span>
            )}
            <span>共 {accounts.length} 个</span>
          </div>
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
                <TableHead className="w-[110px]">所属地区</TableHead>
                <TableHead className="w-[110px]">代理地区</TableHead>
                <TableHead className="w-[130px]">健康度</TableHead>
                <TableHead className="w-[100px]">名下好友</TableHead>
                <TableHead className="w-[110px]">今日加友</TableHead>
                <TableHead className="w-[110px]">今日私信</TableHead>
                <TableHead className="w-[130px]">交付 / 购买</TableHead>
                <TableHead className="w-[140px]">操作</TableHead>
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
            <AlertDialogTitle>确认下单</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  将下单 <span className="font-semibold text-foreground">{confirm?.qty}</span> 个{" "}
                  <span className="font-semibold text-foreground">{confirm?.platform}</span> 账号，共扣除{" "}
                  <span className="font-semibold text-rose-600 tabular-nums">
                    {((confirm?.qty ?? 0) * COST_SOCIAL_ACCOUNT_PURCHASE).toLocaleString()}
                  </span>{" "}
                  积分。
                </div>
                <div className="text-xs text-muted-foreground">
                  账号所属地区：<b className="text-foreground">{regionLabel(confirm?.ownerRegion)}</b>
                  {" · "}代理国家/地区：<b className="text-foreground">{regionLabel(confirm?.proxyRegion)}</b>
                </div>
                <div className="text-xs text-muted-foreground">
                  预计交付时间：<b className="text-foreground">{addWorkdays(new Date(), 7).toLocaleDateString()}</b>（7 个工作日）
                </div>
                <div className="text-xs text-amber-600">
                  备货期间账号不可用于触达；若备货失败将全额退还积分。
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && doPurchase(confirm)}>
              确认下单
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
  onBuy: (intent: PurchaseIntent) => void;
}) {
  const [qty, setQty] = useState(1);
  const [ownerRegion, setOwnerRegion] = useState<string>("US");
  const [proxyRegion, setProxyRegion] = useState<string>("US");
  const total = qty * COST_SOCIAL_ACCOUNT_PURCHASE;
  const afford = balance >= total;
  const deliverDate = useMemo(() => addWorkdays(new Date(), 7), []);
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
            <div className="text-xs text-muted-foreground">已拥有 {owned} 个 · 1000 积分 / 账号 · 7 个工作日交付</div>
          </div>
        </div>

        <div className="rounded-xl bg-background/70 backdrop-blur border p-3.5 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">账号所属地区</div>
              <Select value={ownerRegion} onValueChange={setOwnerRegion}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {REGION_OPTIONS.map((r) => (
                    <SelectItem key={r.code} value={r.code} className="text-xs">{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">代理国家/地区</div>
              <Select value={proxyRegion} onValueChange={setProxyRegion}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {REGION_OPTIONS.map((r) => (
                    <SelectItem key={r.code} value={r.code} className="text-xs">{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

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
          <div className="flex items-center justify-between text-xs pt-1 border-t">
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> 预计交付
            </span>
            <span className="text-foreground tabular-nums">
              {deliverDate.toLocaleDateString()}
            </span>
          </div>
        </div>

        <Button
          type="button"
          className="w-full"
          onClick={() => onBuy({ platform, qty, ownerRegion, proxyRegion })}
          disabled={!afford || qty < 1}
        >
          {afford ? "立即下单" : "积分不足"}
        </Button>
        <div className="text-[11px] text-muted-foreground text-center">
          单次上限 {MAX_QTY} 个 · 备货期间账号不可用，若失败将退还积分
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
    备货中: "bg-sky-50 text-sky-700 border-sky-200",
  };
  const isPending = account.status === "备货中";
  const remainingDays = isPending && account.expectedDeliveryAt
    ? workdaysUntil(account.expectedDeliveryAt)
    : 0;

  return (
    <TableRow className={cn(isPending && "bg-sky-50/30")}>
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
      <TableCell className="font-mono text-xs">
        {isPending ? <span className="text-muted-foreground">备货中…</span> : account.handle}
      </TableCell>
      <TableCell className="text-sm">
        {isPending ? <span className="text-muted-foreground">—</span> : account.displayName}
      </TableCell>
      <TableCell>
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs", statusTone[account.status])}>
          {isPending && <Clock className="h-3 w-3" />}
          {account.status}
        </span>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{regionLabel(account.ownerRegion)}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{regionLabel(account.proxyRegion)}</TableCell>
      <TableCell className="text-xs">
        {isPending ? (
          <span className="text-muted-foreground">—</span>
        ) : (() => {
          const h = computeHealth(account);
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border tabular-nums",
                healthToneClass(h.band),
              )}
              title={h.reasons.length ? h.reasons.join(" · ") : "无扣分项"}
            >
              {h.score}
              <span className="opacity-70">· {h.band}</span>
            </span>
          );
        })()}
      </TableCell>
      <TableCell className="text-xs tabular-nums">
        {isPending ? (
          <span className="text-muted-foreground">—</span>
        ) : friendCount > 0 ? (
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
      <TableCell className="text-xs tabular-nums text-muted-foreground">
        {isPending
          ? "—"
          : account.dailyFriendLimit != null
          ? `${account.friendSentToday ?? 0} / ${account.dailyFriendLimit}`
          : "—"}
      </TableCell>
      <TableCell className="text-xs tabular-nums text-muted-foreground">
        {isPending
          ? "—"
          : account.dailyDmLimit != null
          ? `${account.dmSentToday ?? 0} / ${account.dailyDmLimit}`
          : `${account.sentToday} / ${account.dailyLimit}`}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {isPending && account.expectedDeliveryAt ? (
          <span className="inline-flex flex-col leading-tight">
            <span className="text-amber-700 font-medium">
              {new Date(account.expectedDeliveryAt).toLocaleDateString()}
            </span>
            <span className="text-[11px]">还剩 {remainingDays} 个工作日</span>
          </span>
        ) : account.purchasedAt ? (
          new Date(account.purchasedAt).toLocaleDateString()
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-xs">
        {isPending ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => {
              simulateDeliver(account.id);
              toast.success("已模拟交付，账号进入养号中");
            }}
            title="演示环境：跳过 7 工作日备货直接交付"
          >
            <Zap className="h-3 w-3" />
            立即交付
          </Button>
        ) : account.status === "异常" ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              updateAccountStatus(account.id, "养号中");
              toast.success(`${account.handle} 已转入养号中`);
            }}
          >
            一键恢复
          </Button>
        ) : account.status === "养号中" ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              updateAccountStatus(account.id, "正常");
              toast.success(`${account.handle} 已启用`);
            }}
          >
            结束养号
          </Button>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
