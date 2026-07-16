import { useMemo, useState } from "react";
import { Target, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Thread } from "@/lib/inbox-store";
import { IntentScorePanel } from "./IntentScorePanel";
import { AuthenticityPanel } from "./AuthenticityPanel";
import { scoreAuthenticity, type AuthLevel } from "@/lib/ai-authenticity";

const LEVEL_DOT: Record<AuthLevel, string> = {
  trusted: "bg-emerald-500",
  neutral: "bg-sky-500",
  suspicious: "bg-amber-500",
  high_risk: "bg-orange-500",
  blocked: "bg-rose-500",
};

export function IntelPanel({ thread }: { thread: Thread }) {
  const [tab, setTab] = useState<"intent" | "auth">("intent");
  const auth = useMemo(() => scoreAuthenticity(thread), [thread]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex border-b shrink-0">
        <TabBtn active={tab === "intent"} onClick={() => setTab("intent")}>
          <Target className="h-3.5 w-3.5" />
          意向评分
        </TabBtn>
        <TabBtn active={tab === "auth"} onClick={() => setTab("auth")}>
          <Shield className="h-3.5 w-3.5" />
          真实度
          <span
            className={cn(
              "ml-1 h-1.5 w-1.5 rounded-full",
              LEVEL_DOT[auth.level],
            )}
            aria-hidden
          />
        </TabBtn>
      </div>
      <div className="flex-1 min-h-0">
        {tab === "intent" ? (
          <IntentScorePanel thread={thread} />
        ) : (
          <AuthenticityPanel thread={thread} />
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 h-9 text-xs inline-flex items-center justify-center gap-1.5 border-b-2 transition-colors",
        active
          ? "border-primary text-foreground font-medium"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
