import { Link } from "@tanstack/react-router";
import { Wand2, AlertTriangle } from "lucide-react";

import { useLeadProfile } from "@/lib/lead-profile";
import { useCurrentUser } from "@/lib/current-user";

/**
 * 变量自动填充说明条：
 * 文案中的 {企业名} {联系人名} {行业} {城市} 由目标客户资料自动取值；
 * {我的公司} {我的姓名} 由「企业信息」自动取值。
 * 用户无需手动插入变量；若我方信息缺失，提示立即补充。
 */
export function AutoVarFillHint({ className }: { className?: string }) {
  const profile = useLeadProfile();
  const user = useCurrentUser();

  const missing: string[] = [];
  if (!profile.companyName?.trim()) missing.push("我的公司");
  if (!user.name?.trim()) missing.push("我的姓名");

  return (
    <div
      className={`rounded-md border bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground ${className ?? ""}`}
    >
      <div className="flex items-start gap-1.5">
        <Wand2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span>
          变量已自动填充：
          <code className="mx-0.5 font-mono text-primary">{"{企业名}"}</code>
          <code className="mx-0.5 font-mono text-primary">{"{联系人名}"}</code>
          <code className="mx-0.5 font-mono text-primary">{"{行业}"}</code>
          <code className="mx-0.5 font-mono text-primary">{"{城市}"}</code>
          取自目标客户资料，
          <code className="mx-0.5 font-mono text-primary">{"{我的公司}"}</code>
          <code className="mx-0.5 font-mono text-primary">{"{我的姓名}"}</code>
          取自企业信息，发送时逐条替换，无需手动插入。
        </span>
      </div>
      {missing.length > 0 && (
        <div className="mt-1.5 flex items-start gap-1.5 text-amber-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {missing.join("、")}缺失，发送时将留空。
            <Link
              to="/outreach/my-profile"
              className="ml-1 font-medium text-primary hover:underline"
            >
              立即补充企业信息
            </Link>
          </span>
        </div>
      )}
    </div>
  );
}
