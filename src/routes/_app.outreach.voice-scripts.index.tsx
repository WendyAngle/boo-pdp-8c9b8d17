import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ChevronRight,
  Plus,
  Search,
  Sparkles,
  Copy,
  Trash2,
  Pencil,
  Store,
  PhoneCall,
  Star,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  SCRIPT_SCENES,
  SCRIPT_INDUSTRIES,
  SCRIPT_LANGUAGES,
  createScript,
  deleteScript,
  duplicateScript,
  updateScript,
  useScripts,
  useTemplateAsScript,
  type ScriptScene,
  type VoiceScript,
} from "@/lib/voice-scripts";

export const Route = createFileRoute("/_app/outreach/voice-scripts/")({
  head: () => ({
    meta: [
      { title: "外呼话术 · 出海大数据平台" },
      { name: "description", content: "管理 AI 智能外呼话术，使用平台模板快速开始，线性步骤式编排多轮对话。" },
      { property: "og:title", content: "外呼话术 · 出海大数据平台" },
      { property: "og:description", content: "管理 AI 智能外呼话术与平台模板市场。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VoiceScriptsPage,
});

const sceneLabel = (k: ScriptScene) => SCRIPT_SCENES.find((s) => s.key === k)?.label ?? k;
const langLabel = (k: string) => SCRIPT_LANGUAGES.find((s) => s.key === k)?.label ?? k;

function StatusBadge({ s }: { s: VoiceScript["status"] }) {
  if (s === "published") return <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">已发布</Badge>;
  if (s === "draft") return <Badge variant="secondary">草稿</Badge>;
  return <Badge variant="outline">已下线</Badge>;
}

function VoiceScriptsPage() {
  const navigate = useNavigate();
  const mine = useScripts("tenant");
  const templates = useScripts("platform");
  const [kw, setKw] = useState("");
  const [industry, setIndustry] = useState("all");
  const [scene, setScene] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const filteredMine = useMemo(
    () => mine.filter((s) => (kw ? s.name.includes(kw) : true)),
    [mine, kw],
  );
  const market = useMemo(
    () =>
      templates.filter(
        (t) =>
          t.status === "published" &&
          (kw ? t.name.toLowerCase().includes(kw.toLowerCase()) : true) &&
          (industry === "all" ? true : t.industry === industry) &&
          (scene === "all" ? true : t.scene === scene),
      ),
    [templates, kw, industry, scene],
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span>出海大数据平台</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span>客户运营</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">外呼话术</span>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <PhoneCall className="h-6 w-6 text-primary" />
            外呼话术
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI 智能外呼使用的对话内容。可从平台模板市场一键复制，再按线性步骤编排多轮对话与意向判定。
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          新建话术
        </Button>
      </div>

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">我的话术</TabsTrigger>
          <TabsTrigger value="market">模板市场</TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="mt-4 space-y-4">
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="搜索话术名称" className="pl-8" />
          </div>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>话术名称</TableHead>
                  <TableHead>场景</TableHead>
                  <TableHead>语言</TableHead>
                  <TableHead className="text-right">步骤数</TableHead>
                  <TableHead className="text-right">通话数</TableHead>
                  <TableHead className="text-right">A 类意向</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>更新时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMine.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-10">
                      暂无话术，点击右上角「新建话术」或前往模板市场复制一份
                    </TableCell>
                  </TableRow>
                )}
                {filteredMine.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <Link to="/outreach/voice-scripts/$scriptId" params={{ scriptId: s.id }} className="hover:text-primary">
                        {s.name}
                      </Link>
                      {s.fromTemplateId && (
                        <Badge variant="outline" className="ml-2 text-[10px]">来自模板</Badge>
                      )}
                    </TableCell>
                    <TableCell>{sceneLabel(s.scene)}</TableCell>
                    <TableCell>{langLabel(s.language)}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.steps.length}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.usedCount.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.intentRateA != null ? `${s.intentRateA}%` : "—"}
                    </TableCell>
                    <TableCell><StatusBadge s={s.status} /></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{s.updatedAt}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="编辑"
                          onClick={() => navigate({ to: "/outreach/voice-scripts/$scriptId", params: { scriptId: s.id } })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="复制"
                          onClick={() => { duplicateScript(s.id); toast.success("已复制为新话术"); }}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            updateScript(s.id, { status: s.status === "published" ? "offline" : "published" });
                            toast.success(s.status === "published" ? "已下线" : "已发布");
                          }}
                        >
                          {s.status === "published" ? "下线" : "发布"}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="删除"
                          onClick={() => { deleteScript(s.id); toast.success("已删除"); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="market" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-xs flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="搜索模板" className="pl-8" />
            </div>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger className="w-40"><SelectValue placeholder="行业" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部行业</SelectItem>
                {SCRIPT_INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={scene} onValueChange={setScene}>
              <SelectTrigger className="w-36"><SelectValue placeholder="场景" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部场景</SelectItem>
                {SCRIPT_SCENES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
              <Store className="h-3.5 w-3.5" />
              模板由平台运营维护，复制后可自由修改，不影响原模板
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {market.length === 0 && (
              <Card className="p-8 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
                没有符合条件的模板
              </Card>
            )}
            {market.map((t) => (
              <Card key={t.id} className="p-5 space-y-3 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium flex items-center gap-1.5">
                    {t.recommended && <Star className="h-4 w-4 text-amber-500 fill-amber-500" />}
                    {t.name}
                  </div>
                  <Badge variant="secondary">{t.industry}</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <Badge variant="outline">{sceneLabel(t.scene)}</Badge>
                  <Badge variant="outline">{langLabel(t.language)}</Badge>
                  <Badge variant="outline">{t.steps.length} 个步骤</Badge>
                </div>
                <ol className="text-xs text-muted-foreground space-y-1">
                  {t.steps.slice(0, 4).map((s, i) => (
                    <li key={s.id} className="truncate">
                      {i + 1}. {s.title}
                      {s.branches.length > 0 && ` · ${s.branches.length} 个分支`}
                    </li>
                  ))}
                  {t.steps.length > 4 && <li>…</li>}
                </ol>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">已被使用 {t.usedCount} 次</span>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      const copy = useTemplateAsScript(t.id);
                      if (copy) {
                        toast.success("已复制到「我的话术」");
                        navigate({ to: "/outreach/voice-scripts/$scriptId", params: { scriptId: copy.id } });
                      }
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    使用该模板
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <CreateScriptDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function CreateScriptDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [scene, setScene] = useState<ScriptScene>("marketing");
  const [industry, setIndustry] = useState("通用");
  const [language, setLanguage] = useState("zh");

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setName(""); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建话术</DialogTitle>
          <DialogDescription>创建后进入话术设计器，按线性步骤编排开场白、AI 对话、转人工与结束语。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>话术名称 <span className="text-destructive">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：北美新客首轮触达" maxLength={60} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>场景</Label>
              <Select value={scene} onValueChange={(v) => setScene(v as ScriptScene)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCRIPT_SCENES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>行业</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCRIPT_INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>语言</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCRIPT_LANGUAGES.map((l) => <SelectItem key={l.key} value={l.key}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            disabled={!name.trim()}
            onClick={() => {
              const s = createScript({ name: name.trim(), scene, industry, language, owner: "tenant" });
              onOpenChange(false);
              setName("");
              navigate({ to: "/outreach/voice-scripts/$scriptId", params: { scriptId: s.id } });
            }}
          >
            创建并编辑
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
