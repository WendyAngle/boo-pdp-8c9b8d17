/**
 * 数据问题反馈（企业 / 关联人物）
 *
 * 用户在企业详情页发起「问题反馈」，可针对具体字段提出纠错建议，
 * 并说明数据来源以便平台核实。演示实现：工单保存在 localStorage。
 */
import { useSyncExternalStore } from "react";

export type FeedbackSubjectKind = "enterprise" | "contact" | "new_contact";

export type FeedbackIssueType = "wrong" | "outdated" | "missing" | "invalid";

export const ISSUE_TYPE_LABEL: Record<FeedbackIssueType, string> = {
  wrong: "数据错误",
  outdated: "数据过期",
  missing: "数据缺失",
  invalid: "无效 / 重复",
};

export type FeedbackSourceType =
  | "official_site"
  | "registry"
  | "contact_confirmed"
  | "business_card"
  | "third_party"
  | "other";

export const SOURCE_TYPE_LABEL: Record<FeedbackSourceType, string> = {
  official_site: "企业官网 / 官方社媒",
  registry: "官方工商登记信息",
  contact_confirmed: "与该企业沟通确认（邮件/电话）",
  business_card: "展会名片 / 线下资料",
  third_party: "第三方数据库或行业名录",
  other: "其他",
};

/** 需要填写来源链接的来源类型 */
export const SOURCE_NEEDS_URL: FeedbackSourceType[] = [
  "official_site",
  "registry",
  "third_party",
];

export interface FeedbackItem {
  /** 字段 key */
  field: string;
  /** 字段中文名 */
  label: string;
  /** 系统当前值 */
  current: string;
  /** 用户建议的正确值 */
  suggested: string;
  issue: FeedbackIssueType;
}

export interface NewContactDraft {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  status?: string;
}

export interface FeedbackTicket {
  id: string;
  createdAt: number;
  enterpriseId: string;
  enterpriseName: string;
  subjectKind: FeedbackSubjectKind;
  /** 关联人物索引与姓名（subjectKind = contact 时） */
  contactIndex?: number;
  contactName?: string;
  /** 新增关联人物信息（subjectKind = new_contact 时） */
  newContact?: NewContactDraft;
  items: FeedbackItem[];
  sourceType: FeedbackSourceType;
  sourceUrl?: string;
  sourceNote?: string;
  allowContact: boolean;
  status: "submitted" | "reviewing" | "accepted" | "rejected";
}

const KEY = "boo:data-feedback:v1";

function read(): FeedbackTicket[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "[]") as FeedbackTicket[];
  } catch {
    return [];
  }
}

let store: FeedbackTicket[] = read();
let version = 0;
const listeners = new Set<() => void>();

function persist() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      /* noop */
    }
  }
  version++;
  listeners.forEach((l) => l());
}

export function submitFeedback(
  input: Omit<FeedbackTicket, "id" | "createdAt" | "status">,
): FeedbackTicket {
  const ticket: FeedbackTicket = {
    ...input,
    id: `FB${Date.now().toString(36).toUpperCase()}`,
    createdAt: Date.now(),
    status: "submitted",
  };
  store = [ticket, ...store];
  persist();
  return ticket;
}

/** 该企业下已提交的反馈（含关联人物） */
export function useFeedbacks(enterpriseId: string): FeedbackTicket[] {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
    () => version,
  );
  return store.filter((t) => t.enterpriseId === enterpriseId);
}

/** 可反馈的企业字段 */
export const ENTERPRISE_FEEDBACK_FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "企业名称" },
  { key: "alias", label: "企业别名" },
  { key: "industry", label: "所属行业" },
  { key: "country", label: "所属国家/地区" },
  { key: "address", label: "企业地址" },
  { key: "est", label: "成立年份" },
  { key: "employees", label: "企业规模" },
  { key: "website", label: "企业官网" },
  { key: "email", label: "联系邮箱" },
  { key: "phone", label: "联系电话" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "tradeRole", label: "贸易角色" },
  { key: "products", label: "主营产品" },
  { key: "hsCodes", label: "HS 编码" },
  { key: "desc", label: "企业简介" },
];

/** 可反馈的联系人字段 */
export const CONTACT_FEEDBACK_FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "联系人姓名" },
  { key: "title", label: "职位信息" },
  { key: "email", label: "联系邮箱" },
  { key: "phone", label: "联系电话" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "status", label: "在职状态（已离职等）" },
];

/** 新增关联人物时可填写的字段 */
export const NEW_CONTACT_FIELDS: {
  key: keyof NewContactDraft;
  label: string;
  required?: boolean;
}[] = [
  { key: "name", label: "联系人姓名", required: true },
  { key: "title", label: "职位信息" },
  { key: "email", label: "联系邮箱" },
  { key: "phone", label: "联系电话" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "status", label: "在职状态" },
];
