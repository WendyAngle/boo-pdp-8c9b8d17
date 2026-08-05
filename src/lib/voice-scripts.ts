import { useSyncExternalStore } from "react";

/* ------------------------------------------------------------------ *
 * AI 智能外呼 · 话术（线性步骤式编排）/ 人工坐席 / 数据与合规
 * 方案：AI智能外呼_话术与对话流_产品设计方案 v1.2
 * ------------------------------------------------------------------ */

export type ScriptScene = "marketing" | "notify" | "revisit" | "invite" | "other";
export const SCRIPT_SCENES: { key: ScriptScene; label: string }[] = [
  { key: "marketing", label: "营销外呼" },
  { key: "notify", label: "语音通知" },
  { key: "revisit", label: "客户回访" },
  { key: "invite", label: "展会邀约" },
  { key: "other", label: "其他" },
];

export const SCRIPT_INDUSTRIES = [
  "外贸制造",
  "跨境电商",
  "机械设备",
  "新能源",
  "消费电子",
  "物流服务",
  "通用",
];

export const SCRIPT_LANGUAGES: { key: string; label: string }[] = [
  { key: "zh", label: "中文" },
  { key: "en", label: "英语" },
  { key: "es", label: "西班牙语" },
  { key: "ar", label: "阿拉伯语" },
  { key: "ru", label: "俄语" },
];

export type StepType = "opening" | "ai" | "transfer" | "collect" | "ending";
export const STEP_TYPES: { key: StepType; label: string; desc: string }[] = [
  { key: "opening", label: "开场白", desc: "自我介绍与来意说明，内置录音告知语" },
  { key: "ai", label: "AI 对话", desc: "LLM 驱动的多轮自由对话，输出意向标签" },
  { key: "transfer", label: "转人工", desc: "转接真实坐席，失败走兜底" },
  { key: "collect", label: "留资 / 发资料", desc: "确认邮箱或 WhatsApp，触发后续触达" },
  { key: "ending", label: "结束语", desc: "礼貌收尾并挂机" },
];

/** 分支跳转目标：步骤 id 或 "__end__"（结束通话） */
export const END_TARGET = "__end__";

export interface ScriptBranch {
  id: string;
  label: string;
  to: string;
}

export interface ScriptStep {
  id: string;
  type: StepType;
  title: string;
  /** 播报文本 / 系统提示词 */
  content: string;
  /** AI 对话：最大轮次 */
  maxTurns?: number;
  /** AI 对话：绑定企业知识库 */
  useKnowledge?: boolean;
  /** AI 对话：注入变量 */
  variables?: string[];
  /** 转人工：坐席组 */
  agentGroup?: string;
  /** 转人工：振铃超时（秒） */
  ringTimeout?: number;
  /** 转人工：失败兜底话术 */
  fallback?: string;
  branches: ScriptBranch[];
}

export type ScriptStatus = "draft" | "published" | "offline";

export interface VoiceScript {
  id: string;
  name: string;
  scene: ScriptScene;
  industry: string;
  language: string;
  /** platform = 平台运营维护的模板；tenant = 租户自有话术 */
  owner: "platform" | "tenant";
  status: ScriptStatus;
  steps: ScriptStep[];
  updatedAt: string;
  updatedBy: string;
  /** 平台模板：被使用次数；租户话术：通话数 */
  usedCount: number;
  /** 租户话术：A 类高意向占比 % */
  intentRateA?: number;
  /** 由哪个平台模板复制而来 */
  fromTemplateId?: string;
  recommended?: boolean;
}

export const SCRIPT_VARIABLES = ["企业名", "联系人名", "行业", "我的公司", "我的姓名", "活动主题"];

export const RECORDING_NOTICE = "为保证服务质量，本次通话可能会被录音。";

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

function step(partial: Partial<ScriptStep> & { type: StepType; title: string; content: string }): ScriptStep {
  return { id: uid("st"), branches: [], ...partial };
}

/* ---------------------------- mock 数据 ---------------------------- */

