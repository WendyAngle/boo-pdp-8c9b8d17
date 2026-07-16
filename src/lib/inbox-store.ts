import { useSyncExternalStore } from "react";
import {
  getAllLedger,
  useLedger,
  type LedgerEntry,
} from "@/lib/credits-ledger";
import { addSuppression } from "@/lib/suppressions-store";

/* -------------------- Types -------------------- */

export type AiIntent =
  | "interested"
  | "quote"
  | "reject"
  | "ooo"
  | "unsubscribe"
  | "complaint"
  | "other";

export type ThreadStatus =
  | "pending" // 待跟进（有未读或 AI 标为意向/询价）
  | "waiting_reply" // 我方已回复，等对方
  | "in_cadence" // 已加入自动序列
  | "snoozed"
  | "won" // 已成交
  | "lost" // 已流失
  | "suppressed";

export const INTENT_LABEL: Record<AiIntent, string> = {
  interested: "意向",
  quote: "询价",
  reject: "拒绝",
  ooo: "自动回复",
  unsubscribe: "退订请求",
  complaint: "投诉",
  other: "其他",
};

export const INTENT_COLOR: Record<AiIntent, string> = {
  interested: "bg-emerald-100 text-emerald-700 border-emerald-200",
  quote: "bg-sky-100 text-sky-700 border-sky-200",
  reject: "bg-slate-100 text-slate-700 border-slate-200",
  ooo: "bg-amber-100 text-amber-700 border-amber-200",
  unsubscribe: "bg-orange-100 text-orange-700 border-orange-200",
  complaint: "bg-rose-100 text-rose-700 border-rose-200",
  other: "bg-slate-100 text-slate-700 border-slate-200",
};

export const STATUS_LABEL: Record<ThreadStatus, string> = {
  pending: "待我回复",
  waiting_reply: "等客回复",
  in_cadence: "跟进中",
  snoozed: "已稍后处理",
  won: "已成交",
  lost: "已流失",
  suppressed: "已退订",
};

/** 关单原因（成交 / 流失） */
export type CloseOutcome = "won" | "lost";
export const CLOSE_OUTCOME_LABEL: Record<CloseOutcome, string> = {
  won: "已成交",
  lost: "已流失",
};

/* -------------------- Channels & groups (v2) -------------------- */

export type Channel =
  | "email"
  | "sms"
  | "whatsapp"
  | "telegram"
  | "facebook"
  | "tiktok";

export const CHANNEL_LABEL: Record<Channel, string> = {
  email: "邮件",
  sms: "短信",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

/** 会话客服窗口时长（小时）；无窗口概念的渠道为 undefined */
export const WINDOW_HOURS: Partial<Record<Channel, number>> = {
  whatsapp: 24,
  facebook: 24,
  tiktok: 48,
};

export const CHANNEL_COLOR: Record<Channel, string> = {
  email: "bg-violet-50 text-violet-700 border-violet-200",
  sms: "bg-sky-50 text-sky-700 border-sky-200",
  whatsapp: "bg-emerald-50 text-emerald-700 border-emerald-200",
  telegram: "bg-cyan-50 text-cyan-700 border-cyan-200",
  facebook: "bg-blue-50 text-blue-700 border-blue-200",
  tiktok: "bg-neutral-100 text-neutral-800 border-neutral-200",
};

export type GroupKind = "enterprise" | "contact";
export const GROUP_LABEL: Record<GroupKind, string> = {
  enterprise: "企业分组",
  contact: "人物分组",
};

/** 分组 SLA 配置（Phase 1 常量；管理页可覆盖但只影响 UI 视觉） */
export const GROUP_SLA: Record<GroupKind, { firstResponseMin: number; replyHour: number }> = {
  enterprise: { firstResponseMin: 30, replyHour: 8 },
  contact: { firstResponseMin: 20, replyHour: 4 },
};

export interface AssignmentEvent {
  id: string;
  from?: string;
  to?: string;
  reason?: string;
  crossGroup?: boolean;
  greetingSent?: boolean;
  at: string;
}

/** 演示用团队成员（Phase 1 mock；后续接入 /outreach/users） */
export interface TeamMember {
  id: string;
  name: string;
  avatarLetter: string;
  groups: GroupKind[];
  role?: "member" | "lead";
}

export const TEAM_MEMBERS: TeamMember[] = [
  { id: "u_zhang", name: "张三", avatarLetter: "张", groups: ["enterprise", "contact"], role: "lead" },
  { id: "u_li", name: "李四", avatarLetter: "李", groups: ["enterprise"] },
  { id: "u_wang", name: "王五", avatarLetter: "王", groups: ["contact"] },
  { id: "u_zhao", name: "赵六", avatarLetter: "赵", groups: ["contact"] },
  { id: "u_sun", name: "孙七", avatarLetter: "孙", groups: ["enterprise", "contact"] },
];

export function memberById(id?: string | null): TeamMember | undefined {
  if (!id) return undefined;
  return TEAM_MEMBERS.find((m) => m.id === id);
}

export function threadGroup(t: { targetKind: "enterprise" | "contact" }): GroupKind {
  return t.targetKind === "enterprise" ? "enterprise" : "contact";
}

/** 一条会话消息（我方发出 或 对方回复） */
export interface ThreadMessage {
  id: string;
  direction: "outbound" | "inbound";
  createdAt: string;
  fromName: string;
  fromAddress: string;
  subject?: string;
  content: string;
  aiGenerated?: boolean;
  /** 对方回复的中文译文（仅 inbound 且原文非中文时提供） */
  contentZh?: string;
  /** outbound 关联的 ledger id */
  ledgerId?: string;
  /** outbound 送达事件（模拟） */
  events?: Array<{ type: "delivered" | "opened" | "clicked"; at: string }>;
}

/** 会话的持久化元数据 */
interface ThreadMeta {
  threadId: string;
  status: ThreadStatus;
  snoozeUntil?: string;
  tags: string[];
  aiIntent?: AiIntent;
  assignee?: string;
  /** 分配给的员工 id（Phase 1 mock，见 TEAM_MEMBERS） */
  assigneeId?: string;
  /** 分配 / 转派事件时间线 */
  assignmentEvents?: AssignmentEvent[];
  /** WhatsApp / Facebook / TikTok 客服窗口截止时间 */
  windowExpiresAt?: string;
  /** snooze 到期自动唤醒的时间点，用于列表高亮 */
  wokenAt?: string;
  /** 是否被标为 star */
  starred?: boolean;
  /** 未读的 inbound 数量 */
  unread: number;
  /** 手动追加的跟进/回复 */
  extraMessages: ThreadMessage[];
  /** inbound 回复（含 seed 与后续追加） */
  inboundMessages: ThreadMessage[];
  /** 待办 */
  tasks: Array<{ id: string; title: string; dueAt?: string; done: boolean }>;
  /** 是否已加入跟进序列 */
  cadenceEnrolled?: boolean;
  /** 人工接管标记：当 AI/自动流程无法胜任时，由人工员工显式接管；接管后会话从「人工接管」筛选中移除，形成闭环 */
  humanTakeover?: {
    at: string;
    byId: string;
    byName: string;
    reason?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Thread {
  id: string;
  targetKind: "enterprise" | "contact";
  targetId: string;
  targetName: string;
  parentRef?: { id: string; name: string };
  /** 会话所属渠道 */
  channel: Channel;
  /** 对方地址（收件邮箱） */
  counterpartyAddress: string;
  /** 我方 sender */
  senderEmail?: string;
  messages: ThreadMessage[];
  meta: ThreadMeta;
  lastAt: string;
  lastPreview: string;
  lastDirection: "outbound" | "inbound";
}

/* -------------------- Storage -------------------- */

const META_KEY = "boo:inbox:meta:v1";
const SEED_FLAG = "boo:inbox:seed:v7";
/** Phase 1 演示：当前登录员工，需与 conversations.tsx 中的 CURRENT_TEAM_USER_ID 保持一致 */
const DEMO_CURRENT_USER = "u_zhang";

function readMeta(): Record<string, ThreadMeta> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(META_KEY);
    if (!raw) return {};
    const j = JSON.parse(raw);
    if (j && typeof j === "object") {
      // 迁移：旧版 "handled" 语义不明，默认视为"已流失"（用户可在 UI 改判为"已成交"）
      const rec = j as Record<string, ThreadMeta>;
      for (const k in rec) {
        const m = rec[k];
        if ((m.status as string) === "handled") m.status = "lost";
      }
      return rec;
    }
  } catch {}
  return {};
}

function writeMeta(m: Record<string, ThreadMeta>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {}
}

let metaStore: Record<string, ThreadMeta> = readMeta();
let version = 0;
const listeners = new Set<() => void>();
function emit() {
  version++;
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getVersion() {
  return version;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === META_KEY) {
      metaStore = readMeta();
      emit();
    }
  });
}

