import { useSyncExternalStore } from "react";

/** 我方社媒执行账号池（对最终用户隐藏，仅后台调度使用） */
export type SocialPlatform = "WhatsApp" | "TikTok" | "Facebook";

export interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  handle: string;
  displayName: string;
  dailyLimit: number;
  sentToday: number;
  status: "正常" | "停用" | "异常";
}

const KEY = "boo:social-accounts:v1";
const SEED_FLAG = "boo:social-accounts:v1:seeded";

function read(): SocialAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
  } catch {}
  return [];
}
function write(arr: SocialAccount[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {}
}

function seed() {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(SEED_FLAG)) return;
  const seedData: SocialAccount[] = [
    {
      id: "sa_wa_1",
      platform: "WhatsApp",
      handle: "+8613800001111",
      displayName: "ByteTech WA · 主号",
      dailyLimit: 100,
      sentToday: 12,
      status: "正常",
    },
    {
      id: "sa_wa_2",
      platform: "WhatsApp",
      handle: "+8613800002222",
      displayName: "ByteTech WA · 备号",
      dailyLimit: 100,
      sentToday: 4,
      status: "正常",
    },
    {
      id: "sa_wa_3",
      platform: "WhatsApp",
      handle: "+8613800003333",
      displayName: "ByteTech WA · 客服",
      dailyLimit: 80,
      sentToday: 0,
      status: "正常",
    },
  ];
  write(seedData);
  window.localStorage.setItem(SEED_FLAG, "1");
}
seed();

let cache: SocialAccount[] = read();
let version = 0;
const listeners = new Set<() => void>();
function emit() {
  version++;
  listeners.forEach((l) => l());
}
function commit(next: SocialAccount[]) {
  cache = next;
  write(next);
  emit();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      cache = read();
      emit();
    }
  });
}

export function useSocialAccounts(): SocialAccount[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => {
      void version;
      return cache;
    },
    () => [],
  );
}

/** 平台可用账号（状态=正常） */
export function usableAccountsOf(list: SocialAccount[], platform: SocialPlatform) {
  return list.filter((a) => a.platform === platform && a.status === "正常");
}

/** 池今日剩余额度合计 */
export function poolRemaining(list: SocialAccount[], platform: SocialPlatform): number {
  return usableAccountsOf(list, platform).reduce(
    (s, a) => s + Math.max(0, a.dailyLimit - a.sentToday),
    0,
  );
}

/** 池今日上限合计（用于展示 N/M） */
export function poolCapacity(list: SocialAccount[], platform: SocialPlatform): number {
  return usableAccountsOf(list, platform).reduce((s, a) => s + a.dailyLimit, 0);
}

/**
 * 后台调度分派：按剩余额度从高到低轮询，为 count 条消息分配账号，
 * 返回实际可分配数量并同步累加 sentToday。
 */
export function dispatchSend(platform: SocialPlatform, count: number): number {
  let remaining = count;
  const next = cache.map((a) => ({ ...a }));
  while (remaining > 0) {
    // 每轮选剩余最多的正常账号
    const idx = next
      .map((a, i) => ({ a, i }))
      .filter(
        ({ a }) =>
          a.platform === platform &&
          a.status === "正常" &&
          a.sentToday < a.dailyLimit,
      )
      .sort(
        (x, y) =>
          y.a.dailyLimit - y.a.sentToday - (x.a.dailyLimit - x.a.sentToday),
      )[0]?.i;
    if (idx === undefined) break;
    next[idx].sentToday += 1;
    remaining -= 1;
  }
  commit(next);
  return count - remaining;
}