function buildDefaultSteps(scene: ScriptScene): ScriptStep[] {
  const s1 = step({
    type: "opening",
    title: "开场白",
    content: `${RECORDING_NOTICE}您好，我是{我的公司}的{我的姓名}，请问是{企业名}负责采购的{联系人名}吗？`,
  });
  const s2 = step({
    type: "ai",
    title: "AI 对话",
    content:
      "你是{我的公司}的 AI 业务助理，正在致电{企业名}。目标：了解对方近期的采购计划并判断合作意向。\n规则：\n- 客户说“不需要”“没兴趣” → 礼貌结束\n- 客户询问价格 → 说明可提供报价单，引导留邮箱\n- 对话超过 3 轮 → 引导客户明确意向",
    maxTurns: 5,
    useKnowledge: true,
    variables: ["企业名", "联系人名", "我的公司"],
  });
  const s3 = step({
    type: "transfer",
    title: "转人工",
    content: "好的，我这边为您转接专属顾问，请稍等。",
    agentGroup: "外贸一组",
    ringTimeout: 20,
    fallback: "顾问当前正忙，稍后会由专人与您联系，感谢您的时间。",
  });
  const s4 = step({
    type: "collect",
    title: "留资 / 发资料",
    content: "方便留一个邮箱吗？我把产品目录和报价单发给您。",
  });
  const s5 = step({ type: "ending", title: "结束语", content: "感谢您的时间，祝您工作顺利，再见。" });

  s2.branches = [
    { id: uid("br"), label: "有意向", to: s3.id },
    { id: uid("br"), label: "需要考虑 / 要资料", to: s4.id },
    { id: uid("br"), label: "明确拒绝", to: s5.id },
  ];
  s4.branches = [{ id: uid("br"), label: "已留资", to: s5.id }];
  s3.branches = [{ id: uid("br"), label: "转接失败", to: s5.id }];

  if (scene === "notify") {
    return [s1, step({ type: "ending", title: "结束语", content: "以上信息已通知到您，感谢接听，再见。" })];
  }
  return [s1, s2, s3, s4, s5];
}

const today = new Date();
const day = (n: number) => new Date(today.getTime() - n * 86400000).toISOString().slice(0, 10);

let scripts: VoiceScript[] = [
  {
    id: "tpl-001",
    name: "外贸制造 · 新客开发",
    scene: "marketing",
    industry: "外贸制造",
    language: "zh",
    owner: "platform",
    status: "published",
    steps: buildDefaultSteps("marketing"),
    updatedAt: day(6),
    updatedBy: "平台运营 · 李珊",
    usedCount: 862,
    recommended: true,
  },
  {
    id: "tpl-002",
    name: "跨境电商 · 大促招商邀约",
    scene: "invite",
    industry: "跨境电商",
    language: "zh",
    owner: "platform",
    status: "published",
    steps: buildDefaultSteps("marketing"),
    updatedAt: day(12),
    updatedBy: "平台运营 · 李珊",
    usedCount: 431,
  },
  {
    id: "tpl-003",
    name: "New Buyer Outreach (EN)",
    scene: "marketing",
    industry: "通用",
    language: "en",
    owner: "platform",
    status: "published",
    steps: buildDefaultSteps("marketing"),
    updatedAt: day(3),
    updatedBy: "平台运营 · Wang",
    usedCount: 275,
  },
  {
    id: "tpl-004",
    name: "物流服务 · 到期续约通知",
    scene: "notify",
    industry: "物流服务",
    language: "zh",
    owner: "platform",
    status: "offline",
    steps: buildDefaultSteps("notify"),
    updatedAt: day(30),
    updatedBy: "平台运营 · 李珊",
    usedCount: 96,
  },
  {
    id: "scr-001",
    name: "东南亚储能客户 8 月回访",
    scene: "revisit",
    industry: "新能源",
    language: "zh",
    owner: "tenant",
    status: "published",
    steps: buildDefaultSteps("revisit"),
    updatedAt: day(1),
    updatedBy: "张明",
    usedCount: 1240,
    intentRateA: 18,
    fromTemplateId: "tpl-001",
  },
  {
    id: "scr-002",
    name: "机械配件询盘跟进（草稿）",
    scene: "marketing",
    industry: "机械设备",
    language: "zh",
    owner: "tenant",
    status: "draft",
    steps: buildDefaultSteps("marketing"),
    updatedAt: day(4),
    updatedBy: "王倩",
    usedCount: 0,
  },
];

/* ---------------------------- 人工坐席 ---------------------------- */

export interface Agent {
  id: string;
  name: string;
  group: string;
  phone: string;
  timezone: string;
  workStart: string;
  workEnd: string;
  languages: string[];
  maxConcurrency: number;
  priority: number;
  enabled: boolean;
}