function commit() {
  writeMeta(metaStore);
  emit();
}

function makeId(p: string) {
  return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* -------------------- Thread key -------------------- */

/** 会话 id：企业/联系人 + 对方邮箱地址 */
function threadKey(r: LedgerEntry): string | null {
  if (r.kind !== "reach" || !r.detail) return null;
  if (r.channel === "email")
    return `t:email:${r.targetKind}:${r.targetId}:${r.detail.toLowerCase()}`;
  if (r.channel === "phone")
    return `t:sms:${r.targetKind}:${r.targetId}:${r.detail}`;
  return null;
}

/** 供外部（触达任务列表 → 收件箱 反查）计算 threadKey */
export function threadKeyFor(r: LedgerEntry): string | null {
  return threadKey(r);
}

function ensureMeta(threadId: string, createdAt: string): ThreadMeta {
  let m = metaStore[threadId];
  if (!m) {
    m = {
      threadId,
      status: "pending",
      tags: [],
      unread: 0,
      extraMessages: [],
      inboundMessages: [],
      tasks: [],
      createdAt,
      updatedAt: createdAt,
    };
    metaStore[threadId] = m;
  }
  return m;
}

/* -------------------- Reply seed data -------------------- */

type ReplyBody = { body: string; zh?: string };

/** 若原文本身是中文，则不再重复提供 zh 译文 */
function isChinese(s: string) {
  return /[\u4e00-\u9fa5]/.test(s);
}

const INTENT_TEMPLATES: Array<{ intent: AiIntent; bodies: ReplyBody[] }> = [
  {
    intent: "interested",
    bodies: [
      {
        body: "Thanks for reaching out — this actually aligns with what we're evaluating this quarter. Could you share a short deck and pricing tiers?",
        zh: "感谢来信 —— 这与我们本季度正在评估的方向正好吻合。可否发一份简短的资料和分档报价？",
      },
      { body: "很感兴趣，方便本周内做个 30 分钟的电话会吗？也请把资料一并发一下。" },
      {
        body: "Sounds interesting. Please loop in our procurement lead — cc'd. What are the typical MOQs?",
        zh: "看起来不错。已将我们的采购负责人加入抄送，请一并沟通。你们通常的最小起订量是多少？",
      },
    ],
  },
  {
    intent: "quote",
    bodies: [
      {
        body: "Could you send a formal quote for 5,000 units, delivered CIF Rotterdam? Also, lead time please.",
        zh: "请就 5,000 件、CIF 鹿特丹交付方式提供正式报价，同时请告知交货周期。",
      },
      { body: "麻烦按 20HQ 报个 FOB 深圳的价，含目录里 SKU-A 和 SKU-C，谢谢。" },
    ],
  },
  {
    intent: "ooo",
    bodies: [
      {
        body: "I'm out of office until Monday with limited email access. For urgent matters please contact my colleague.",
        zh: "我正在休假，下周一才会回来，期间邮件查看有限。如有紧急事项，请联系我的同事。",
      },
      { body: "我正在休假，将于下周一回复邮件，紧急事项请联系同事 David。" },
    ],
  },
  {
    intent: "reject",
    bodies: [
      {
        body: "Thanks but we already work with an existing supplier and are not looking to switch this year.",
        zh: "感谢来信，我们已有长期合作的供应商，今年暂不打算更换，祝好。",
      },
      { body: "感谢来信，我们暂无相关采购计划，祝好。" },
    ],
  },
  {
    intent: "unsubscribe",
    bodies: [{ body: "Please remove me from your list. Thanks.", zh: "请将我从你们的邮件列表中移除，谢谢。" }],
  },
  {
    intent: "complaint",
    bodies: [
      {
        body: "This is the third email this week — please stop contacting us or I will report as spam.",
        zh: "这已经是本周的第三封邮件 —— 请停止联系我们，否则我将把邮件举报为垃圾邮件。",
      },
    ],
  },
];

/** SMS 场景下的短回复模板（比邮件更简短，含 STOP 关键字） */
const SMS_INTENT_TEMPLATES: Array<{ intent: AiIntent; bodies: ReplyBody[] }> = [
  {
    intent: "interested",
    bodies: [
      { body: "Interested — send details please.", zh: "有兴趣，请把详细资料发给我。" },
      { body: "有兴趣，请发资料到我邮箱。" },
      { body: "Ok, share your catalog.", zh: "好的，把你们的产品目录发过来。" },
    ],
  },
  {
    intent: "quote",
    bodies: [
      { body: "Send price for 5k units.", zh: "请报 5,000 件的价格。" },
      { body: "报个 FOB 深圳的价" },
    ],
  },
  {
    intent: "ooo",
    bodies: [
      { body: "On leave, back Mon.", zh: "正在休假，下周一回。" },
      { body: "在休假，下周一联系" },
    ],
  },
  {
    intent: "reject",
    bodies: [
      { body: "No thanks.", zh: "不需要，谢谢。" },
      { body: "暂无采购计划" },
    ],
  },
  {
    intent: "unsubscribe",
    bodies: [
      { body: "STOP", zh: "退订" },
      { body: "退订" },
    ],
  },
  { intent: "complaint", bodies: [{ body: "Stop texting me!", zh: "不要再给我发短信了！" }] },
];

function pickSmsIntent(seed: number): { intent: AiIntent; body: string; zh?: string } {
  // SMS 权重：意向 20% / 询价 15% / OOO 10% / 拒绝 30% / 退订 20% / 投诉 5%
  const w = [20, 35, 45, 75, 95, 100];
  const kind = ["interested", "quote", "ooo", "reject", "unsubscribe", "complaint"] as const;
  const p = seed % 100;
  const idx = w.findIndex((x) => p < x);
  const intent = kind[Math.max(0, idx)];
  const tpl = SMS_INTENT_TEMPLATES.find((t) => t.intent === intent)!;
  const pick = tpl.bodies[seed % tpl.bodies.length];
  return { intent, body: pick.body, zh: pick.zh };
}

function pickIntent(seed: number): { intent: AiIntent; body: string; zh?: string } {
  // 权重：意向 30% / 询价 25% / OOO 15% / 拒绝 20% / 退订 7% / 投诉 3%
  const w = [30, 55, 70, 90, 97, 100];
  const kind = ["interested", "quote", "ooo", "reject", "unsubscribe", "complaint"] as const;
  const p = seed % 100;
  const idx = w.findIndex((x) => p < x);
  const intent = kind[Math.max(0, idx)];
  const tpl = INTENT_TEMPLATES.find((t) => t.intent === intent)!;
  const pick = tpl.bodies[seed % tpl.bodies.length];
  return { intent, body: pick.body, zh: pick.zh };
}

/** 首次访问收件箱时，对已有邮件触达按 ~40% 概率补上一条对方回复 */
function seedInboundIfNeeded(entries: LedgerEntry[]) {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(SEED_FLAG)) return;
  let changed = false;
  for (const r of entries) {
    const key = threadKey(r);
    if (!key) continue;
    const m = ensureMeta(key, r.createdAt);
    if (m.inboundMessages.length > 0) continue;
    const h = hashStr(r.id);
    const isSms = r.channel === "phone";
    // SMS 回复率更低（~25%），邮件 ~40%
    const threshold = isSms ? 25 : 40;
    if (h % 100 < threshold) {
      const { intent, body, zh } = isSms ? pickSmsIntent(h) : pickIntent(h);
      // 回复时间：发送后 4~72 小时
      const sentAt = new Date(r.createdAt).getTime();
      const delayH = 4 + (h % 68);
      const replyAt = new Date(sentAt + delayH * 3600_000).toISOString();
      if (new Date(replyAt).getTime() > Date.now()) continue;
      m.inboundMessages.push({
        id: makeId("in"),
        direction: "inbound",
        createdAt: replyAt,
        fromName: r.parentRef?.name
          ? `${r.targetName} · ${r.parentRef.name}`
          : r.targetName,
        fromAddress: r.detail || "",
        subject: r.subject ? `Re: ${r.subject}` : undefined,
        content: body,
        contentZh: zh && !isChinese(body) ? zh : undefined,
      });
      m.aiIntent = intent;
      m.unread = 1;
      // 退订 / 投诉 → 自动抑制并加入退订名单；OOO → snooze 3 天；意向/询价 → 待跟进；拒绝 → 已处理
      if (intent === "unsubscribe" || intent === "complaint") {
        m.status = "suppressed";
        m.unread = 0;
        // SMS 场景 STOP 关键字 → 加入手机号退订名单
        if (isSms && r.detail) {
          addSuppression("phone", r.detail, intent === "unsubscribe" ? "STOP 关键字" : "投诉");
        } else if (!isSms && r.detail) {
          addSuppression("email", r.detail, intent === "unsubscribe" ? "退订请求" : "投诉");
        }
      } else if (intent === "ooo") {
        m.status = "snoozed";
        m.snoozeUntil = new Date(
          new Date(replyAt).getTime() + 3 * 24 * 3600_000,
        ).toISOString();
      } else if (intent === "reject") {
        m.status = "lost";
        m.unread = 0;
      } else {
        m.status = "pending";
      }
      m.updatedAt = replyAt;
      changed = true;
    }
  }
  // 演示数据：把前若干条"待跟进"会话分派给当前员工，避免"我的待办"视图为空
  let assigned = 0;
  for (const r of entries) {
    if (assigned >= 5) break;
    const key = threadKey(r);
    if (!key) continue;
    const m = metaStore[key];
    if (!m) continue;
    if (m.status !== "pending") continue;
    if (m.assigneeId) continue;
    if (m.inboundMessages.length === 0) continue;
    m.assigneeId = DEMO_CURRENT_USER;
    m.assignee = memberById(DEMO_CURRENT_USER)?.name;
    assigned++;
    changed = true;
  }
  // 演示数据：分派若干条给其他成员，体现多员工分布
  const otherMembers = TEAM_MEMBERS.filter((m) => m.id !== DEMO_CURRENT_USER);
  let otherAssigned = 0;
  for (const r of entries) {
    if (otherAssigned >= 4) break;
    const key = threadKey(r);
    if (!key) continue;
    const m = metaStore[key];
    if (!m) continue;
    if (m.status !== "pending") continue;
    if (m.assigneeId) continue;
    if (m.inboundMessages.length === 0) continue;
    const pick = otherMembers[otherAssigned % otherMembers.length];
    m.assigneeId = pick.id;
    m.assignee = pick.name;
    otherAssigned++;
    changed = true;
  }
  // 演示数据：生命周期多样化 —— 等待回复 / 已成交 / 已流失 / 已抑制 各若干条，
  // 让"询盘与回复"的状态筛选每项都有真实数据可看。
  const lifecyclePlan: { status: ThreadStatus; count: number; clearUnread?: boolean }[] = [
    { status: "waiting_reply", count: 2 },
    { status: "won", count: 2, clearUnread: true },
    { status: "lost", count: 1, clearUnread: true },
    { status: "suppressed", count: 1, clearUnread: true },
    { status: "snoozed", count: 1 },
  ];
  for (const plan of lifecyclePlan) {
    let n = 0;
    for (const r of entries) {
      if (n >= plan.count) break;
      const key = threadKey(r);
      if (!key) continue;
      const m = metaStore[key];
      if (!m) continue;
      if (m.status !== "pending") continue;
      if (m.inboundMessages.length === 0) continue;
      // 等待回复：追加一条我方回复，模拟已回复对方
      if (plan.status === "waiting_reply") {
        const last = m.inboundMessages[m.inboundMessages.length - 1];
        const replyAt = new Date(
          new Date(last.createdAt).getTime() + 30 * 60_000,
        ).toISOString();
        m.extraMessages.push({
          id: makeId("ob_seed"),
          direction: "outbound",
          createdAt: replyAt,
          fromName: "你",
          fromAddress: r.senderEmail || "",
          subject: r.subject ? `Re: ${r.subject}` : undefined,
          content:
            "Thanks for your message — we've forwarded the details to our sales team and will follow up shortly with pricing & availability.",
        });
        m.updatedAt = replyAt;
        m.unread = 0;
      }
      if (plan.status === "snoozed") {
        m.snoozeUntil = new Date(Date.now() + 2 * 24 * 3600_000).toISOString();
      }
      m.status = plan.status;
      if (plan.clearUnread) m.unread = 0;
      n++;
      changed = true;
    }
  }
  if (changed) writeMeta(metaStore);
  window.localStorage.setItem(SEED_FLAG, "1");
}

