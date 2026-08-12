import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Languages, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGES, langByCode } from "@/lib/lang-detect";
import { translateMessage } from "@/lib/api/ai-translate.functions";
import { renderTemplate, type VarContext } from "@/lib/message-vars";


/** 目标语言候选（中文为原文，故排除） */
export const TARGET_LANGS = LANGUAGES.filter((l) => l.code !== "zh");

/** 译文兜底清理：AI 有时会把公司名等内容用 {} 包住，去掉花括号只保留内容 */
function unwrapBraces(text: string): string {
  return text
    .replace(/[{｛]\s*([^{}｛｝\n]{0,120}?)\s*[}｝]/g, "$1")
    .replace(/[ \t]{2,}/g, " ");
}

/** 模板模式：翻译前把变量换成安全记号，翻译后还原，避免模型改写/丢失花括号 */
const PROTECT_RE = /\{(企业名|联系人名|行业|城市|我的公司|我的姓名)\}/g;
function protectVars(s: string): { text: string; map: string[] } {
  const map: string[] = [];
  const text = s.replace(PROTECT_RE, (m) => {
    map.push(m);
    return `[[V${map.length - 1}]]`;
  });
  return { text, map };
}
function restoreVars(s: string, map: string[]): string {
  return s.replace(/\[\[\s*V\s*(\d+)\s*\]\]/gi, (_m, i: string) => map[Number(i)] ?? "");
}



/**
 * 「目标语言文案」板块（与 触达任务-新建社媒触达任务 弹窗一致）：
 * 中文原文 → 选择目标语言 → 一键翻译 → 译文即实际发送内容（可手动修改）。
 */
