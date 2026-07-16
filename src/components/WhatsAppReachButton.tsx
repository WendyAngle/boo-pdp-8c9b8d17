import { useMemo, useState } from "react";
import { MessageCircle, ChevronDown, ExternalLink, ServerCog } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BatchSocialDialog, type SocialCandidate } from "@/components/BatchSocialDialog";
import { normalizePhone } from "@/lib/wa-verify";
import { findEnterprise } from "@/data/enterprises";
import { useLeadProfile } from "@/lib/lead-profile";
import { useCurrentUser } from "@/lib/current-user";
import { myContext } from "@/lib/message-vars";
import type { TargetKind } from "@/lib/credits-ledger";

interface Props {
  targetKind: TargetKind;
  targetId: string;
  targetName: string;
  parentRef?: { id: string; name: string };
  phone: string;
  disabled?: boolean;
  className?: string;
}

export function WhatsAppReachButton({
  targetKind,
  targetId,
  targetName,
  parentRef,
  phone,
  disabled,
  className,
}: Props) {
  const profile = useLeadProfile();
  const user = useCurrentUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);

  const candidates = useMemo<SocialCandidate[]>(() => {
    const my = myContext(profile, user);
    const entId =
      targetKind === "enterprise" ? targetId : (parentRef?.id ?? targetId.split(":")[0]);
    const ent = entId ? findEnterprise(entId) : undefined;
    return [
      {
        key: targetId,
        address: phone,
        name: targetName,
        targetKind,
        targetId,
        parentRef,
        enterpriseId: entId,
        ctx: {
          企业名: targetKind === "enterprise" ? targetName : parentRef?.name ?? ent?.name,
          联系人名: targetKind === "contact" ? targetName : ent?.contacts?.[0]?.name,
          行业: ent?.industry,
          城市: ent?.city,
          ...my,
        },
      },
    ];
  }, [targetKind, targetId, targetName, parentRef, phone, profile, user]);

  function openManual() {
    const n = normalizePhone(phone).replace(/^\+/, "");
    if (!n) {
      toast.error("无有效手机号");
      return;
    }
    window.open(`https://wa.me/${n}`, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <span
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium h-6 transition-colors",
              "border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              className,
            )}
            title="WhatsApp 触达"
          >
            <MessageCircle className="h-3 w-3" />
            WhatsApp 触达
            <ChevronDown className="h-3 w-3 opacity-70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onClick={(e) => e.stopPropagation()}
            onSelect={(e) => {
              setMenuOpen(false);
              openManual();
            }}
          >
            <ExternalLink className="h-4 w-4" />
            手动触达
            <span className="ml-auto text-[10px] text-muted-foreground">打开 WhatsApp</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => e.stopPropagation()}
            onSelect={() => {
              setMenuOpen(false);
              window.setTimeout(() => setAutoOpen(true), 0);
            }}
          >
            <ServerCog className="h-4 w-4" />
            系统自动触达
            <span className="ml-auto text-[10px] text-muted-foreground">扣积分</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </span>

      <BatchSocialDialog
        open={autoOpen}
        onOpenChange={setAutoOpen}
        platform="WhatsApp"
        candidates={candidates}
      />
    </>
  );
}
