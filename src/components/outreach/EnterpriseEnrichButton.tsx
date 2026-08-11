import { useEffect, useState } from "react";
import { Sparkles, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Enterprise } from "@/data/enterprises";
import {
  ENRICH_DURATION_MS,
  ENRICH_FIELD_LABEL,
  startEnrich,
  useEnrich,
  type EnrichFieldKey,
} from "@/lib/enterprise-enrich";

function FieldChips({
  keys,
  tone,
}: {
  keys: EnrichFieldKey[];
  tone: "muted" | "ok" | "warn";
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
        : "bg-muted text-muted-foreground border-border";
  return (
    <div className="flex flex-wrap gap-1.5">
      {keys.map((k) => (
        <span key={k} className={`rounded-md border px-2 py-0.5 text-xs ${cls}`}>
          {ENRICH_FIELD_LABEL[k]}
        </span>
      ))}
    </div>
  );
}

/**
 * 企业数据补全入口
 * - 详情页右上角常驻按钮，统一主按钮样式
 * - 点击后直接提交采集任务，toast 提示用户约 30 秒后刷新查看
 * - 采集中按钮转为进度态；完成后弹出结果摘要
 */
export function EnterpriseEnrichButton({ enterprise }: { enterprise: Enterprise }) {
  const rec = useEnrich(enterprise.id);
  const running = rec?.status === "running";
  const [resultOpen, setResultOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, [running]);

  const elapsed = running && rec ? Date.now() - rec.startedAt : 0;
  const pct = Math.min(97, Math.round((elapsed / ENRICH_DURATION_MS) * 100));
  const remain = Math.max(1, Math.ceil((ENRICH_DURATION_MS - elapsed) / 1000));
  void tick;

  const launch = () => {
    const ok = startEnrich(enterprise, (r) => {
      if (r.filled.length > 0) {
        toast.success(`数据补全完成，已补充 ${r.filled.length} 项信息`, {
          description: r.filled.map((f) => ENRICH_FIELD_LABEL[f]).join("、"),
          action: { label: "查看结果", onClick: () => setResultOpen(true) },
        });
      } else {
        toast.info("采集已完成，本次未获取到新的公开信息");
      }
      setResultOpen(true);
    });
    if (ok) {
      toast.success("操作成功，数据获取中，约30s后刷新可查看最新数据");
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="default"
        className="gap-1.5"
        disabled={running}
        onClick={launch}
      >
        {running ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            采集中 · 约 {remain}s
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            补全企业数据
          </>
        )}
      </Button>

      {running && (
        <div className="w-28">
          <Progress value={pct} className="h-1.5" />
        </div>
      )}

      {/* 结果弹窗 */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              采集完成
            </DialogTitle>
            <DialogDescription>
              以下信息已自动写入企业档案，页面已同步更新。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                已补充 {rec?.filled.length ?? 0} 项
              </div>
              {rec?.filled.length ? (
                <FieldChips keys={rec.filled} tone="ok" />
              ) : (
                <div className="text-sm text-muted-foreground">本次没有新增内容</div>
              )}
            </div>
            {rec?.stillMissing.length ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  仍未采集到 {rec.stillMissing.length} 项，可稍后再次尝试
                </div>
                <FieldChips keys={rec.stillMissing} tone="warn" />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={() => setResultOpen(false)}>知道了</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
