import { ChevronLeft, ChevronRight, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  VAR_FALLBACK,
  extractVars,
  missingVarCounts,
  type VarContext,
} from "@/lib/message-vars";
import { cn } from "@/lib/utils";

/** 预览目标：多目标批量触达时用于切换查看"该目标最终收到的内容" */
export type PreviewTarget = { key: string; name: string; ctx: VarContext };

/**
 * 预览目标切换器：只影响渲染展示，不改模板、不重新调用 AI、不产生任何费用。
 */
export function PreviewTargetPicker({
  targets,
  index,
  onChange,
  className,
}: {
  targets: PreviewTarget[];
  index: number;
  onChange: (i: number) => void;
  className?: string;
}) {
  if (targets.length < 2) return null;
  const safe = Math.min(Math.max(0, index), targets.length - 1);
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <span className="text-[11px] text-muted-foreground shrink-0">预览目标</span>
      <Select value={String(safe)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="h-8 w-[170px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[280px]">
          {targets.map((t, i) => (
            <SelectItem key={t.key} value={String(i)}>
              {i + 1}. {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-7"
        disabled={safe <= 0}
        onClick={() => onChange(safe - 1)}
        aria-label="上一个目标"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-7"
        disabled={safe >= targets.length - 1}
        onClick={() => onChange(safe + 1)}
        aria-label="下一个目标"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/**
 * 多目标变量提示：说明文案中的变量会按各目标自动替换，并统计缺值情况。
 * 单目标时不展示（保持原有"成品文案"体验）。
 */
export function VarUsageHint({
  template,
  targets,
  className,
}: {
  template: string;
  targets: PreviewTarget[];
  className?: string;
}) {
  if (targets.length < 2) return null;
  const used = extractVars(template).filter(
    (v) => v !== "我的公司" && v !== "我的姓名",
  );
  const missing = missingVarCounts(template, targets.map((t) => t.ctx)).filter(
    (m) => m.variable !== "我的公司" && m.variable !== "我的姓名",
  );

  return (
    <div className={cn("space-y-1 text-[11px]", className)}>
      <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
        <Users className="h-3 w-3" />
        共 {targets.length} 个目标，
        {used.length > 0 ? (
          <>
            以下变量发送时按各目标自动替换：
            {used.map((v) => (
              <span
                key={v}
                className="rounded bg-primary/10 px-1 py-0.5 font-mono text-primary"
              >
                {`{${v}}`}
              </span>
            ))}
          </>
        ) : (
          <span className="text-amber-600">
            当前文案未使用目标变量，所有目标将收到完全相同的内容
          </span>
        )}
      </div>
      {missing.length > 0 && (
        <div className="text-amber-600">
          {missing
            .map(
              (m) =>
                `${m.count} 个目标缺少「${m.variable}」，将${
                  VAR_FALLBACK[m.variable]
                    ? `以「${VAR_FALLBACK[m.variable]}」代替`
                    : "自动省略该处表述"
                }`,
            )
            .join("；")}
        </div>
      )}
    </div>
  );
}
