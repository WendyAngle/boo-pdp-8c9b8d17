import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Send, Users, MessageSquare, Facebook, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSocialAccounts, friendRemaining } from "@/data/social-accounts";
import { avgHealth } from "@/lib/social-account-health";

export const Route = createFileRoute("/_app/outreach/social/reach")({
  head: () => ({
    meta: [
      { title: "社媒触达 · 出海大数据平台" },
      {
        name: "description",
        content:
          "统一的社媒触达工作台：加友任务、好友池、私信任务在一个模块内闭环。",
      },
      { property: "og:title", content: "社媒触达" },
      {
        property: "og:description",
        content: "关键词加友 → 好友沉淀 → 私信触达，一站完成。",
      },
    ],
  }),
  component: SocialReachLayout,
});

const TABS = [
  {
    to: "/outreach/social/reach/prospecting" as const,
    label: "加友任务",
    icon: Users,
    match: "/outreach/social/reach/prospecting",
  },
  {
    to: "/outreach/social/reach/friends" as const,
    label: "好友池",
    icon: Send,
    match: "/outreach/social/reach/friends",
  },
  {
    to: "/outreach/social/reach/dm" as const,
    label: "私信任务",
    icon: MessageSquare,
    match: "/outreach/social/reach/dm",
  },
];

function SocialReachLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const accounts = useSocialAccounts();
  const fbRemain = friendRemaining(accounts, "Facebook");
  const ttRemain = friendRemaining(accounts, "TikTok");
  const health = avgHealth(accounts);

  return (
    <div className="flex flex-col">
      <div className="px-6 pt-6">
        <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Send className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold">社媒触达</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                关键词加友 → 好友沉淀 → 私信触达，全链路一站完成。
              </p>
            </div>
            <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Facebook className="h-3.5 w-3.5 text-sky-600" />
                今日加友剩余{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {fbRemain}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Music2 className="h-3.5 w-3.5 text-rose-600" />
                今日加友剩余{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {ttRemain}
                </span>
              </div>
              <div className="flex items-center gap-1">
                账号池平均健康度{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {health}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1 border-b">
          {TABS.map((t) => {
            const active =
              pathname === t.match || pathname.startsWith(t.match + "/");
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
                  active
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>

      <Outlet />
    </div>
  );
}
