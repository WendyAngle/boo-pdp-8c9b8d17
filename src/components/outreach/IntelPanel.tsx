import { IntentScorePanel } from "./IntentScorePanel";
import type { Thread } from "@/lib/inbox-store";

export function IntelPanel({ thread }: { thread: Thread }) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex border-b shrink-0">
        <div className="flex-1 h-9 text-xs inline-flex items-center justify-center gap-1.5 border-b-2 border-primary text-foreground font-medium">
          意向评分
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <IntentScorePanel thread={thread} />
      </div>
    </div>
  );
}
