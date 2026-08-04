import { useSyncExternalStore } from "react";
import {
  chargeManagedEmailBatch,
  refundManagedEmailTargets,
} from "@/lib/credits-ledger";

/** 邮件托管触达：10 积分 / 目标（含名单清洗、文案撰写、代发等全部人工服务） */
export const MANAGED_EMAIL_COST_PER_TARGET = 10;
export const MANAGED_MIN_OWN = 200;
export const MANAGED_MIN_AI = 500;

export type ManagedSource = "own" | "ai";
/** 待受理 → 执行中 → 已完成 / 已中止 / 已驳回 */
export type ManagedStatus =
  | "pending"
  | "running"
  | "completed"
  | "cancelled"
  | "rejected";

/** 文案模式：我方撰写 / 客户提供 */
export type ManagedCopyMode = "ours" | "client";

export type ManagedOrder = {
  id: string;
  orderNo: string;
  /** 客户企业（当前租户） */
  company: string;
  source: ManagedSource;
  qty: number;
  /** 已执行（已发出）目标数 */
  sent: number;
  product: string;
  market?: string;
  /** 目标关键词（B 档寻源用） */
  keywords?: string;
  copyMode: ManagedCopyMode;
  /** 期望开始日期 YYYY-MM-DD */
  expectStartAt?: string;
  /** 每日发送上限，0/空表示按邮箱健康度自动 */
  dailyCap?: number;
  contact: string;
  note?: string;
  status: ManagedStatus;
  /** 负责顾问 */
  assignee?: string;
  /** 驳回原因（用户端可见） */
  rejectReason?: string;
  /** 批次确认时一次性扣除的积分 */
  charged: number;
  /** 中止 / 完成后退回的积分 */
  refunded: number;
  createdAt: string;
  updatedAt: string;
  /** 运营侧备注（受理说明、执行说明） */
  opsNote?: string;
};

export function managedMinQty(source: ManagedSource) {
  return source === "own" ? MANAGED_MIN_OWN : MANAGED_MIN_AI;
}

export const MANAGED_STATUS_LABEL: Record<ManagedStatus, string> = {
  pending: "待受理",
  running: "执行中",
  completed: "已完成",
  cancelled: "已中止",
  rejected: "已驳回",
};

/** 我方营销顾问（mock） */
export const MANAGED_ASSIGNEES = ["顾问 · 林晓", "顾问 · 陈坤", "顾问 · 周颖"];

const KEY = "boo:managed-email:v2";

const CURRENT_COMPANY = "深圳市博奥智能科技有限公司";

function daysAgo(n: number, h = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, 20, 0, 0);
  return d.toISOString();
}

function dateAfter(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 演示工单：覆盖 待受理 / 执行中 / 已完成 / 已中止 / 已驳回 五种状态 */
function seed(): ManagedOrder[] {
  const base = (o: Partial<ManagedOrder> & { orderNo: string; qty: number }) => {
    const charged = o.charged ?? o.qty * MANAGED_EMAIL_COST_PER_TARGET;
    return {
      id: `me_seed_${o.orderNo}`,
      company: CURRENT_COMPANY,
      source: "own" as ManagedSource,
      sent: 0,
      product: "户外储能电源",
      copyMode: "ours" as ManagedCopyMode,
      contact: "王磊 138****6621",
      status: "pending" as ManagedStatus,
      charged,
      refunded: 0,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
      ...o,
    } as ManagedOrder;
  };

  return [
    base({
      orderNo: "ME20260803093012",
      source: "ai",
      qty: 800,
      product: "便携式储能电源",
      market: "欧洲（德国 / 荷兰）",
      keywords: "portable power station, solar generator, off-grid battery",
      expectStartAt: dateAfter(2),
      dailyCap: 120,
      status: "pending",
      note: "主推 2000W 新品，避开已合作的 3 家德国经销商。",
      createdAt: daysAgo(1, 9),
      updatedAt: daysAgo(1, 9),
    }),
    base({
      orderNo: "ME20260731142205",
      source: "own",
      qty: 320,
      sent: 186,
      product: "车载逆变器",
      market: "东南亚",
      expectStartAt: dateAfter(-2),
      dailyCap: 80,
      status: "running",
      assignee: MANAGED_ASSIGNEES[0],
      opsNote: "名单去重后剩余 312 个有效邮箱，已完成首轮 186 封，跟进信排期 8/6。",
      createdAt: daysAgo(4, 14),
      updatedAt: daysAgo(0, 8),
    }),
    base({
      orderNo: "ME20260728101744",
      source: "ai",
      qty: 600,
      sent: 411,
      product: "家用储能系统",
      market: "中东（阿联酋 / 沙特）",
      keywords: "home energy storage, hybrid inverter, solar ESS",
      status: "running",
      assignee: MANAGED_ASSIGNEES[1],
      opsNote: "寻源完成 600 个目标，分 6 天排期，当前第 4 天。",
      createdAt: daysAgo(7, 10),
      updatedAt: daysAgo(0, 9),
    }),
    base({
      orderNo: "ME20260715163350",
      source: "own",
      qty: 500,
      sent: 486,
      product: "太阳能板支架",
      market: "拉美",
      status: "completed",
      assignee: MANAGED_ASSIGNEES[2],
      refunded: 14 * MANAGED_EMAIL_COST_PER_TARGET,
      opsNote: "14 个目标邮箱无效已剔除，对应积分已退回；共回复 23 封，已归集到触达会话。",
      createdAt: daysAgo(20, 16),
      updatedAt: daysAgo(9, 11),
    }),
    base({
      orderNo: "ME20260709111020",
      source: "ai",
      qty: 500,
      sent: 240,
      product: "工商业储能柜",
      market: "北美",
      status: "cancelled",
      assignee: MANAGED_ASSIGNEES[0],
      refunded: 260 * MANAGED_EMAIL_COST_PER_TARGET,
      opsNote: "客户中途叫停（产线排期调整），剩余 260 个目标积分已退回。",
      createdAt: daysAgo(26, 11),
      updatedAt: daysAgo(18, 15),
    }),
    base({
      orderNo: "ME20260705090810",
      source: "own",
      qty: 200,
      product: "锂电池组",
      market: "俄罗斯",
      status: "rejected",
      assignee: MANAGED_ASSIGNEES[1],
      refunded: 200 * MANAGED_EMAIL_COST_PER_TARGET,
      rejectReason: "目标名单中 60% 邮箱已在退订/黑名单库，建议补充名单后重新提交，积分已全额退回。",
      createdAt: daysAgo(30, 9),
      updatedAt: daysAgo(29, 14),
    }),
  ];
}

function read(): ManagedOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : null;
    if (Array.isArray(arr)) return arr as ManagedOrder[];
  } catch {}
  return seed();
}


