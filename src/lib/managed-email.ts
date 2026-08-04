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
/** 待受理 → 执行中 → 已完成 / 已中止 */
export type ManagedStatus = "pending" | "running" | "completed" | "cancelled";

export type ManagedOrder = {
  id: string;
  orderNo: string;
  source: ManagedSource;
  qty: number;
  /** 已执行（已发出）目标数 */
  sent: number;
  product: string;
  market?: string;
  contact: string;
  note?: string;
  status: ManagedStatus;
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
};

const KEY = "boo:managed-email:v1";

function read(): ManagedOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : null;
    if (Array.isArray(arr)) return arr as ManagedOrder[];
  } catch {}
  return [];
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