/* -------------------- Derive threads -------------------- */

function buildThreads(entries: LedgerEntry[]): Thread[] {
  seedInboundIfNeeded(entries);
  const map = new Map<string, Thread>();
  // ledger 已按时间倒序，我们要按线索归并
  for (let i = entries.length - 1; i >= 0; i--) {
    const r = entries[i];
    const key = threadKey(r);
    if (!key) continue;
    const meta = ensureMeta(key, r.createdAt);
    let t = map.get(key);
    if (!t) {
      t = {
        id: key,
        targetKind: r.targetKind,
        targetId: r.targetId,
        targetName: r.targetName,
        parentRef: r.parentRef,
        channel: r.channel === "phone" ? "sms" : "email",
        counterpartyAddress: r.detail || "",
        senderEmail: r.senderEmail,
        messages: [],
        meta,
        lastAt: r.createdAt,
        lastPreview: "",
        lastDirection: "outbound",
      };
      map.set(key, t);
    }
    // outbound 事件（模拟）：15 分钟后 delivered；30% opened；10% clicked
    const sent = new Date(r.createdAt).getTime();
    const events: ThreadMessage["events"] = [];
    if (Date.now() - sent > 15 * 60_000)
      events.push({ type: "delivered", at: new Date(sent + 15 * 60_000).toISOString() });
    const h = hashStr(r.id);
    if (h % 100 < 55)
      events.push({ type: "opened", at: new Date(sent + 60 * 60_000).toISOString() });
    if (h % 100 < 18)
      events.push({ type: "clicked", at: new Date(sent + 90 * 60_000).toISOString() });
    t.messages.push({
      id: `ob_${r.id}`,
      direction: "outbound",
      createdAt: r.createdAt,
      fromName: "你",
      fromAddress: r.senderEmail || "",
      subject: r.subject,
      content: r.content || "(此邮件无正文快照)",
      aiGenerated: r.aiGenerated,
      ledgerId: r.id,
      events,
    });
    if (r.senderEmail && !t.senderEmail) t.senderEmail = r.senderEmail;
  }
  // 追加 inbound + extra
  for (const t of map.values()) {
    const meta = t.meta;
    for (const im of meta.inboundMessages) t.messages.push(im);
    for (const em of meta.extraMessages) t.messages.push(em);
    t.messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const last = t.messages[t.messages.length - 1];
    if (last) {
      t.lastAt = last.createdAt;
      t.lastDirection = last.direction;
      t.lastPreview = last.content.slice(0, 120);
    }
    // 到期解 snooze
    if (meta.status === "snoozed" && meta.snoozeUntil && new Date(meta.snoozeUntil).getTime() < Date.now()) {
      meta.status = "pending";
      meta.snoozeUntil = undefined;
      meta.wokenAt = new Date().toISOString();
    }
  }
  return Array.from(map.values()).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/* -------------------- Hooks -------------------- */

function useMetaVersion() {
  useSyncExternalStore(subscribe, getVersion, getVersion);
}

export function useThreads(): Thread[] {
  useMetaVersion();
  const entries = useLedger();
  const all = [...buildThreads(entries), ...getDemoSocialThreads()];
  // 询盘与回复模块只呈现"已有客户回复"的会话——即包含至少一条 inbound 消息。
  // 仅发出、尚未收到回复的触达在「触达」模块跟进，不进入询盘视图。
  const withReply = all.filter((t) => t.meta.inboundMessages.length > 0);
  return sortByUrgency(withReply);
}

export function useThread(id: string): Thread | undefined {
  const list = useThreads();
  return list.find((t) => t.id === id);
}

export function getThreadsSnapshot(): Thread[] {
  const all = [...buildThreads(getAllLedger()), ...getDemoSocialThreads()];
  return sortByUrgency(all.filter((t) => t.meta.inboundMessages.length > 0));
}

/**
 * 默认排序：SLA 紧急度优先 → 最新更新
 * 优先级：逾期 > 即将超时 > 有 SLA 未风险 > 无 SLA / 已处理
 * 组内：逾期与即将超时按剩余时间升序（最紧急在前）；其余按 lastAt 降序
 */
function sortByUrgency(list: Thread[]): Thread[] {
  const scored = list.map((t) => {
    const sla = slaInfo(t);
    let bucket = 3;
    if (sla?.overdue) bucket = 0;
    else if (sla?.approaching) bucket = 1;
    else if (sla) bucket = 2;
    return { t, bucket, leftMs: sla?.leftMs ?? Number.POSITIVE_INFINITY };
  });
  scored.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket - b.bucket;
    if (a.bucket <= 1) return a.leftMs - b.leftMs; // 紧急桶：最紧急在前
    return b.t.lastAt.localeCompare(a.t.lastAt);
  });
  return scored.map((s) => s.t);
}

