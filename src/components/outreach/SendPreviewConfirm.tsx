import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  VAR_FALLBACK,
  missingVarCounts,
  renderTemplate,
} from "@/lib/message-vars";
import type { PreviewTarget } from "@/components/outreach/MultiTargetVars";

/**
 * 发送前抽样确认：多目标批量触达时，抽样展示 3 个目标的最终内容 + 缺值汇总。
 * 编辑区保持干净，风险只在最后一步拦截。
 */
export function SendPreviewConfirm({
  open,
  onOpenChange,
  targets,
  content,
  subject,
  costLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targets: PreviewTarget[];
  /** 实际发送的模板内容（含变量） */
  content: string;
  /** 邮件主题模板（可选） */
  subject?: string;
  /** 按钮上的费用文案，如 "-120" */
  costLabel?: string;
  onConfirm: () => void;
}) {
  const samples = targets.slice(0, 3);
  const missing = missingVarCounts(
    `${subject ?? ""}\n${content}`,
    targets.map((t) => t.ctx),
  ).filter((m) => m.variable !== "我的公司" && m.variable !== "我的姓名");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>发送前确认</DialogTitle>
          <DialogDescription>
            共 {targets.length} 个目标，以下为其中 {samples.length}{" "}
            个目标将收到的最终内容（变量已按各目标替换）。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {samples.map((t) => (
            <div key={t.key} className="rounded-md border p-2 space-y-1">
              <div className="text-xs font-medium">{t.name}</div>
              {subject !== undefined && (
                <div className="text-[11px]">
                  <span className="text-muted-foreground">主题：</span>
                  {renderTemplate(subject, t.ctx) || "—"}
                </div>
              )}
              <p className="text-xs whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                {renderTemplate(content, t.ctx) || (
                  <span className="text-muted-foreground">（暂无内容）</span>
                )}
              </p>
            </div>
          ))}
          {targets.length > samples.length && (
            <p className="text-[11px] text-muted-foreground">
              其余 {targets.length - samples.length} 个目标同理按各自信息替换。
            </p>
          )}
          {missing.length > 0 && (
            <p className="text-[11px] text-amber-600">
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
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            返回修改
          </Button>
          <Button
            className="bg-primary"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            <Send className="h-4 w-4" />
            确认发送{costLabel ? `（${costLabel}）` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
