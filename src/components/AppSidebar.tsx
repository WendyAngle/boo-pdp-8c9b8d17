import { useState, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ShieldCheck, ChevronDown, Users, UserCog, Send, FolderTree, Box, Wallet, Layers, Receipt, FileText, Search, LayoutDashboard, Inbox, KeyRound } from "lucide-react";
import { AccountMenu } from "@/components/account/AccountMenu";
import { useSidebarBadge } from "@/lib/inbox-store";

type Leaf = { label: string; to: string; icon?: typeof Users };
type Group = { label: string; to?: string; children: Leaf[] };
type Root = { label: string; icon: typeof ShieldCheck; children: Group[] };

const menu: Root[] = [
  {
    label: "出海大数据平台",
    icon: Send,
    children: [
      {
        label: "全域检索",
        to: "/outreach/search",
        children: [],
      },
      {
        label: "客户发现",
        children: [
          { label: "商机线索", to: "/outreach/leads" },
          { label: "企业名录", to: "/outreach/enterprise" },
          { label: "商品目录", to: "/outreach/products" },
          { label: "提单", to: "/outreach/bills" },
        ],
      },
      {
        label: "客户运营",
        children: [
          { label: "我的收藏", to: "/outreach/favorites" },
          { label: "浏览足迹", to: "/outreach/footprints" },
          { label: "解锁记录", to: "/outreach/unlocked" },
          { label: "触达任务", to: "/outreach/reach" },
          { label: "询盘与回复", to: "/outreach/conversations" },
          { label: "退订名单", to: "/outreach/suppressions" },
        ],
      },
      {
        label: "费用中心",
        children: [
          { label: "消费明细", to: "/outreach/billing" },
          { label: "账户充值", to: "/outreach/recharge" },
          { label: "发票管理", to: "/outreach/invoices" },
        ],
      },
      {
        label: "系统管理",
        children: [
          { label: "我的画像", to: "/outreach/my-profile" },
          { label: "员工管理", to: "/outreach/users" },
          { label: "发信邮箱", to: "/outreach/mailboxes" },
          { label: "询盘分派", to: "/outreach/inquiry-dispatch" },
        ],
      },
    ],
  },
  {
    label: "管理后台",
    icon: ShieldCheck,
    children: [
      { label: "邮件服务商", to: "/outreach/admin/email-providers", children: [] },
      { label: "邮件账号", to: "/outreach/admin/email-accounts", children: [] },
      { label: "短信服务商", to: "/outreach/admin/sms-providers", children: [] },
      { label: "短信路由", to: "/outreach/admin/sms-routing", children: [] },
      { label: "短信模板", to: "/outreach/admin/sms-templates", children: [] },
      { label: "发票审核", to: "/outreach/admin/invoice-review", children: [] },
    ],
  },
];

export function AppSidebar() {
  const { location } = useRouterState();
  const badge = useSidebarBadge();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [open, setOpen] = useState<Record<string, boolean>>({
    出海大数据平台: true,
    客户发现: true,
    客户运营: true,
    管理后台: true,
  });

  return (
    <aside className="w-60 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
      <div className="h-16 flex items-center gap-2 px-5 border-b border-sidebar-border">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground font-bold">
          B
        </div>
        <span className="font-semibold text-sidebar-foreground tracking-wide">出海大数据平台</span>
      </div>
      <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
        {menu.map((item) => {
          const Icon = item.icon;
          const isOpen = open[item.label];
          return (
            <div key={item.label}>
              <button
                onClick={() => setOpen((s) => ({ ...s, [item.label]: !isOpen }))}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              >
                <Icon className="h-4 w-4 text-primary" />
                <span className="flex-1 text-left">{item.label}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
              </button>
              {isOpen && (
                <div className="mt-1 ml-6 space-y-0.5 border-l border-sidebar-border pl-3">
                  {item.children.map((g) => {
                    const hasKids = g.children.length > 0;
                    const gOpen = open[g.label] ?? true;
                    const gActive = g.to ? location.pathname === g.to : false;
                    return (
                      <div key={g.label}>
                        {g.to ? (
                          <div className="flex items-center">
                            <Link
                              to={g.to}
                              className={`flex-1 block px-3 py-1.5 rounded-md text-sm transition-colors ${
                                gActive
                                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
                              }`}
                            >
                              {g.label}
                            </Link>
                            {hasKids && (
                              <button
                                onClick={() => setOpen((s) => ({ ...s, [g.label]: !gOpen }))}
                                className="p-1 rounded hover:bg-sidebar-accent/60"
                                aria-label="toggle"
                              >
                                <ChevronDown
                                  className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                                    gOpen ? "" : "-rotate-90"
                                  }`}
                                />
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => setOpen((s) => ({ ...s, [g.label]: !gOpen }))}
                            className="w-full flex items-center px-3 py-1.5 rounded-md text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
                          >
                            <span className="flex-1 text-left">{g.label}</span>
                            {hasKids && (
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform ${gOpen ? "" : "-rotate-90"}`}
                              />
                            )}
                          </button>
                        )}
                        {hasKids && gOpen && (
                          <div className="mt-0.5 ml-4 space-y-0.5 border-l border-sidebar-border pl-3">
                            {g.children.map((c) => {
                              const CI = c.icon;
                              const active = location.pathname === c.to;
                              return (
                                <Link
                                  key={c.to}
                                  to={c.to}
                                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                                    active
                                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
                                  }`}
                                >
                                  {CI && <CI className="h-3.5 w-3.5" />}
                                  <span>{c.label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="p-2 border-t border-sidebar-border space-y-1">
        <AccountMenu />
        <div className="px-3 text-[10px] text-muted-foreground/70 tracking-wide">v1.0.0</div>
      </div>
    </aside>
  );
}