let orders: ManagedOrder[] = read();
let version = 0;
const listeners = new Set<() => void>();

function persist() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(orders));
    } catch {}
  }
  version++;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const getVersion = () => version;

export function useManagedOrders(): ManagedOrder[] {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return orders;
}

export function listManagedOrders() {
  return orders;
}

function nextOrderNo() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `ME${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(
    d.getHours(),
  )}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 提交托管需求：一次性按目标数扣积分 */
export function createManagedOrder(input: {
  source: ManagedSource;
  qty: number;
  product: string;
  market?: string;
  contact: string;
  note?: string;
}): ManagedOrder {
  const now = new Date().toISOString();
  const charged = input.qty * MANAGED_EMAIL_COST_PER_TARGET;
  const order: ManagedOrder = {
    id: `me_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    orderNo: nextOrderNo(),
    source: input.source,
    qty: input.qty,
    sent: 0,
    product: input.product,
    market: input.market,
    contact: input.contact,
    note: input.note,
    status: "pending",
    charged,
    refunded: 0,
    createdAt: now,
    updatedAt: now,
  };
  orders = [order, ...orders];
  persist();
  chargeManagedEmailBatch({
    orderNo: order.orderNo,
    qty: order.qty,
    cost: charged,
    detail: `邮件托管触达 · ${order.source === "own" ? "自有名单" : "AI 智能寻源"} ${order.qty} 个目标`,
  });
  return order;
}

function update(id: string, patch: Partial<ManagedOrder>) {
  orders = orders.map((o) =>
    o.id === id ? { ...o, ...patch, updatedAt: new Date().toISOString() } : o,
  );
  persist();
}

/** 运营受理 → 执行中 */
export function acceptManagedOrder(id: string, opsNote?: string) {
  const o = orders.find((x) => x.id === id);
  if (!o || o.status !== "pending") return;
  update(id, { status: "running", opsNote: opsNote ?? o.opsNote });
}

/** 运营回填执行进度（已发出目标数） */
export function updateManagedProgress(id: string, sent: number) {
  const o = orders.find((x) => x.id === id);
  if (!o || (o.status !== "running" && o.status !== "pending")) return;
  const next = Math.max(0, Math.min(o.qty, Math.round(sent)));
  update(id, { sent: next, status: o.status === "pending" ? "running" : o.status });
}

/** 结算完成：未执行部分退回积分 */
export function completeManagedOrder(id: string) {
  const o = orders.find((x) => x.id === id);
  if (!o || (o.status !== "running" && o.status !== "pending")) return;
  const remain = o.qty - o.sent;
  const refund = remain * MANAGED_EMAIL_COST_PER_TARGET;
  update(id, { status: "completed", refunded: o.refunded + refund });
  if (refund > 0) {
    refundManagedEmailTargets({
      orderNo: o.orderNo,
      qty: remain,
      cost: refund,
      detail: `邮件托管触达结算退回 · 未执行 ${remain} 个目标`,
    });
  }
}

/** 中途叫停：剩余未执行目标退回积分 */
export function cancelManagedOrder(id: string, reason?: string) {
  const o = orders.find((x) => x.id === id);
  if (!o || (o.status !== "running" && o.status !== "pending")) return;
  const remain = o.qty - o.sent;
  const refund = remain * MANAGED_EMAIL_COST_PER_TARGET;
  update(id, {
    status: "cancelled",
    refunded: o.refunded + refund,
    opsNote: reason ?? o.opsNote,
  });
  if (refund > 0) {
    refundManagedEmailTargets({
      orderNo: o.orderNo,
      qty: remain,
      cost: refund,
      detail: `邮件托管触达中止退回 · 剩余 ${remain} 个目标`,
    });
  }
}
