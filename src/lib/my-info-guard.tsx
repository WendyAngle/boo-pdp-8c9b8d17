import { toast } from "sonner";

import { useLeadProfile } from "@/lib/lead-profile";
import { useCurrentUser } from "@/lib/current-user";

/**
 * 我方信息校验与自动填充：
 * - AI 生成文案前调用 ensure()：企业信息（公司名称）与联系人姓名齐全才继续；
 *   缺失时弹出提示，引导用户先到「企业信息」补充。
 * - fillMine()：把 {我的公司} {我的姓名} 直接替换为实际值（自动填充），
 *   目标客户侧变量 {企业名} {联系人名} {行业} {城市} 仍保留，发送时逐条替换。
 */
export function useMyInfoGuard() {
  const profile = useLeadProfile();
  const user = useCurrentUser();

  const companyName = profile.companyName?.trim() ?? "";
  const myName = user.name?.trim() ?? "";

  const missing: string[] = [];
  if (!companyName) missing.push("公司名称");
  if (!myName) missing.push("联系人姓名");

  function ensure(): boolean {
    if (missing.length === 0) return true;
    toast.error(`企业信息不完整：缺少${missing.join("、")}`, {
      description: "请先到「企业信息」补充后再生成文案。",
      action: {
        label: "去完善",
        onClick: () => {
          window.location.href = "/outreach/my-profile";
        },
      },
    });
    return false;
  }

  function fillMine(text: string): string {
    return text
      .replace(/\{我的公司\}/g, companyName)
      .replace(/\{我的姓名\}/g, myName);
  }

  /**
   * 兜底清理：AI 仍然吐出占位符时，用目标客户资料直接替换；
   * 目标资料缺失的占位符整体移除，避免把 {行业} 这类变量发出去。
   */
  function fillAll(text: string, ctx?: Record<string, string | undefined>): string {
    return fillMine(text)
      .replace(/\{(企业名|联系人名|行业|城市)\}/g, (_m, k: string) => {
        const v = ctx?.[k]?.trim();
        if (v) return v;
        return k === "联系人名" ? "您好" : "";
      })
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n");
  }

  return { companyName, myName, missing, ensure, fillMine, fillAll };
}
