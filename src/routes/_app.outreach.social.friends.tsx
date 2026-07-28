import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { UserCheck, Facebook, Music2, Send, Search } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useSocialFriends, setDmPrefill } from "@/lib/social-friends";
import { useSocialAccounts } from "@/data/social-accounts";
import { useProspectingTasks } from "@/lib/social-tasks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/outreach/social/friends")({
  head: () => ({
    meta: [
      { title: "社媒好友池 · 出海大数据平台" },
      { name: "description", content: "汇总所有已通过好友的 Facebook / TikTok 目标，支持跨任务/跨账号批量私信触达。" },
      { property: "og:title", content: "社媒好友池" },
      { property: "og:description", content: "统一好友视图 · 批量私信 · 一键筛选。" },
    ],
  }),
  component: FriendsPage,
});

function FriendsPage() {
  const friends = useSocialFriends();
  const accounts = useSocialAccounts();
  const tasks = useProspectingTasks();
  const navigate = useNavigate();

  const [platform, setPlatform] = useState<"all" | "Facebook" | "TikTok">("all");
  const [accountId, setAccountId] = useState<string>("all");
  const [taskId, setTaskId] = useState<string>("all");
  const [kw, setKw] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 支持从「账号购买」下钻带入过滤：?accountId=xxx
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const aid = sp.get("accountId");
    const tid = sp.get("taskId");
    if (aid) setAccountId(aid);
    if (tid) setTaskId(tid);
  }, []);

  const filtered = useMemo(() => {
    return friends.filter((f) => {
      if (platform !== "all" && f.platform !== platform) return false;
      if (accountId !== "all" && f.accountId !== accountId) return false;
      if (taskId !== "all" && f.sourceTaskId !== taskId) return false;
      if (kw) {
        const s = kw.toLowerCase();
        if (!f.name.toLowerCase().includes(s) && !f.handle.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [friends, platform, accountId, taskId, kw]);

  const allSelectedOnPage = filtered.length > 0 && filtered.every((f) => selected.has(f.id));

  function toggleAll() {
    if (allSelectedOnPage) {
      const next = new Set(selected);
      filtered.forEach((f) => next.delete(f.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((f) => next.add(f.id));
      setSelected(next);
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const selectedFriends = useMemo(() => friends.filter((f) => selected.has(f.id)), [friends, selected]);
  const selectedPlatforms = new Set(selectedFriends.map((f) => f.platform));

  function handleBatchDm() {
    if (selectedFriends.length === 0) {
      toast.error("请先勾选好友");
      return;
    }
    if (selectedPlatforms.size > 1) {
      toast.error("同一私信任务需属于同一平台，请拆分选择");
      return;
    }
    setDmPrefill({
      platform: selectedFriends[0].platform,
      friends: selectedFriends.map((f) => ({ name: f.name, handle: f.handle })),
    });
    navigate({ to: "/outreach/social/dm" });
  }


  const total = friends.length;
  const fbCount = friends.filter((f) => f.platform === "Facebook").length;
  const ttCount = friends.filter((f) => f.platform === "TikTok").length;
  const todayCount = friends.filter((f) => {
    if (!f.acceptedAt) return false;
    const d = new Date(f.acceptedAt);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }).length;

  return (
    <div className="p-6 space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <UserCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">社媒好友池</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              汇总所有"已通过好友"的社媒目标，可跨任务、跨账号筛选并一键批量发起私信任务。
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="好友总数" value={total} />
        <MetricCard label="今日新增" value={todayCount} />
        <MetricCard label="Facebook" value={fbCount} icon={<Facebook className="h-3.5 w-3.5 text-sky-600" />} />
        <MetricCard label="TikTok" value={ttCount} icon={<Music2 className="h-3.5 w-3.5 text-rose-600" />} />
      </div>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-[280px]">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder="搜索姓名 / Handle"
              className="h-8"
            />
          </div>
          <Select value={platform} onValueChange={(v) => setPlatform(v as typeof platform)}>
            <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="平台" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部平台</SelectItem>
              <SelectItem value="Facebook">Facebook</SelectItem>
              <SelectItem value="TikTok">TikTok</SelectItem>
            </SelectContent>
          </Select>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="我方账号" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部我方账号</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.platform} · {a.handle}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={taskId} onValueChange={setTaskId}>
            <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="来源任务" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部来源任务</SelectItem>
              {tasks.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-2">
            <div className="text-xs text-muted-foreground">
              已选 <span className="font-semibold text-foreground tabular-nums">{selected.size}</span> / {filtered.length}
            </div>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" /> 导出 CSV
            </Button>
            <Button size="sm" onClick={handleBatchDm} disabled={selected.size === 0}>
              <Send className="h-3.5 w-3.5" /> 批量发起私信
            </Button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            暂无匹配好友。请先在{" "}
            <Link to="/outreach/social/prospecting" className="text-primary hover:underline">
              社媒搜索加友
            </Link>{" "}
            中获取"已通过好友"目标。
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox checked={allSelectedOnPage} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>好友</TableHead>
                <TableHead className="w-[100px]">平台</TableHead>
                <TableHead className="w-[200px]">我方账号</TableHead>
                <TableHead>来源任务</TableHead>
                <TableHead className="w-[160px]">通过时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((f) => {
                const acc = accounts.find((a) => a.id === f.accountId);
                return (
                  <TableRow key={f.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(f.id)}
                        onCheckedChange={() => toggleOne(f.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{f.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{f.handle}</div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-xs">
                        {f.platform === "Facebook" ? (
                          <Facebook className="h-3.5 w-3.5 text-sky-600" />
                        ) : (
                          <Music2 className="h-3.5 w-3.5 text-rose-600" />
                        )}
                        {f.platform}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {acc ? (
                        <span className="font-mono">{acc.handle}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <Link
                        to="/outreach/social/prospecting"
                        className="text-primary hover:underline"
                      >
                        {f.sourceTaskName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {f.acceptedAt ? new Date(f.acceptedAt).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
    </Card>
  );
}
