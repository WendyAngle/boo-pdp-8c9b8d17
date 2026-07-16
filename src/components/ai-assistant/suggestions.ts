export type Lang = "bi" | "zh" | "en";

export const LANG_LABEL: Record<Lang, string> = {
  bi: "双语",
  zh: "中文",
  en: "EN",
};

export const UI_TEXT: Record<Lang, {
  title: string;
  subtitle: string;
  placeholder: string;
  send: string;
  thinking: string;
  suggestionsTitle: string;
  newChat: string;
  empty: string;
  translating: string;
}> = {
  bi: {
    title: "智能助手 · Assistant",
    subtitle: "出海大数据平台 / Overseas Data Platform",
    placeholder: "输入问题…  Ask anything…",
    send: "发送",
    thinking: "思考中…  Thinking…",
    suggestionsTitle: "你可能想问 / You may ask",
    newChat: "新会话",
    empty: "向我提问，或选择下方常见问题开始。\nAsk me anything, or pick a question below.",
    translating: "切换语言中…  Translating…",
  },
  zh: {
    title: "智能助手",
    subtitle: "出海大数据平台",
    placeholder: "输入问题…",
    send: "发送",
    thinking: "思考中…",
    suggestionsTitle: "你可能想问",
    newChat: "新会话",
    empty: "向我提问，或选择下方常见问题开始。",
    translating: "切换语言中…",
  },
  en: {
    title: "AI Assistant",
    subtitle: "Overseas Data Platform",
    placeholder: "Ask anything…",
    send: "Send",
    thinking: "Thinking…",
    suggestionsTitle: "You may ask",
    newChat: "New chat",
    empty: "Ask me anything, or pick a question below to start.",
    translating: "Translating…",
  },
};

export const SUGGESTIONS: Record<Lang, string[]> = {
  zh: [
    "如何根据 HS Code 查找潜在采购商？",
    "AI 触达邮件和短信分别消耗多少积分？",
    "怎样把企业加入收藏并后续批量触达？",
    "提单数据能看到哪些字段？如何按国家筛选？",
    "账单中 AI 生成内容与发送内容消耗有什么区别？",
    "充值后多久到账？发票如何申请？",
  ],
  en: [
    "How do I find potential buyers by HS Code?",
    "How many credits do AI email and SMS outreach cost?",
    "How can I favorite enterprises and batch-reach them later?",
    "What fields do bill-of-lading records expose? How to filter by country?",
    "In billing, what's the difference between AI generation and sending costs?",
    "How long does a recharge take? How do I request an invoice?",
  ],
  bi: [
    "如何根据 HS Code 查找潜在采购商？",
    "AI 邮件 / 短信触达分别消耗多少积分？",
    "如何把企业加入收藏并批量触达？",
    "提单数据有哪些关键字段？",
    "AI 生成内容 vs 发送内容的计费区别？",
    "充值到账时长与发票申请流程？",
  ],
};