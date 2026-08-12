import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Users } from "lucide-react";

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
 * 多目标变量提示（轻量版）：编辑框下方一行小字，点击展开明细。
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
  const [open, setOpen] = useState(false);
  if (targets.length < 2) return null;
  const used = extractVars(template).filter(
    (v) => v !== "我的公司" && v !== "我的姓名",
  );
  const missing = missingVarCounts(template, targets.map((t) => t.ctx)).filter(
    (m) => m.variable !== "我的公司" && m.variable !== "我的姓名",
  );
  const missingTotal = missing.reduce((s, m) => s + m.count, 0);

  return (
    <div className={cn("text-[11px]", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Users className="h-3 w-3" />
        {used.length > 0 ? (
          <span>{used.length} 个变量按目标替换</span>
        ) : (
          <span className="text-amber-600">未使用变量 · 所有目标内容相同</span>
        )}
        {missingTotal > 0 && (
          <span className="text-amber-600">· {missingTotal} 处缺值将兜底</span>
        )}
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="mt-1 space-y-1 rounded-md border bg-muted/40 p-2">
          {used.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
              发送时自动替换：
              {used.map((v) => (
                <span
                  key={v}
                  className="rounded bg-primary/10 px-1 py-0.5 font-mono text-primary"
                >
                  {`{${v}}`}
                </span>
              ))}
            </div>
          )}
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
      )}
    </div>
  );
}