export interface InboxCounts {
  all: number;
  unread: number;
  pending: number;
  waiting: number;
  won: number;
  lost: number;
  snoozed: number;
  suppressed: number;
  hasReply: number;
  noReply: number;
  bounced: number;
  unassigned: number;
}

export function useInboxCounts(): InboxCounts {
  const list = useThreads();
  const c: InboxCounts = {
    all: list.length,
    unread: 0,
    pending: 0,
    waiting: 0,
    won: 0,
    lost: 0,
    snoozed: 0,
    suppressed: 0,
    hasReply: 0,
    noReply: 0,
    bounced: 0,
    unassigned: 0,
  };
  for (const t of list) {
    if (t.meta.unread > 0) c.unread++;
    if (t.meta.status === "pending") c.pending++;
    if (t.meta.status === "waiting_reply") c.waiting++;
    if (t.meta.status === "won") c.won++;
    if (t.meta.status === "lost") c.lost++;
    if (t.meta.status === "snoozed") c.snoozed++;
    if (t.meta.status === "suppressed") c.suppressed++;
    if (t.meta.inboundMessages.length > 0) c.hasReply++;
    else c.noReply++;
    if (!t.meta.assigneeId) c.unassigned++;
  }
  return c;
}

/** 供侧边栏轻量订阅未读 + 待跟进 徽标 */
export function useSidebarBadge(): { unread: number; pending: number } {
  const list = useThreads();
  let unread = 0;
  let pending = 0;
  for (const t of list) {
    if (t.meta.unread > 0) unread++;
    if (t.meta.status === "pending") pending++;
  }
  return { unread, pending };
}

