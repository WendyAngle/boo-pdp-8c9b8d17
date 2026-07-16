import { useSyncExternalStore } from "react";

export interface LeadProfile {
  companyName: string;
  uscc: string;
  industries: string[];
  mainProducts: string[];
  hsCodes: string[];
  scale: string;
  revenue: string;
  targetCountries: string[];
  targetIndustries: string[];
  targetScale: string;
  competitors: string[];
  advantage: string;
  website: string;
  brandStory: string;
  qualifications: QualificationItem[];
  businessLicense?: QualificationFile;
}

export interface QualificationFile {
  id: string;
  name: string;
  dataUrl: string;
  mime: string;
}

export interface QualificationItem {
  id: string;
  name: string;
  desc: string;
  files: QualificationFile[];
}

const KEY = "boo:lead:profile:v1";

export const EMPTY_PROFILE: LeadProfile = {
  companyName: "博远建材钢铁集团有限公司",
  uscc: "91330200MA2K5XQR70",
  industries: ["建筑材料", "钢材加工", "金属制品"],
  mainProducts: [
    "热轧钢板",
    "建筑螺纹钢",
    "镀锌钢管",
    "花岗岩石材",
    "大理石板材",
    "石膏板",
  ],
  hsCodes: ["721049", "721310", "730630", "680223", "680221", "680911"],
  scale: "201-1000",
  revenue: "5000 万 - 5 亿",
  targetCountries: ["美国", "德国", "墨西哥", "越南", "沙特阿拉伯"],
  targetIndustries: ["建筑施工", "基础设施工程", "房地产开发"],
  targetScale: "",
  competitors: ["宝钢国际", "河北敬业集团", "中建材集团"],
  advantage: "自有钢厂 + 唐山/宁波港口现货 + 7×24 中英阿俄多语客服",
  website: "",
  brandStory: "",
  qualifications: [],
};

function readProfile(): LeadProfile {
  if (typeof window === "undefined") return EMPTY_PROFILE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_PROFILE;
    const obj = JSON.parse(raw);
    return { ...EMPTY_PROFILE, ...obj };
  } catch {
    return EMPTY_PROFILE;
  }
}

let profile: LeadProfile = readProfile();
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export function saveProfile(next: LeadProfile) {
  profile = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }
  emit();
}

export function useLeadProfile(): LeadProfile {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
    () => version,
  );
  return profile;
}

/** 0-100 整数完整度 */
export function profileCompleteness(p: LeadProfile): number {
  const weights: Array<[boolean, number]> = [
    [p.industries.length > 0, 12],
    [p.mainProducts.length > 0, 14],
    [p.hsCodes.length > 0, 10],
    [!!p.scale, 6],
    [!!p.revenue, 6],
    [p.targetCountries.length > 0, 14],
    [p.targetIndustries.length > 0, 10],
    [!!p.targetScale, 6],
    [p.competitors.length > 0, 10],
    [!!p.advantage, 4],
    [!!p.website, 2],
    [!!p.brandStory, 2],
    [p.qualifications.length > 0, 4],
  ];
  return weights.reduce((s, [ok, w]) => s + (ok ? w : 0), 0);
}