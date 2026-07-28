import { useSyncExternalStore } from "react";

/** 我方社媒执行账号池（对最终用户隐藏，仅后台调度使用） */
export type SocialPlatform = "WhatsApp" | "TikTok" | "Facebook";

export interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  handle: string;
  displayName: string;
  /** 每日发送额度（私信） */
  dailyLimit: number;
  sentToday: number;
  /** Facebook / TikTok：每日加友额度（默认 5） */
  dailyFriendLimit?: number;
  friendSentToday?: number;
  /** Facebook / TikTok：每日私信额度（默认 20） */
  dailyDmLimit?: number;
  dmSentToday?: number;
  status: "正常" | "停用" | "异常" | "养号中";
  purchasedAt?: string;
}

const KEY = "boo:social-accounts:v5";
const SEED_FLAG = "boo:social-accounts:v5:seeded";

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
  const now = new Date().toISOString();
  const seedData: SocialAccount[] = [
    // Facebook 预置 2 个（历史购买示例）
    {
      id: "sa_fb_1",
      platform: "Facebook",
      handle: "@bytetech.export",
      displayName: "ByteTech FB · Global",
      dailyLimit: 20,
      sentToday: 3,
      dailyFriendLimit: 5,
      friendSentToday: 2,
      dailyDmLimit: 20,
      dmSentToday: 3,
      status: "正常",
      purchasedAt: now,
    },
    {
      id: "sa_fb_2",
      platform: "Facebook",
      handle: "@bytetech.trade",
      displayName: "ByteTech FB · Trade",
      dailyLimit: 20,
      sentToday: 0,
      dailyFriendLimit: 5,
      friendSentToday: 0,
      dailyDmLimit: 20,
      dmSentToday: 0,
      status: "养号中",
      purchasedAt: now,
    },
    // TikTok 预置 2 个
    {
      id: "sa_tt_1",
      platform: "TikTok",
      handle: "@bytetech_official",
      displayName: "ByteTech TT · Official",
      dailyLimit: 20,
      sentToday: 1,
      dailyFriendLimit: 5,
      friendSentToday: 1,
      dailyDmLimit: 20,
      dmSentToday: 2,
      status: "正常",
      purchasedAt: now,
    },
    {
      id: "sa_tt_2",
      platform: "TikTok",
      handle: "@bytetech_biz",
      displayName: "ByteTech TT · Biz",
      dailyLimit: 20,
      sentToday: 0,
      dailyFriendLimit: 5,
      friendSentToday: 0,
      dailyDmLimit: 20,
      dmSentToday: 0,
      status: "正常",
      purchasedAt: now,
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

export function getSocialAccounts(): SocialAccount[] {
  return cache;
}

/** 更新账号状态（用于一键恢复 / 转入养号） */
export function updateAccountStatus(id: string, status: SocialAccount["status"]) {
  const next = cache.map((a) => (a.id === id ? { ...a, status } : a));
  commit(next);
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

/** 购买后向池中追加 N 个账号 */
export function addPurchasedAccounts(
  platform: "Facebook" | "TikTok",
  quantity: number,
): SocialAccount[] {
  const now = new Date().toISOString();
  const existing = cache.filter((a) => a.platform === platform).length;
  const newOnes: SocialAccount[] = Array.from({ length: quantity }).map((_, i) => {
    const seq = existing + i + 1;
    const handle =
      platform === "Facebook"
        ? `@bytetech.fb${String(seq).padStart(3, "0")}`
        : `@bytetech_tt${String(seq).padStart(3, "0")}`;
    return {
      id: `sa_${platform === "Facebook" ? "fb" : "tt"}_${Date.now().toString(36)}_${i}`,
      platform,
      handle,
      displayName: `ByteTech ${platform} · #${seq}`,
      dailyLimit: 20,
      sentToday: 0,
      dailyFriendLimit: 5,
      friendSentToday: 0,
      dailyDmLimit: 20,
      dmSentToday: 0,
      status: "养号中",
      purchasedAt: now,
    };
  });
  commit([...newOnes, ...cache]);
  return newOnes;
}

/** 平台已购账号数 */
export function countAccountsByPlatform(
  list: SocialAccount[],
  platform: SocialPlatform,
): number {
  return list.filter((a) => a.platform === platform).length;
}

/** 平台今日加友剩余额度合计 */
export function friendRemaining(
  list: SocialAccount[],
  platform: "Facebook" | "TikTok",
): number {
  return list
    .filter((a) => a.platform === platform && a.status === "正常")
    .reduce(
      (s, a) => s + Math.max(0, (a.dailyFriendLimit ?? 5) - (a.friendSentToday ?? 0)),
      0,
    );
}
