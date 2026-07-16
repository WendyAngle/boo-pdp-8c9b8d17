import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, Sparkles, X, RotateCcw, Minus } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { askAssistant, translateMessages } from "@/lib/api/ai-assistant.functions";
import { SUGGESTIONS, UI_TEXT, type Lang } from "./suggestions";

type Msg = {
  id: string;
  role: "user" | "assistant";
  variants: Partial<Record<Lang, string>>;
  /** 该消息最初产生时所用语言（作为翻译源） */
  source: Lang;
};

const FAB_KEY = "ai-assistant:fab-pos";
const PANEL_KEY = "ai-assistant:panel-pos";
const LANG_KEY = "ai-assistant:lang";
const FAB_SIZE = 56;
const PANEL_W = 384;
const PANEL_H = 560;

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function loadPos(
  key: string,
  fallback: { x: number; y: number },
  size?: { w: number; h: number },
) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    const p = raw ? (JSON.parse(raw) as { x: number; y: number }) : fallback;
    let x = Number.isFinite(p?.x) ? Number(p.x) : fallback.x;
    let y = Number.isFinite(p?.y) ? Number(p.y) : fallback.y;
    // Snap stale/off-screen positions back into view.
    if (size) {
      const maxX = Math.max(8, window.innerWidth - size.w - 8);
      const maxY = Math.max(8, window.innerHeight - size.h - 8);
      x = clamp(x, 8, maxX);
      y = clamp(y, 8, maxY);
    }
    return { x, y };
  } catch {
    return fallback;
  }
}

function useDraggable(
  storageKey: string,
  size: { w: number; h: number },
  fallback: () => { x: number; y: number },
) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);

  useEffect(() => {
    setPos(loadPos(storageKey, fallback(), size));
  }, [storageKey]);

  // clamp on window resize
  useEffect(() => {
    if (!pos) return;
    const onResize = () => {
      setPos((p) => {
        if (!p) return p;
        return {
          x: clamp(p.x, 8, window.innerWidth - size.w - 8),
          y: clamp(p.y, 8, window.innerHeight - size.h - 8),
        };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pos, size.w, size.h]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!pos) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, moved: false };
    },
    [pos],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const nx = clamp(e.clientX - d.dx, 8, window.innerWidth - size.w - 8);
      const ny = clamp(e.clientY - d.dy, 8, window.innerHeight - size.h - 8);
      if (!d.moved && (Math.abs(e.clientX - d.dx - (pos?.x ?? 0)) > 4 || Math.abs(e.clientY - d.dy - (pos?.y ?? 0)) > 4)) {
        d.moved = true;
      }
      setPos({ x: nx, y: ny });
    },
    [pos, size.w, size.h],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      if (pos) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(pos));
        } catch {}
      }
      return d?.moved ?? false;
    },
    [pos, storageKey],
  );

  return { pos, setPos, onPointerDown, onPointerMove, onPointerUp, didMove: () => dragRef.current?.moved ?? false };
}