let agents: Agent[] = [
  {
    id: "ag-001",
    name: "张明",
    group: "外贸一组",
    phone: "+8613800138001",
    timezone: "Asia/Shanghai",
    workStart: "09:00",
    workEnd: "18:00",
    languages: ["zh", "en"],
    maxConcurrency: 2,
    priority: 1,
    enabled: true,
  },
  {
    id: "ag-002",
    name: "王倩",
    group: "外贸一组",
    phone: "+8613900139002",
    timezone: "Asia/Shanghai",
    workStart: "10:00",
    workEnd: "19:00",
    languages: ["zh"],
    maxConcurrency: 1,
    priority: 2,
    enabled: true,
  },
  {
    id: "ag-003",
    name: "Leo Chen",
    group: "海外组",
    phone: "+6598765432",
    timezone: "Asia/Singapore",
    workStart: "09:00",
    workEnd: "18:00",
    languages: ["en", "zh"],
    maxConcurrency: 2,
    priority: 1,
    enabled: false,
  },
];

export type TransferStrategy = "sequential" | "roundrobin" | "idlest";
export const TRANSFER_STRATEGIES: { key: TransferStrategy; label: string }[] = [
  { key: "sequential", label: "顺序转接（按优先级）" },
  { key: "roundrobin", label: "轮询转接" },
  { key: "idlest", label: "最空闲优先" },
];

/* ---------------------------- 数据与合规 ---------------------------- */

export interface ComplianceSettings {
  /** 录音留存月数 */
  recordingMonths: number;
  /** 转写文本留存月数 */
  transcriptMonths: number;
  /** 列表展示手机号打码 */
  maskPhone: boolean;
  /** 邮箱打码 */
  maskEmail: boolean;
  /** 敏感字段（卡号/证件号/验证码）过滤 */
  filterSensitive: boolean;
  /** 客户拒绝录音时仅保留文本 */
  stopOnRefusal: boolean;
  /** 录音告知语 */
  notice: string;
}

let compliance: ComplianceSettings = {
  recordingMonths: 6,
  transcriptMonths: 12,
  maskPhone: true,
  maskEmail: true,
  filterSensitive: true,
  stopOnRefusal: true,
  notice: RECORDING_NOTICE,
};

export const RECORDING_MONTH_OPTIONS = [3, 6, 12];
export const TRANSCRIPT_MONTH_OPTIONS = [6, 12, 24];
export const METADATA_MONTHS = 24;

/* ---------------------------- store ---------------------------- */

const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getVersion = () => version;

function useStore<T>(select: () => T): T {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return select();
}

/* ---------------------------- 话术 API ---------------------------- */

export function useScripts(owner?: "platform" | "tenant"): VoiceScript[] {
  return useStore(() => (owner ? scripts.filter((s) => s.owner === owner) : scripts));
}

export function useScript(id: string): VoiceScript | undefined {
  return useStore(() => scripts.find((s) => s.id === id));
}

export function getScript(id: string) {
  return scripts.find((s) => s.id === id);
}

/** 可用于外呼任务的话术（租户已发布） */
export function usePublishedScripts(): VoiceScript[] {
  return useStore(() => scripts.filter((s) => s.owner === "tenant" && s.status === "published"));
}

export function createScript(input: {
  name: string;
  scene: ScriptScene;
  industry: string;
  language: string;
  owner: "platform" | "tenant";
}): VoiceScript {
  const s: VoiceScript = {
    id: uid(input.owner === "platform" ? "tpl" : "scr"),
    name: input.name,
    scene: input.scene,
    industry: input.industry,
    language: input.language,
    owner: input.owner,
    status: "draft",
    steps: buildDefaultSteps(input.scene),
    updatedAt: new Date().toISOString().slice(0, 10),
    updatedBy: input.owner === "platform" ? "平台运营" : "我",
    usedCount: 0,
  };
  scripts = [s, ...scripts];
  emit();
  return s;
}

export function updateScript(id: string, patch: Partial<VoiceScript>) {
  scripts = scripts.map((s) =>
    s.id === id
      ? { ...s, ...patch, updatedAt: new Date().toISOString().slice(0, 10) }
      : s,
  );
  emit();
}

export function deleteScript(id: string) {
  scripts = scripts.filter((s) => s.id !== id);
  emit();
}

