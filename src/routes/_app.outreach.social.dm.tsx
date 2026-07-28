import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle, Plus, Facebook, Music2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

function DmPage() {
  const tasks = useDmTasks();
  const balance = useCreditBalance();
  const [open, setOpen] = useState(false);

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
            <Button size="sm" onClick={() => setOpen(true)}>
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
        onOpenChange={setOpen}
        balance={balance.balance}
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

// 极简敏感词（P0 占位；后续接平台敏感词表）
const SENSITIVE_WORDS = ["赌博", "色情", "毒品", "洗钱", "枪支", "porn", "casino"];

function CreateDmDialog({
  open,
  onOpenChange,
  balance,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  balance: number;
  onCreate: (payload: {
    name: string;
    platform: SocialTaskPlatform;
    template: string;
    sourceTaskId?: string;
    sendTargets: { name: string; handle: string }[];
  }) => void;
}) {
  const prosTasks = useProspectingTasks();
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<SocialTaskPlatform>("Facebook");
  const [template, setTemplate] = useState("");
  const [sourceId, setSourceId] = useState<string>("");

  const acceptedTargets = useMemo(() => {
    if (!sourceId) return [];
    const src = prosTasks.find((t) => t.id === sourceId);
    return (src?.targets ?? []).filter((t) => t.status === "accepted");
  }, [prosTasks, sourceId]);

  const cost = acceptedTargets.length * COST_SOCIAL_DM;

  const hit = SENSITIVE_WORDS.find((w) => template.toLowerCase().includes(w.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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
              <Select value={platform} onValueChange={(v) => setPlatform(v as SocialTaskPlatform)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Facebook">Facebook</SelectItem>
                  <SelectItem value="TikTok">TikTok</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">目标来源（已通过好友池）</div>
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
            <span>本次发送 {acceptedTargets.length} 条，合计</span>
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
              if (acceptedTargets.length === 0) return toast.error("所选任务尚无已通过好友");
              onCreate({
                name: name.trim(),
                platform,
                template: template.trim(),
                sourceTaskId: sourceId || undefined,
                sendTargets: acceptedTargets.map((t) => ({ name: t.name, handle: t.handle })),
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
