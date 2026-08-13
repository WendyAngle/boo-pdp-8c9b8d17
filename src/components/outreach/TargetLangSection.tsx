import { useEffect, useState } from "react";
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
import {
  LANGUAGES,
  langByCode,
  detectLanguage,
  type DetectedLanguage,
} from "@/lib/lang-detect";
import { translateMessage } from "@/lib/api/ai-translate.functions";


/** 目标语言候选（中文为原文，故排除） */
export const TARGET_LANGS = LANGUAGES.filter((l) => l.code !== "zh");

/** 译文兜底清理：AI 有时会把公司名等内容用 {} 包住，去掉花括号只保留内容 */
function unwrapBraces(text: string): string {
  return text
    .replace(/[{｛]\s*([^{}｛｝\n]{0,120}?)\s*[}｝]/g, "$1")
    .replace(/[ \t]{2,}/g, " ");
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
}) {

  const callTranslate = useServerFn(translateMessage);
  const [loading, setLoading] = useState(false);
  /** 译文对应的原文快照，用于「原文已修改，建议重新翻译」提示 */
  const [snapshot, setSnapshot] = useState("");
  /** 自动识别到的实际发送内容语种 */
  const [detected, setDetected] = useState<DetectedLanguage | null>(null);
  const [dismissMismatch, setDismissMismatch] = useState(false);
  const hasSubject = typeof subjectValue === "string" && !!onSubjectChange;
  const opt = langByCode(lang);

  /** 内容来源：译自中文原文 / 用户直接撰写 */
  const fromTranslation = !!snapshot.trim();

  // 原文清空时，仅清空「由翻译生成」的内容；用户直接撰写的内容保留
  useEffect(() => {
    if (!source.trim() && fromTranslation && (value || subjectValue)) {
      onChange("");
      onSubjectChange?.("");
      setSnapshot("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // 实际发送内容语种自动识别（防抖）
  useEffect(() => {
    const text = value.trim();
    if (text.length < 8) {
      setDetected(null);
      return;
    }
    const t = setTimeout(() => setDetected(detectLanguage(text)), 500);
    return () => clearTimeout(t);
  }, [value]);

  const mismatch =
    !!detected && detected.confidence >= 60 && detected.code !== lang && !dismissMismatch;

  const stale =
    fromTranslation &&
    !!value.trim() &&
    snapshot.trim() !== `${sourceSubject ?? ""}\u0000${source}`.trim();

  async function translate(code = lang) {
    const src = source.trim();
    if (!src) return toast.error("请先填写中文原文后再使用一键翻译");
    if (value.trim() && !fromTranslation) {
      const ok = window.confirm("翻译将覆盖当前已撰写的实际发送内容，是否继续？");
      if (!ok) return;
    }
    const target = langByCode(code);
    if (!target) return;
    setLoading(true);
    const rawSubject = (sourceSubject ?? "").trim();
    try {
      const jobs: Promise<{ content: string }>[] = [
        callTranslate({
          data: {
            text: src,
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
              text: rawSubject,
              targetLanguageName: target.en,
              sourceLanguageName: "Chinese (Simplified)",
              tone: "friendly",
            },
          }),
        );
      }
      const [body, subj] = await Promise.all(jobs);
      onChange(unwrapBraces(body?.content ?? ""));
      if (hasSubject) onSubjectChange?.(unwrapBraces(subj?.content ?? ""));
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


      {hasSubject && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">主题（译文）</Label>
          <Input
            value={subjectValue}
            onChange={(e) => onSubjectChange?.(e.target.value)}
            placeholder={`翻译后此处展示${opt?.zh ?? "目标语言"}主题，可手动修改`}
          />
        </div>
      )}

      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={`选择目标语言后点击「翻译」，此处展示${
          opt?.zh ?? "目标语言"
        }${kindLabel}，可手动修改`}
      />
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
