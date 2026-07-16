import { createFileRoute, Link } from "@tanstack/react-router";
import { Compass, Sparkles, Wallet, Settings2 } from "lucide-react";

export const Route = createFileRoute("/_app/")({
  head: () => ({
    meta: [
      { title: "出海大数据平台" },
      { name: "description", content: "出海大数据平台 - 数据驱动业务增长" },
    ],
  }),
  component: Home,
});

function Home() {
  const groups = [
    {
      title: "客户发现",
      desc: "线索、企业、商品、提单——找到目标客户",
      to: "/outreach/leads",
      Icon: Compass,
    },
    {
      title: "客户运营",
      desc: "收藏、足迹、触达——沉淀与跟进客户",
      to: "/outreach/favorites",
      Icon: Sparkles,
    },
    {
      title: "费用中心",
      desc: "查看触达账单与消费明细",
      to: "/outreach/billing",
      Icon: Wallet,
    },
    {
      title: "系统管理",
      desc: "管理本企业的员工账号与登录状态",
      to: "/outreach/users",
      Icon: Settings2,
    },
  ];
  return (
    <div className="p-8 space-y-6">
      <section className="relative overflow-hidden rounded-2xl p-10 text-white" style={{ background: "var(--gradient-hero)" }}>
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-4xl font-bold tracking-tight">出海大数据平台</h1>
          <p className="mt-3 text-white/90 text-lg">从数据到决策，构建可信的业务底座</p>
        </div>
        <div className="absolute -right-10 -bottom-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute right-20 top-6 h-32 w-32 rounded-2xl bg-white/10 backdrop-blur-sm rotate-12" />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {groups.map(({ title, desc, to, Icon }) => (
          <Link
            key={title}
            to={to}
            className="group rounded-xl border bg-card p-6 hover:border-primary hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-lg bg-accent flex items-center justify-center">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">出海大数据平台 · {title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}