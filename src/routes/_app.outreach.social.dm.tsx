import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle, Plus, Facebook, Music2, Search } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addDmTask,
  useDmTasks,
  useProspectingTasks,
  type DmTask,
  type SocialTaskPlatform,
} from "@/lib/social-tasks";
import { useCreditBalance, spendCredits } from "@/lib/credits-balance";
import { chargeSocialDm, COST_SOCIAL_DM } from "@/lib/credits-ledger";
import { useSocialFriends, consumeDmPrefill } from "@/lib/social-friends";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/outreach/social/dm")({
  head: () => ({
    meta: [
      { title: "社媒私信触达 · 出海大数据平台" },
      { name: "description", content: "对已通过好友的 Facebook / TikTok 目标批量发送私信。" },
      { property: "og:title", content: "社媒私信触达" },
      { property: "og:description", content: "首发 300 积分/次，同会话 24h 内追发免费。" },
    ],
  }),
  component: DmPage,
});

interface Prefill {
  platform: SocialTaskPlatform;
  friends: { name: string; handle: string }[];
}

function DmPage() {
  const tasks = useDmTasks();
  const balance = useCreditBalance();
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<Prefill | null>(null);

  // 好友池 → 私信页 交接
  useEffect(() => {
    const p = consumeDmPrefill();
    if (p && p.friends.length > 0) {
      setPrefill(p);
      setOpen(true);
    }
  }, []);

  return (
    <div className="p-6 space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <MessageCircle className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">社媒私信触达</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              仅可对"已通过好友"目标发送；首条私信按 {COST_SOCIAL_DM} 积分/次扣分，同会话 24h 内追发免费。
              首条问候语命中敏感词将被拦截且不扣分。
            </p>
          </div>
          <div className="ml-auto">
            <Button size="sm" onClick={() => { setPrefill(null); setOpen(true); }}>
              <Plus className="h-3.5 w-3.5" /> 新建私信任务
            </Button>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-3.5 border-b flex items-center justify-between">
          <div className="text-sm font-semibold">私信任务</div>
          <div className="text-xs text-muted-foreground">共 {tasks.length} 个</div>
        </div>
        {tasks.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            尚无私信任务。请先在{" "}
            <Link to="/outreach/social/friends" className="text-primary hover:underline">
              社媒好友池
            </Link>{" "}
            中挑选目标，或在{" "}
            <Link to="/outreach/social/prospecting" className="text-primary hover:underline">
              社媒搜索加友
            </Link>{" "}
            中获得"已通过好友"目标。
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>任务名</TableHead>
                <TableHead className="w-[100px]">平台</TableHead>
                <TableHead>模板</TableHead>
                <TableHead className="w-[110px]">状态</TableHead>
                <TableHead className="w-[160px]">发送 / 回复</TableHead>
                <TableHead className="w-[140px]">创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => (
                <DmRow key={t.id} task={t} />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <CreateDmDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setPrefill(null); }}
        balance={balance.balance}
        prefill={prefill}
        onCreate={({ name, platform, template, sourceTaskId, sendTargets }) => {
          const cost = sendTargets.length * COST_SOCIAL_DM;
          if (balance.balance < cost) return toast.error("积分不足");
          spendCredits(cost);
          const sends = sendTargets.map((tgt, i) => {
            chargeSocialDm({
              platform,
              targetName: tgt.name,
              detail: `${platform} 私信首发 · ${tgt.handle}`,
            });
            return {
              id: `s_${Date.now().toString(36)}_${i}`,
              targetName: tgt.name,
              targetHandle: tgt.handle,
              platform,
              status: "sent" as const,
              sentAt: new Date().toISOString(),
            };
          });
          addDmTask({ name, platform, template, sourceTaskId, sends });
          toast.success(`已发出 ${sendTargets.length} 条私信，扣 ${cost.toLocaleString()} 积分`);
          setOpen(false);
          setPrefill(null);
        }}
      />
    </div>
  );
}