/** 取某企业/联系人的最新会话（用于详情页胶囊卡） */
export function useLatestThreadFor(
  targetKind: "enterprise" | "contact",
  targetId: string,
): Thread | undefined {
  const list = useThreads();
  return list.find((t) => t.targetKind === targetKind && t.targetId === targetId);
}

/* -------------------- Actions -------------------- */

export function markThreadRead(id: string) {
  const m = metaStore[id];
  if (!m || m.unread === 0) return;
  m.unread = 0;
  m.updatedAt = new Date().toISOString();
  commit();
}

export function snoozeThread(id: string, ms: number) {
  const m = metaStore[id];
  if (!m) return;
  m.status = "snoozed";
  m.snoozeUntil = new Date(Date.now() + ms).toISOString();
  m.unread = 0;
  m.updatedAt = new Date().toISOString();
  commit();
}

export function closeThread(id: string, outcome: CloseOutcome) {
  const m = metaStore[id];
  if (!m) return;
  m.status = outcome;
  m.unread = 0;
  m.updatedAt = new Date().toISOString();
  commit();
}

/** 从"已成交/已流失"恢复到待跟进 */
export function reopenThread(id: string) {
  const m = metaStore[id];
  if (!m) return;
  m.status = "pending";
  m.updatedAt = new Date().toISOString();
  commit();
}

export function toggleStar(id: string) {
  const m = metaStore[id];
  if (!m) return;
  m.starred = !m.starred;
  commit();
}

