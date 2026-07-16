import { createFileRoute } from "@tanstack/react-router";
import { Target } from "lucide-react";
import { ProfileTab } from "./_app.outreach.leads";
import { useLeadProfile, profileCompleteness } from "@/lib/lead-profile";

export const Route = createFileRoute("/_app/outreach/my-profile")({
  head: () => ({
    meta: [
      { title: "我的画像 · 系统管理 | 出海大数据平台" },
      {
        name: "description",
        content:
          "维护企业基础信息、主营业务、目标市场与竞争情报，用于 AI 智能推荐与触达内容个性化。",
      },
    ],
  }),
  component: MyProfilePage,
});

function MyProfilePage() {
  const profile = useLeadProfile();
  const completeness = profileCompleteness(profile);

  return (
    <div className="p-6 space-y-4">
      <section
        className="relative overflow-hidden rounded-2xl p-6 lg:p-7 text-white"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="absolute -right-10 -bottom-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Target className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">我的画像</h1>
              <p className="text-white/85 text-sm mt-0.5 max-w-2xl">
                维护企业基础信息、主营业务、目标市场与竞争情报。画像越完整，AI 智能推荐、触达文案个性化就越精准。
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11px] uppercase tracking-wider text-white/70">当前完整度</div>
            <div className="text-3xl font-bold tabular-nums leading-tight">
              {completeness}
              <span className="text-base font-medium text-white/80 ml-0.5">%</span>
            </div>
          </div>
        </div>
      </section>

      <ProfileTab />
    </div>
  );
}