export function duplicateScript(id: string, name?: string): VoiceScript | undefined {
  const src = scripts.find((s) => s.id === id);
  if (!src) return;
  const copy: VoiceScript = {
    ...src,
    id: uid("scr"),
    name: name ?? `${src.name}（副本）`,
    steps: JSON.parse(JSON.stringify(src.steps)) as ScriptStep[],
    status: "draft",
    updatedAt: new Date().toISOString().slice(0, 10),
    updatedBy: "我",
    usedCount: 0,
    intentRateA: undefined,
  };
  scripts = [copy, ...scripts];
  emit();
  return copy;
}

/** 模板市场「使用该模板」：复制平台模板为租户话术 */
export function useTemplateAsScript(templateId: string): VoiceScript | undefined {
  const src = scripts.find((s) => s.id === templateId);
  if (!src) return;
  const copy: VoiceScript = {
    ...src,
    id: uid("scr"),
    owner: "tenant",
    name: src.name,
    steps: JSON.parse(JSON.stringify(src.steps)) as ScriptStep[],
    status: "draft",
    fromTemplateId: src.id,
    updatedAt: new Date().toISOString().slice(0, 10),
    updatedBy: "我",
    usedCount: 0,
    recommended: false,
  };
  scripts = [copy, ...scripts.map((s) => (s.id === templateId ? { ...s, usedCount: s.usedCount + 1 } : s))];
  emit();
  return copy;
}

export function newStep(type: StepType): ScriptStep {
  const meta = STEP_TYPES.find((t) => t.key === type)!;
  return step({ type, title: meta.label, content: "", maxTurns: type === "ai" ? 5 : undefined });
}

/** 发布前校验 */
export function validateScript(s: VoiceScript): string[] {
  const errs: string[] = [];
  const ids = new Set(s.steps.map((x) => x.id));
  if (s.steps.length === 0) errs.push("话术至少需要一个步骤");
  if (!s.steps.some((x) => x.type === "opening")) errs.push("缺少「开场白」步骤");
  if (!s.steps.some((x) => x.type === "ending")) errs.push("缺少「结束语」步骤");
  s.steps.forEach((x, i) => {
    if (!x.content.trim()) errs.push(`步骤 ${i + 1}「${x.title}」内容为空`);
    if (x.type === "opening" && !x.content.includes(RECORDING_NOTICE.slice(0, 8)))
      errs.push(`步骤 ${i + 1}「${x.title}」缺少录音告知语（合规要求）`);
    if (x.type === "transfer" && !agents.some((a) => a.enabled && a.group === x.agentGroup))
      errs.push(`步骤 ${i + 1}「${x.title}」所选坐席组无启用坐席，请先在 企业设置 → 人工坐席 配置`);
    x.branches.forEach((b) => {
      if (!b.to || (b.to !== END_TARGET && !ids.has(b.to)))
        errs.push(`步骤 ${i + 1}「${x.title}」分支「${b.label}」未指定有效跳转目标`);
    });
  });
  return errs;
}

/* ---------------------------- 坐席 API ---------------------------- */

export function useAgents(): Agent[] {
  return useStore(() => agents);
}

export function getAgentGroups(): string[] {
  return Array.from(new Set(agents.map((a) => a.group)));
}

export function useAgentGroups(): string[] {
  return useStore(() => Array.from(new Set(agents.map((a) => a.group))));
}

export function hasEnabledAgents(): boolean {
  return agents.some((a) => a.enabled);
}

export function saveAgent(a: Omit<Agent, "id"> & { id?: string }) {
  if (a.id) {
    agents = agents.map((x) => (x.id === a.id ? ({ ...x, ...a } as Agent) : x));
  } else {
    agents = [...agents, { ...a, id: uid("ag") } as Agent];
  }
  emit();
}

export function deleteAgent(id: string) {
  agents = agents.filter((a) => a.id !== id);
  emit();
}

export function toggleAgent(id: string) {
  agents = agents.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a));
  emit();
}

/* ---------------------------- 合规 API ---------------------------- */

export function useCompliance(): ComplianceSettings {
  return useStore(() => compliance);
}

export function updateCompliance(patch: Partial<ComplianceSettings>) {
  compliance = { ...compliance, ...patch };
  emit();
}

export function maskPhoneNumber(phone: string): string {
  if (phone.length < 7) return phone;
  return `${phone.slice(0, phone.length - 8)}${"*".repeat(4)}${phone.slice(-4)}`;
}