export function updateIntent(id: string, intent: AiIntent) {
  const m = metaStore[id];
  if (!m) return;
  m.aiIntent = intent;
  m.updatedAt = new Date().toISOString();
  commit();
}

export function addTag(id: string, tag: string) {
  const m = metaStore[id];
  if (!m) return;
  if (!m.tags.includes(tag)) m.tags.push(tag);
  commit();
}

export function removeTag(id: string, tag: string) {
  const m = metaStore[id];
  if (!m) return;
  m.tags = m.tags.filter((t) => t !== tag);
  commit();
}

export function enrollCadence(id: string, enrolled = true) {
  const m = metaStore[id];
  if (!m) return;
  m.cadenceEnrolled = enrolled;
  m.status = enrolled ? "in_cadence" : "pending";
  m.updatedAt = new Date().toISOString();
  commit();
}

/**
 * 人工接管闭环：
 * - 开启：写入接管标记；未分配则自动分配给当前员工并写入分配事件（原因=人工接管）；
 *   暂停跟进序列；清零未读；状态置为待跟进，便于员工立即回复。
 * - 撤销：清除接管标记，其它状态维持不变，交回自动流程。
 */
export function setHumanTakeover(
  id: string,
  on: boolean,
  opts?: { userId?: string; reason?: string },
) {
  const m = metaStore[id];
  if (!m) return;
  const now = new Date().toISOString();
  if (on) {
    const userId = opts?.userId || DEMO_CURRENT_USER;
    const member = memberById(userId);
    m.humanTakeover = {
      at: now,
      byId: userId,
      byName: member?.name || "当前员工",
      reason: opts?.reason,
    };
    if (!m.assigneeId) {
      const from = m.assigneeId;
      m.assigneeId = userId;
      m.assignee = member?.name;
      if (!m.assignmentEvents) m.assignmentEvents = [];
      m.assignmentEvents.push({
        id: makeId("ae"),
        from,
        to: userId,
        reason: opts?.reason || "人工接管",
        at: now,
      });
    }
    if (m.cadenceEnrolled) m.cadenceEnrolled = false;
    if (m.status === "in_cadence" || m.status === "snoozed") m.status = "pending";
    m.unread = 0;
  } else {
    m.humanTakeover = undefined;
  }
  m.updatedAt = now;
  commit();
}

export function suppressThread(id: string) {
  const m = metaStore[id];
  if (!m) return;
  m.status = "suppressed";
  m.unread = 0;
  m.updatedAt = new Date().toISOString();
  commit();
}

export function addTaskForThread(
  id: string,
  title: string,
  dueAt?: string,
) {
  const m = metaStore[id];
  if (!m) return;
  m.tasks.push({ id: makeId("tk"), title, dueAt, done: false });
  m.updatedAt = new Date().toISOString();
  commit();
}

export function toggleTask(id: string, taskId: string) {
  const m = metaStore[id];
  if (!m) return;
  const t = m.tasks.find((x) => x.id === taskId);
  if (t) t.done = !t.done;
  commit();
}

export function sendReply(input: {
  threadId: string;
  content: string;
  fromAddress: string;
  fromName?: string;
  subject?: string;
  aiGenerated?: boolean;
}) {
  const m = metaStore[input.threadId];
  if (!m) return;
  const now = new Date().toISOString();
  m.extraMessages.push({
    id: makeId("ob"),
    direction: "outbound",
    createdAt: now,
    fromName: input.fromName || "你",
    fromAddress: input.fromAddress,
    subject: input.subject,
    content: input.content,
    aiGenerated: input.aiGenerated,
    events: [{ type: "delivered", at: now }],
  });
  m.status = "waiting_reply";
  m.unread = 0;
  m.updatedAt = now;
  commit();
}

/* -------------------- Snooze presets -------------------- */

export const SNOOZE_PRESETS: Array<{ label: string; ms: number }> = [
  { label: "1 小时后", ms: 60 * 60_000 },
  { label: "明早 9:00", ms: nextMorningMs() },
  { label: "3 天后", ms: 3 * 24 * 3600_000 },
  { label: "下周一 9:00", ms: nextMondayMs() },
];
function nextMorningMs() {
  const d = new Date();
  const n = new Date(d);
  n.setDate(d.getDate() + 1);
  n.setHours(9, 0, 0, 0);
  return n.getTime() - d.getTime();
}
function nextMondayMs() {
  const d = new Date();
  const n = new Date(d);
  const day = d.getDay();
  const add = ((8 - day) % 7) || 7;
  n.setDate(d.getDate() + add);
  n.setHours(9, 0, 0, 0);
  return n.getTime() - d.getTime();
}

/* -------------------- Reset for dev/demo -------------------- */

export function resetInboxMeta() {
  metaStore = {};
  writeMeta(metaStore);
  if (typeof window !== "undefined") window.localStorage.removeItem(SEED_FLAG);
  emit();
}

/* -------------------- Assign (v2) -------------------- */

export function assignThread(
  id: string,
  userId: string | null,
  opts?: { reason?: string; crossGroup?: boolean; sendGreeting?: boolean },
) {
  const m = metaStore[id];
  if (!m) return;
  const from = m.assigneeId;
  m.assigneeId = userId ?? undefined;
  m.assignee = userId ? memberById(userId)?.name : undefined;
  const now = new Date().toISOString();
  m.updatedAt = now;
  if (!m.assignmentEvents) m.assignmentEvents = [];
  m.assignmentEvents.push({
    id: makeId("ae"),
    from,
    to: userId ?? undefined,
    reason: opts?.reason,
    crossGroup: opts?.crossGroup,
    greetingSent: opts?.sendGreeting,
    at: now,
  });
  if (opts?.sendGreeting && userId) {
    m.extraMessages.push({
      id: makeId("ob"),
      direction: "outbound",
      createdAt: now,
      fromName: memberById(userId)?.name || "你",
      fromAddress: "",
      content: `Hi, ${memberById(userId)?.name ?? "客服"} 接手您的会话，后续由我为您跟进，请随时提问。`,
      events: [{ type: "delivered", at: now }],
    });
  }
  commit();
}