function DmRow({ task }: { task: DmTask }) {
  const replied = task.sends.filter((s) => s.status === "replied").length;
  const statusTone: Record<DmTask["status"], string> = {
    queued: "bg-slate-100 text-slate-700 border-slate-200",
    running: "bg-emerald-50 text-emerald-700 border-emerald-200",
    completed: "bg-sky-50 text-sky-700 border-sky-200",
    paused: "bg-amber-50 text-amber-700 border-amber-200",
  };
  const statusLabel: Record<DmTask["status"], string> = {
    queued: "排队中",
    running: "执行中",
    completed: "已完成",
    paused: "已暂停",
  };
  return (
    <TableRow>
      <TableCell className="font-medium">{task.name}</TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1 text-xs">
          {task.platform === "Facebook" ? (
            <Facebook className="h-3.5 w-3.5 text-sky-600" />
          ) : (
            <Music2 className="h-3.5 w-3.5 text-rose-600" />
          )}
          {task.platform}
        </span>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-[380px] truncate">
        {task.template}
      </TableCell>
      <TableCell>
        <span className={cn("inline-flex px-2 py-0.5 rounded-md border text-xs", statusTone[task.status])}>
          {statusLabel[task.status]}
        </span>
      </TableCell>
      <TableCell className="text-xs tabular-nums text-muted-foreground">
        已发 {task.sends.length} · 已回复 {replied}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {new Date(task.createdAt).toLocaleString()}
      </TableCell>
    </TableRow>
  );
}

const SENSITIVE_WORDS = ["赌博", "色情", "毒品", "洗钱", "枪支", "porn", "casino"];

type SourceMode = "pool" | "task";