export function TargetLangSection({
  source,
  sourceSubject,
  lang,
  onLangChange,
  value,
  onChange,
  subjectValue,
  onSubjectChange,
  rows = 6,
  kindLabel = "文案",
  className,
  bare = false,
  keepVars = false,
  previewCtx,
  previewLabel,
  headerExtra,
}: {
  /** 中文原文正文 */
  source: string;
  /** 中文原文主题（邮件） */
  sourceSubject?: string;
  lang: string;
  onLangChange: (v: string) => void;
  value: string;
  onChange: (v: string) => void;
  subjectValue?: string;
  onSubjectChange?: (v: string) => void;
  rows?: number;
  kindLabel?: string;
  className?: string;
  /** 融入外层统一区域：去掉自身边框与背景 */
  bare?: boolean;
  /** 模板模式（多目标）：保留 {变量} 不做去花括号处理，翻译时保护变量 */
  keepVars?: boolean;
  /** 模板模式下用于渲染「该目标最终收到的内容」 */
  previewCtx?: VarContext;
  previewLabel?: string;
  /** 标题右侧附加内容（如预览目标切换器） */
  headerExtra?: ReactNode;
}) {

  const callTranslate = useServerFn(translateMessage);
  const [loading, setLoading] = useState(false);
  /** 译文对应的原文快照，用于「原文已修改，建议重新翻译」提示 */
  const [snapshot, setSnapshot] = useState("");
  const hasSubject = typeof subjectValue === "string" && !!onSubjectChange;
  const opt = langByCode(lang);

  // 原文清空时同步清空译文
  useEffect(() => {
    if (!source.trim() && (value || subjectValue)) {
      onChange("");
      onSubjectChange?.("");
      setSnapshot("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const stale =
    !!value.trim() && snapshot.trim() !== `${sourceSubject ?? ""}\u0000${source}`.trim();

  async function translate(code = lang) {
    const src = source.trim();
    if (!src) return toast.error("请先生成或输入中文内容");
    const target = langByCode(code);
    if (!target) return;
    setLoading(true);
    const bodyProt = keepVars ? protectVars(src) : { text: src, map: [] as string[] };
    const rawSubject = (sourceSubject ?? "").trim();
    const subjProt = keepVars
      ? protectVars(rawSubject)
      : { text: rawSubject, map: [] as string[] };
    try {
      const jobs: Promise<{ content: string }>[] = [
        callTranslate({
          data: {
            text: bodyProt.text,
            targetLanguageName: target.en,
            sourceLanguageName: "Chinese (Simplified)",
            tone: "friendly",
          },
        }),
      ];
      if (hasSubject && rawSubject) {
        jobs.push(
          callTranslate({
            data: {
              text: subjProt.text,
              targetLanguageName: target.en,
              sourceLanguageName: "Chinese (Simplified)",
              tone: "friendly",
            },
          }),
        );
      }
      const [body, subj] = await Promise.all(jobs);
      const clean = (t: string, map: string[]) =>
        keepVars ? restoreVars(t, map) : unwrapBraces(t);
      onChange(clean(body?.content ?? "", bodyProt.map));
      if (hasSubject) onSubjectChange?.(clean(subj?.content ?? "", subjProt.map));
      setSnapshot(`${sourceSubject ?? ""}\u0000${src}`);
      toast.success(`已翻译为${target.zh}（免费）`);

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("翻译失败", { description: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className={`space-y-2 p-3 ${
        bare ? "bg-primary/[0.03]" : "rounded-md border border-primary/25 bg-primary/[0.03]"
      } ${className ?? ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium flex items-center gap-2">
          <Languages className="h-4 w-4 text-primary" />
          {bare ? "实际发送内容" : `目标语言${kindLabel}`}
          {!bare && (
            <Badge variant="outline" className="font-normal text-[10px]">
              实际发送内容
            </Badge>
          )}
        </Label>
        <div className="flex items-center gap-2">
          {canPreview && (
            <div className="flex rounded-md border p-0.5">
              {(["edit", "preview"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                    mode === m
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "edit" ? "编辑" : "预览成品"}
                </button>
              ))}
            </div>
          )}
          <Select
            value={lang}
            onValueChange={(v) => {
              onLangChange(v);
              if (source.trim()) void translate(v);
            }}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              {TARGET_LANGS.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.flag} {l.zh}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            disabled={loading || !source.trim()}
            onClick={() => void translate()}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Languages className="h-3.5 w-3.5 text-primary" />
            )}
            {value ? "重新翻译" : "翻译"}
            <span className="text-[11px] text-emerald-600">免费</span>
          </Button>
        </div>
      </div>

      {previewing && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {previewLabel ? `${previewLabel} 将收到` : "该目标将收到"}
          </span>
          {headerExtra}
        </div>
      )}

      {hasSubject &&
        (previewing ? (
          <div className="text-xs">
            <span className="text-muted-foreground">主题：</span>
            <span className="font-medium">
              {renderTemplate(
                (subjectValue ?? "").trim() || (sourceSubject ?? ""),
                previewCtx!,
              ) || "—"}
            </span>
          </div>
        ) : (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">主题（译文）</Label>
            <Input
              value={subjectValue}
              onChange={(e) => onSubjectChange?.(e.target.value)}
              placeholder={`翻译后此处展示${opt?.zh ?? "目标语言"}主题，可手动修改`}
            />
          </div>
        ))}

      {previewing ? (
        <div
          className="rounded-md border bg-background/70 p-2 text-xs whitespace-pre-wrap leading-relaxed overflow-y-auto"
          style={{ minHeight: rows * 22 }}
        >
          {renderTemplate(value.trim() || source, previewCtx!) || (
            <span className="text-muted-foreground">（暂无内容）</span>
          )}
        </div>
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={`选择目标语言后点击「翻译」，此处展示${
            opt?.zh ?? "目标语言"
          }${kindLabel}，可手动修改`}
        />
      )}
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">
          {value.trim()
            ? `将以${opt?.zh ?? ""}发送 · ${value.trim().length} 字`
            : "未翻译时，将直接发送中文原文"}
        </span>
        {stale && (
          <span className="text-amber-600">中文原文已修改，建议重新翻译</span>
        )}
      </div>

    </section>

  );
}