/** 从事件历史中提取该会话上一次的跟进人（去重、最近优先） */
export function previousAssigneeIds(threadId: string): string[] {
  const m = metaStore[threadId];
  if (!m?.assignmentEvents) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = m.assignmentEvents.length - 1; i >= 0; i--) {
    const to = m.assignmentEvents[i].to;
    if (to && !seen.has(to) && to !== m.assigneeId) {
      seen.add(to);
      out.push(to);
    }
  }
  return out;
}

/** 计算 SLA 状态：基于最后一条 inbound 时间 + 分组首响阈值 */
export function slaInfo(t: Thread): {
  deadlineMs: number;
  leftMs: number;
  overdue: boolean;
  approaching: boolean;
} | null {
  if (
    t.meta.status === "won" ||
    t.meta.status === "lost" ||
    t.meta.status === "suppressed" ||
    t.meta.status === "snoozed"
  )
    return null;
  const lastIn = [...t.messages].reverse().find((m) => m.direction === "inbound");
  if (!lastIn) return null;
  const cfg = GROUP_SLA[threadGroup(t)];
  // 已分配后按"每次回复 SLA"；未分配按"首响 SLA"
  const budgetMs = t.meta.assigneeId
    ? cfg.replyHour * 3600_000
    : cfg.firstResponseMin * 60_000;
  const deadlineMs = new Date(lastIn.createdAt).getTime() + budgetMs;
  const leftMs = deadlineMs - Date.now();
  return {
    deadlineMs,
    leftMs,
    overdue: leftMs < 0,
    approaching: leftMs >= 0 && leftMs < budgetMs * 0.2,
  };
}

/* -------------------- Demo social threads (Phase 1 mock) -------------------- */

interface DemoSeed {
  id: string;
  channel: Channel;
  targetKind: "enterprise" | "contact";
  targetName: string;
  parentRef?: { id: string; name: string };
  counterparty: string;
  lastInbound: string;
  lastInboundZh?: string;
  hoursAgo: number;
  /** 剩余客服窗口小时数（覆盖默认计算） */
  windowLeftHours?: number | null;
  aiIntent?: AiIntent;
  assigneeId?: string;
  tags?: string[];
}

const DEMO_SEEDS: DemoSeed[] = [
  {
    id: "demo:wa:1",
    channel: "whatsapp",
    targetKind: "contact",
    targetName: "Anna Müller",
    parentRef: { id: "demo-ent-1", name: "Bosch GmbH" },
    counterparty: "+491701234567",
    lastInbound: "Hi, could you send the pricing PDF for SKU-A?",
    lastInboundZh: "你好，可否发一份 SKU-A 的报价 PDF 给我？",
    hoursAgo: 2,
    aiIntent: "quote",
    tags: ["高意向"],
  },
  {
    id: "demo:wa:2",
    channel: "whatsapp",
    targetKind: "enterprise",
    targetName: "Rakuten Global",
    counterparty: "+81901234567",
    lastInbound: "こんにちは、サンプル送付は可能ですか？",
    lastInboundZh: "你好，请问可以寄样品吗？",
    hoursAgo: 3,
    windowLeftHours: null, // 窗口已过期
    aiIntent: "interested",
    assigneeId: "u_li",
  },
  {
    id: "demo:tg:1",
    channel: "telegram",
    targetKind: "contact",
    targetName: "Ivan Petrov",
    parentRef: { id: "demo-ent-2", name: "TechnoPolymer LLC" },
    counterparty: "@ivanp",
    lastInbound: "Interested, please share catalog.",
    lastInboundZh: "有兴趣，请把产品目录发给我。",
    hoursAgo: 5,
    aiIntent: "interested",
  },
  {
    id: "demo:fb:1",
    channel: "facebook",
    targetKind: "contact",
    targetName: "María López",
    parentRef: { id: "demo-ent-3", name: "Grupo Andino" },
    counterparty: "psid:1234567890",
    lastInbound: "¿Cuál es el precio FOB Shanghai?",
    lastInboundZh: "FOB 上海的价格是多少？",
    hoursAgo: 10,
    aiIntent: "quote",
  },
  {
    id: "demo:tt:1",
    channel: "tiktok",
    targetKind: "contact",
    targetName: "@sofia_home",
    counterparty: "openid:tt_9876",
    lastInbound: "Do you ship to US?",
    lastInboundZh: "你们发货到美国吗？",
    hoursAgo: 2,
    aiIntent: "interested",
    assigneeId: "u_wang",
  },
  // -------- Email replies (3) --------
  {
    id: "demo:em:1",
    channel: "email",
    targetKind: "contact",
    targetName: "James Carter",
    parentRef: { id: "demo-ent-4", name: "Carter & Sons Ltd." },
    counterparty: "james.carter@carterandsons.co.uk",
    lastInbound:
      "Thanks for the quotation. Could you confirm MOQ for SKU-B and the lead time if we order 5,000 pcs? We'd also need CE certificates.",
    lastInboundZh:
      "感谢报价。请确认 SKU-B 的起订量，以及订购 5,000 件的交期。我们同时需要 CE 认证文件。",
    hoursAgo: 4,
    aiIntent: "quote",
    tags: ["高意向", "待报价"],
  },
  {
    id: "demo:em:2",
    channel: "email",
    targetKind: "enterprise",
    targetName: "Nordic Retail AB",
    counterparty: "purchasing@nordicretail.se",
    lastInbound:
      "Hello, we received your samples last week. Quality looks good. Please send the FOB Shanghai price list and payment terms for a trial order.",
    lastInboundZh:
      "你好，上周已收到样品，品质不错。请发送 FOB 上海价格表及首单付款条件。",
    hoursAgo: 20,
    aiIntent: "interested",
    assigneeId: "u_li",
    tags: ["试单"],
  },
  {
    id: "demo:em:3",
    channel: "email",
    targetKind: "contact",
    targetName: "Ahmed Al-Farsi",
    parentRef: { id: "demo-ent-5", name: "Gulf Trading Co." },
    counterparty: "ahmed@gulftrading.ae",
    lastInbound:
      "Please share the updated catalog in PDF. We are planning an order before end of Q3.",
    lastInboundZh:
      "请发送最新的 PDF 产品目录。我们计划在三季度末前下单。",
    hoursAgo: 6,
    aiIntent: "interested",
  },
  // -------- SMS replies (2) --------
  {
    id: "demo:sms:1",
    channel: "sms",
    targetKind: "contact",
    targetName: "David Kim",
    parentRef: { id: "demo-ent-6", name: "Kim Electronics" },
    counterparty: "+8210123456789",
    lastInbound: "Received. Please call me tomorrow 10am KST to discuss pricing.",
    lastInboundZh: "已收到，请明早 10 点（韩国时间）致电洽谈价格。",
    hoursAgo: 3,
    aiIntent: "quote",
    tags: ["待回电"],
  },
  {
    id: "demo:sms:2",
    channel: "sms",
    targetKind: "contact",
    targetName: "Laura Bianchi",
    parentRef: { id: "demo-ent-7", name: "Milano Home" },
    counterparty: "+393471234567",
    lastInbound: "Ok grazie, invia proforma per 200 pezzi SKU-C.",
    lastInboundZh: "好的，谢谢，请发送 200 件 SKU-C 的形式发票。",
    hoursAgo: 1,
    aiIntent: "quote",
  },
  // -------- 非高意向样本：让"高意向"过滤不再等于"全部" --------
  {
    id: "demo:em:4",
    channel: "email",
    targetKind: "contact",
    targetName: "Pierre Dubois",
    parentRef: { id: "demo-ent-8", name: "Lyon Distribution" },
    counterparty: "p.dubois@lyondistrib.fr",
    lastInbound:
      "I'm out of the office until August 5 with limited access to email. For urgent matters please contact my colleague marie@lyondistrib.fr.",
    lastInboundZh:
      "8 月 5 日前休假，邮件回复延迟。紧急事宜请联系同事 marie@lyondistrib.fr。",
    hoursAgo: 7,
    aiIntent: "ooo",
  },
  {
    id: "demo:em:5",
    channel: "email",
    targetKind: "enterprise",
    targetName: "Copenhagen Wholesale",
    counterparty: "sourcing@cphwholesale.dk",
    lastInbound:
      "Thanks for reaching out. We've already committed to another supplier for this category — no need to follow up further.",
    lastInboundZh:
      "感谢来信，此类目我们已与其他供应商合作，无需再跟进。",
    hoursAgo: 14,
    aiIntent: "reject",
  },
  {
    id: "demo:wa:3",
    channel: "whatsapp",
    targetKind: "contact",
    targetName: "Ken Watanabe",
    parentRef: { id: "demo-ent-9", name: "Tokyo Retail" },
    counterparty: "+81801122334",
    lastInbound: "Got it, thanks.",
    lastInboundZh: "收到，谢谢。",
    hoursAgo: 4,
    // 低信号确认，AI 未打意向标签
  },
];