function CreateDmDialog({
  open,
  onOpenChange,
  balance,
  prefill,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  balance: number;
  prefill: Prefill | null;
  onCreate: (payload: {
    name: string;
    platform: SocialTaskPlatform;
    template: string;
    sourceTaskId?: string;
    sendTargets: { name: string; handle: string }[];
  }) => void;
}) {
  const prosTasks = useProspectingTasks();
  const friends = useSocialFriends();

  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<SocialTaskPlatform>("Facebook");
  const [template, setTemplate] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("pool");
  const [sourceId, setSourceId] = useState<string>("");
  const [poolSelected, setPoolSelected] = useState<Set<string>>(new Set()); // friend.id set
  const [poolKw, setPoolKw] = useState("");

  // 处理 prefill：从好友池跳转过来
  useEffect(() => {
    if (!open) return;
    if (prefill) {
      setSourceMode("pool");
      setPlatform(prefill.platform);
      const handles = new Set(prefill.friends.map((f) => f.handle));
      const ids = new Set(
        friends.filter((f) => f.platform === prefill.platform && handles.has(f.handle)).map((f) => f.id),
      );
      setPoolSelected(ids);
    } else {
      // 打开新弹窗时重置
      setPoolSelected(new Set());
      setSourceId("");
      setPoolKw("");
      setName("");
      setTemplate("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill]);

  const platformFriends = useMemo(
    () => friends.filter((f) => f.platform === platform),
    [friends, platform],
  );
  const poolFiltered = useMemo(() => {
    if (!poolKw) return platformFriends;
    const s = poolKw.toLowerCase();
    return platformFriends.filter(
      (f) => f.name.toLowerCase().includes(s) || f.handle.toLowerCase().includes(s),
    );
  }, [platformFriends, poolKw]);

  const acceptedFromTask = useMemo(() => {
    if (!sourceId) return [] as { name: string; handle: string }[];
    const src = prosTasks.find((t) => t.id === sourceId);
    return (src?.targets ?? [])
      .filter((t) => t.status === "accepted")
      .map((t) => ({ name: t.name, handle: t.handle }));
  }, [prosTasks, sourceId]);

  const sendTargets = useMemo<{ name: string; handle: string }[]>(() => {
    if (sourceMode === "pool") {
      return friends
        .filter((f) => poolSelected.has(f.id))
        .map((f) => ({ name: f.name, handle: f.handle }));
    }
    return acceptedFromTask;
  }, [sourceMode, friends, poolSelected, acceptedFromTask]);

  const cost = sendTargets.length * COST_SOCIAL_DM;
  const hit = SENSITIVE_WORDS.find((w) => template.toLowerCase().includes(w.toLowerCase()));

  const allChecked = poolFiltered.length > 0 && poolFiltered.every((f) => poolSelected.has(f.id));
  function toggleAllPool() {
    const next = new Set(poolSelected);
    if (allChecked) poolFiltered.forEach((f) => next.delete(f.id));
    else poolFiltered.forEach((f) => next.add(f.id));
    setPoolSelected(next);
  }
  function togglePool(id: string) {
    const next = new Set(poolSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPoolSelected(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>新建私信任务</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">任务名</div>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：首轮问询" />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">平台</div>
              <Select value={platform} onValueChange={(v) => { setPlatform(v as SocialTaskPlatform); setPoolSelected(new Set()); setSourceId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Facebook">Facebook</SelectItem>
                  <SelectItem value="TikTok">TikTok</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">目标来源</div>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSourceMode("pool")}
                className={cn(
                  "px-3 py-1.5 rounded-md border transition-colors",
                  sourceMode === "pool"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted",
                )}
              >
                好友池筛选（推荐）
              </button>
              <button
                type="button"
                onClick={() => setSourceMode("task")}
                className={cn(
                  "px-3 py-1.5 rounded-md border transition-colors",
                  sourceMode === "task"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted",
                )}
              >
                指定加友任务
              </button>
            </div>
          </div>

          {sourceMode === "pool" ? (
            <div className="rounded-md border overflow-hidden">
              <div className="px-3 py-2 border-b flex items-center gap-2 bg-muted/30">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={poolKw}
                  onChange={(e) => setPoolKw(e.target.value)}
                  placeholder={`搜索 ${platform} 好友（姓名 / Handle）`}
                  className="h-7 border-0 shadow-none focus-visible:ring-0 px-0"
                />
                <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                  已选 {poolSelected.size} · 平台内 {platformFriends.length}
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto">
                {poolFiltered.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    {platform} 尚无已通过好友。请先{" "}
                    <Link to="/outreach/social/prospecting" className="text-primary hover:underline">
                      创建搜索加友任务
                    </Link>
                    。
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr className="text-left">
                        <th className="px-3 py-1.5 w-8">
                          <Checkbox checked={allChecked} onCheckedChange={toggleAllPool} />
                        </th>
                        <th className="px-2 py-1.5">好友</th>
                        <th className="px-2 py-1.5 w-40">来源任务</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poolFiltered.map((f) => (
                        <tr key={f.id} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-1.5">
                            <Checkbox
                              checked={poolSelected.has(f.id)}
                              onCheckedChange={() => togglePool(f.id)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="font-medium">{f.name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{f.handle}</div>
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground truncate">{f.sourceTaskName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">加友任务（自动取该任务全部已通过好友）</div>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger><SelectValue placeholder="选择一个搜索加友任务" /></SelectTrigger>
                <SelectContent>
                  {prosTasks.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">尚无搜索任务</div>
                  )}
                  {prosTasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · 已通过 {t.targets.filter((x) => x.status === "accepted").length}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">
              私信模板（支持变量 {"{联系人名}"} {"{我的公司}"}）
            </div>
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={4}
              placeholder="Hi {联系人名}, 感谢通过好友请求。{我的公司} 主营 …"
            />
            {hit && (
              <div className="text-xs text-rose-600">
                命中敏感词 "{hit}"，请修改后再发送（否则将被拦截且不扣分）。
              </div>
            )}
          </div>
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs flex items-center justify-between">
            <span>本次发送 {sendTargets.length} 条，合计</span>
            <span className="font-semibold tabular-nums text-rose-600">
              -{cost.toLocaleString()}
            </span>
          </div>
          {balance < cost && (
            <div className="text-xs text-rose-600">
              当前余额 {balance.toLocaleString()}，尚缺 {(cost - balance).toLocaleString()} 积分。
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            disabled={!!hit}
            onClick={() => {
              if (!name.trim()) return toast.error("请填写任务名");
              if (!template.trim()) return toast.error("请填写私信模板");
              if (sendTargets.length === 0) return toast.error("请选择至少 1 位好友");
              onCreate({
                name: name.trim(),
                platform,
                template: template.trim(),
                sourceTaskId: sourceMode === "task" ? (sourceId || undefined) : undefined,
                sendTargets,
              });
            }}
          >
            立即发送
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
