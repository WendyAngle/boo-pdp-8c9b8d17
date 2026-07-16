import { useSyncExternalStore } from "react";

export type MailboxStatus = "正常" | "停用" | "异常";
export type MailboxEncryption = "SSL" | "TLS" | "STARTTLS" | "NONE";
export type MailboxScope = "team" | "personal";
export type MailboxProvider =
  | "Gmail"
  | "Outlook"
  | "腾讯企业邮"
  | "阿里企业邮"
  | "网易企业邮"
  | "自定义SMTP";

export interface Mailbox {
  id: string;
  email: string;
  displayName: string;
  provider: MailboxProvider;
  smtpHost: string;
  smtpPort: number;
  encryption: MailboxEncryption;
  username: string;
  password: string;
  signature?: string;
  dailyLimit: number;
  sentToday: number;
  status: MailboxStatus;
  isDefault: boolean;
  createdAt: string;
  lastTestedAt?: string;
  /** team = 企业共享（管理员维护）；personal = 个人邮箱（本人自助） */
  scope: MailboxScope;
  /** personal 必填：邮箱所属员工 id */
  ownerId?: string;
}

export const PROVIDER_PRESETS: Record<
  MailboxProvider,
  { smtpHost: string; smtpPort: number; encryption: MailboxEncryption }
> = {
  Gmail: { smtpHost: "smtp.gmail.com", smtpPort: 465, encryption: "SSL" },
  Outlook: { smtpHost: "smtp.office365.com", smtpPort: 587, encryption: "STARTTLS" },
  腾讯企业邮: { smtpHost: "smtp.exmail.qq.com", smtpPort: 465, encryption: "SSL" },
  阿里企业邮: { smtpHost: "smtp.mxhichina.com", smtpPort: 465, encryption: "SSL" },
  网易企业邮: { smtpHost: "smtp.qiye.163.com", smtpPort: 994, encryption: "SSL" },
  自定义SMTP: { smtpHost: "", smtpPort: 465, encryption: "SSL" },
};

const KEY = "boo:mailboxes:v1";
const SEED_FLAG = "boo:mailboxes:v2:seeded";

function read(): Mailbox[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      // v1 → v2 迁移：无 scope 视为团队邮箱
      return arr.map((m: Mailbox) => ({
        ...m,
        scope: m.scope ?? "team",
      }));
    }
  } catch {}
  return [];
}

function write(arr: Mailbox[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {}
}

function seed() {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(SEED_FLAG)) return;
  const now = new Date().toISOString();
  const seedData: Mailbox[] = [
    {
      id: makeId(),
      email: "outreach@bytetech.cn",
      displayName: "ByteTech 业务部",
      provider: "腾讯企业邮",
      ...PROVIDER_PRESETS["腾讯企业邮"],
      username: "outreach@bytetech.cn",
      password: "********",
      signature: "—\nByteTech Global Business\nhttps://bytetech.cn",
      dailyLimit: 200,
      sentToday: 27,
      status: "正常",
      isDefault: true,
      createdAt: now,
      lastTestedAt: now,
      scope: "team",
    },
    {
      id: makeId(),
      email: "marketing@bytetech.cn",
      displayName: "ByteTech 市场部",
      provider: "Gmail",
      ...PROVIDER_PRESETS.Gmail,
      username: "marketing@bytetech.cn",
      password: "********",
      signature: "",
      dailyLimit: 100,
      sentToday: 0,
      status: "停用",
      isDefault: false,
      createdAt: now,
      scope: "team",
    },
    {
      id: makeId(),
      email: "zhang.san@gmail.com",
      displayName: "张三（个人号）",
      provider: "Gmail",
      ...PROVIDER_PRESETS.Gmail,
      username: "zhang.san@gmail.com",
      password: "********",
      signature: "",
      dailyLimit: 50,
      sentToday: 8,
      status: "正常",
      isDefault: false,
      createdAt: now,
      lastTestedAt: now,
      scope: "personal",
      ownerId: "u_zhang",
    },
  ];
  write(seedData);
  window.localStorage.setItem(SEED_FLAG, "1");
}

seed();

let cache: Mailbox[] = read();
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version++;
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      cache = read();
      emit();
    }
  });
}

function commit(next: Mailbox[]) {
  cache = next;
  write(next);
  emit();
}

function makeId() {
  return `mb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useMailboxes(): Mailbox[] {
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

export function useUsableMailboxes(): Mailbox[] {
  const all = useMailboxes();
  return all.filter((m) => m.status === "正常");
}

export function getDefaultUsableMailbox(list: Mailbox[]): Mailbox | undefined {
  return list.find((m) => m.isDefault && m.status === "正常") ?? list.find((m) => m.status === "正常");
}

export function createMailbox(input: Omit<Mailbox, "id" | "createdAt" | "sentToday">): Mailbox {
  const isFirst = cache.length === 0;
  const next: Mailbox = {
    ...input,
    id: makeId(),
    createdAt: new Date().toISOString(),
    sentToday: 0,
    isDefault: isFirst ? true : input.isDefault,
  };
  let list = [next, ...cache];
  if (next.isDefault) list = list.map((m) => ({ ...m, isDefault: m.id === next.id }));
  commit(list);
  return next;
}

export function updateMailbox(id: string, patch: Partial<Mailbox>) {
  let list = cache.map((m) => (m.id === id ? { ...m, ...patch } : m));
  if (patch.isDefault) {
    list = list.map((m) => ({ ...m, isDefault: m.id === id }));
  }
  commit(list);
}

export function deleteMailbox(id: string) {
  const target = cache.find((m) => m.id === id);
  let list = cache.filter((m) => m.id !== id);
  // 若删掉的是默认，自动把第一个「正常」设为默认
  if (target?.isDefault) {
    const idx = list.findIndex((m) => m.status === "正常");
    if (idx >= 0) list = list.map((m, i) => ({ ...m, isDefault: i === idx }));
  }
  commit(list);
}

export function setDefaultMailbox(id: string) {
  const target = cache.find((m) => m.id === id);
  if (!target || target.status !== "正常") return false;
  commit(cache.map((m) => ({ ...m, isDefault: m.id === id })));
  return true;
}

export function setMailboxStatus(id: string, status: MailboxStatus) {
  let list = cache.map((m) => (m.id === id ? { ...m, status } : m));
  // 停用了默认邮箱，则取消默认并尝试自动指派
  const target = list.find((m) => m.id === id);
  if (target && target.status !== "正常" && target.isDefault) {
    list = list.map((m) => (m.id === id ? { ...m, isDefault: false } : m));
    const idx = list.findIndex((m) => m.status === "正常");
    if (idx >= 0) list = list.map((m, i) => ({ ...m, isDefault: i === idx }));
  }
  commit(list);
}

/** 模拟测试连接：1.2s，90% 成功 */
export function testMailbox(id: string): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const ok = Math.random() > 0.1;
      updateMailbox(id, {
        lastTestedAt: new Date().toISOString(),
        status: ok ? "正常" : "异常",
      });
      resolve({
        ok,
        message: ok ? "SMTP 连接测试成功" : "SMTP 连接失败：认证失败或服务器无响应",
      });
    }, 1200);
  });
}