export function getDemoSocialThreads(): Thread[] {
  const now = Date.now();
  return DEMO_SEEDS.map((s) => {
    const meta = ensureMeta(
      s.id,
      new Date(now - s.hoursAgo * 3600_000).toISOString(),
    );
    // 首次注入默认值
    if (meta.inboundMessages.length === 0) {
      const at = new Date(now - s.hoursAgo * 3600_000).toISOString();
      meta.inboundMessages.push({
        id: makeId("in"),
        direction: "inbound",
        createdAt: at,
        fromName: s.targetName,
        fromAddress: s.counterparty,
        content: s.lastInbound,
        contentZh: s.lastInboundZh && !isChinese(s.lastInbound) ? s.lastInboundZh : undefined,
      });
      meta.aiIntent = s.aiIntent;
      meta.unread = 1;
      meta.status = "pending";
      if (s.tags) meta.tags = [...s.tags];
      if (s.assigneeId) {
        meta.assigneeId = s.assigneeId;
        meta.assignee = memberById(s.assigneeId)?.name;
      }
      // 客服窗口
      const winH = WINDOW_HOURS[s.channel];
      if (winH !== undefined) {
        if (s.windowLeftHours === null) {
          meta.windowExpiresAt = new Date(now - 3600_000).toISOString(); // 已过期
        } else {
          const leftH = s.windowLeftHours ?? Math.max(1, winH - s.hoursAgo);
          meta.windowExpiresAt = new Date(now + leftH * 3600_000).toISOString();
        }
      }
      writeMeta(metaStore);
    }
    // 回填：早期版本没有 contentZh 字段，此处按 seed 补齐（仅演示种子的第一条入站）。
    if (s.lastInboundZh && !isChinese(s.lastInbound) && meta.inboundMessages[0] && !meta.inboundMessages[0].contentZh) {
      meta.inboundMessages[0].contentZh = s.lastInboundZh;
      writeMeta(metaStore);
    }
    return {
      id: s.id,
      targetKind: s.targetKind,
      targetId: s.id,
      targetName: s.targetName,
      parentRef: s.parentRef,
      channel: s.channel,
      counterpartyAddress: s.counterparty,
      messages: [...meta.inboundMessages, ...meta.extraMessages].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      ),
      meta,
      lastAt: meta.updatedAt,
      lastPreview: s.lastInbound.slice(0, 120),
      lastDirection: (meta.extraMessages[meta.extraMessages.length - 1]?.direction ??
        "inbound") as "inbound" | "outbound",
    };
  });
}