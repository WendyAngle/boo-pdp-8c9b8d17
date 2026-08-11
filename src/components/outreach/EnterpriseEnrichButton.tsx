import { useEffect, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { Enterprise } from "@/data/enterprises";
import {
  ENRICH_DURATION_MS,
  startEnrich,
  useEnrich,
} from "@/lib/enterprise-enrich";

/**
 * 企业数据补全入口
 * - 详情页右上角常驻按钮，统一主按钮样式
 * - 点击后直接提交采集任务，toast 提示用户约 30 秒后刷新查看
 * - 采集中按钮转为进度态；30 秒倒计时结束后自动恢复为“补全企业数据”
 */
export function EnterpriseEnrichButton({ enterprise }: { enterprise: Enterprise }) {
  const rec = useEnrich(enterprise.id);
  const running = rec?.status === "running";
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
    const ok = startEnrich(enterprise, () => {
      toast.success("数据补全完成，页面已同步更新");
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
    </>
  );
}