export function AssistantProvider() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("bi");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(LANG_KEY);
    if (saved === "bi" || saved === "zh" || saved === "en") setLang(saved);
  }, []);

  const fab = useDraggable(FAB_KEY, { w: FAB_SIZE, h: FAB_SIZE }, () => ({
    x: typeof window !== "undefined" ? window.innerWidth - FAB_SIZE - 24 : 0,
    y: typeof window !== "undefined" ? window.innerHeight - FAB_SIZE - 24 : 0,
  }));

  const panel = useDraggable(PANEL_KEY, { w: PANEL_W, h: PANEL_H }, () => ({
    x: typeof window !== "undefined" ? window.innerWidth - PANEL_W - 24 : 0,
    y: typeof window !== "undefined" ? window.innerHeight - PANEL_H - 96 : 0,
  }));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const ask = useServerFn(askAssistant);
  const translate = useServerFn(translateMessages);

  const send = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || loading) return;
      const userMsg: Msg = {
        id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: "user",
        variants: { [lang]: t } as Partial<Record<Lang, string>>,
        source: lang,
      };
      const next: Msg[] = [...messages, userMsg];
      setMessages(next);
      setInput("");
      setLoading(true);
      try {
        const flat = next.map((m) => ({
          role: m.role,
          content: m.variants[lang] ?? m.variants[m.source] ?? "",
        }));
        const res = await ask({ data: { messages: flat, lang } });
        const aMsg: Msg = {
          id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: "assistant",
          variants: { [lang]: res.content || "(空回复)" } as Partial<Record<Lang, string>>,
          source: lang,
        };
        setMessages([...next, aMsg]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "AI 调用失败";
        toast.error(msg);
        setMessages(next);
      } finally {
        setLoading(false);
      }
    },
    [ask, lang, loading, messages],
  );

  const handleLangChange = async (v: string) => {
    const l = v as Lang;
    setLang(l);
    try {
      window.localStorage.setItem(LANG_KEY, l);
    } catch {}
    // 翻译当前会话中缺失目标语言版本的消息
    setMessages((cur) => cur); // no-op, just for type
    const missing = messages
      .filter((m) => !m.variants[l])
      .map((m) => ({ id: m.id, text: m.variants[m.source] ?? Object.values(m.variants)[0] ?? "" }))
      .filter((it) => it.text);
    if (missing.length === 0) return;
    setTranslating(true);
    try {
      const { translations } = await translate({ data: { items: missing, target: l } });
      setMessages((cur) =>
        cur.map((m) =>
          translations[m.id]
            ? { ...m, variants: { ...m.variants, [l]: translations[m.id] } }
            : m,
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "翻译失败";
      toast.error(msg);
    } finally {
      setTranslating(false);
    }
  };

  const suggestions = useMemo(() => SUGGESTIONS[lang], [lang]);
  const t = UI_TEXT[lang];

  return (
    <>
      {/* Floating Action Button */}
      {fab.pos && (
        <button
          type="button"
          aria-label="AI 智能助手"
          onPointerDown={fab.onPointerDown}
          onPointerMove={fab.onPointerMove}
          onPointerUp={(e) => {
            const moved = fab.onPointerUp(e);
            if (!moved) setOpen((v) => !v);
          }}
          style={{
            position: "fixed",
            left: fab.pos.x,
            top: fab.pos.y,
            width: FAB_SIZE,
            height: FAB_SIZE,
            touchAction: "none",
          }}
          className="z-[60] rounded-full shadow-lg select-none cursor-grab active:cursor-grabbing group"
        >
          <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-primary/70 shadow-md ring-2 ring-background flex items-center justify-center">
            <Bot className="size-6 text-primary-foreground" strokeWidth={2.2} />
            <Sparkles className="absolute -top-1 -right-1 size-3.5 text-primary-foreground/90 animate-pulse" />
          </span>
        </button>
      )}

      {/* Panel */}
      {open && panel.pos && (
        <div
          role="dialog"
          aria-label="智能助手"
          style={{
            position: "fixed",
            left: panel.pos.x,
            top: panel.pos.y,
            width: PANEL_W,
            height: PANEL_H,
          }}
          className="z-[70] flex flex-col rounded-xl border bg-background shadow-2xl overflow-hidden animate-in fade-in zoom-in-95"
        >
          {/* Header (drag handle) */}
          <div
            onPointerDown={panel.onPointerDown}
            onPointerMove={panel.onPointerMove}
            onPointerUp={panel.onPointerUp}
            style={{ touchAction: "none" }}
            className="flex items-center gap-2 px-3 py-2.5 border-b bg-muted/60 cursor-grab active:cursor-grabbing select-none"
          >
            <div className="size-7 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
              <Bot className="size-4 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold leading-tight truncate">{t.title}</div>
              <div className="text-[11px] text-muted-foreground leading-tight truncate">{t.subtitle}</div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              title={t.newChat}
              onClick={(e) => {
                e.stopPropagation();
                setMessages([]);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <RotateCcw className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Minus className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <X className="size-3.5" />
            </Button>
          </div>

          {/* Lang tabs */}
          <div className="px-3 py-2 border-b">
            <Tabs value={lang} onValueChange={handleLangChange}>
              <TabsList className="h-8 w-full grid grid-cols-3">
                <TabsTrigger value="bi" className="text-xs h-6">双语</TabsTrigger>
                <TabsTrigger value="zh" className="text-xs h-6">中文</TabsTrigger>
                <TabsTrigger value="en" className="text-xs h-6">EN</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-sm">
            {messages.length === 0 && (
              <div className="text-xs text-muted-foreground whitespace-pre-line py-2">{t.empty}</div>
            )}
            {messages.map((m) => {
              const text = m.variants[lang];
              return (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 whitespace-pre-wrap break-words leading-relaxed",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                    !text && "italic opacity-70",
                  )}
                >
                  {text ?? (translating ? t.translating : (m.variants[m.source] ?? ""))}
                </div>
              </div>
              );
            })}
            {(loading || translating) && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2 text-xs text-muted-foreground inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="size-1.5 rounded-full bg-foreground/50 animate-bounce" style={{ animationDelay: "120ms" }} />
                  <span className="size-1.5 rounded-full bg-foreground/50 animate-bounce" style={{ animationDelay: "240ms" }} />
                  <span className="ml-1.5">{translating ? t.translating : t.thinking}</span>
                </div>
              </div>
            )}
          </div>

          {/* Suggestions (常显) */}
          <div className="px-3 pb-2 border-t pt-2 bg-muted/30">
              <div className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
                <Sparkles className="size-3" />
                {t.suggestionsTitle}
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={loading || translating}
                    onClick={() => send(s)}
                    className="text-[11px] leading-tight px-2 py-1 rounded-md border bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-left disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
          </div>

          {/* Input */}
          <div className="border-t p-2 flex items-end gap-2 bg-background">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={t.placeholder}
              rows={1}
              className="min-h-[36px] max-h-32 resize-none text-sm py-2"
              disabled={loading}
            />
            <Button
              size="icon"
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="size-9 shrink-0"
              title={t.send}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}