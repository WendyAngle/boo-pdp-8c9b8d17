import { useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  Sparkles,
  Mailbox as MailboxIcon,
  X,
  Loader2,
  Trash2,
  ShieldOff,
  Eye,
  Unlock,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";


import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { isSuppressed } from "@/lib/suppressions-store";
import {
  useSmsTemplates,
  toComposeSyntax,
  getTemplateDeliverableRegions,
  regionLabel,
} from "@/lib/sms-templates-store";
import { FileText, ShieldCheck, ShieldAlert } from "lucide-react";

import {
  smsSegments,
  myContext,
  type Recipient,
  type VarContext,
} from "@/lib/message-vars";
import {
  useUsableMailboxes,
  getDefaultUsableMailbox,
  updateMailbox,
  type Mailbox,
} from "@/lib/mailboxes";
import {
  createReach,
  costForChannel,
  COST_VIEW_EMAIL,
  COST_VIEW_PHONE,
  computeReachBreakdown,
  performReachAutoUnlocks,
  useLedger,
} from "@/lib/credits-ledger";
import { useLeadProfile } from "@/lib/lead-profile";
import { useCurrentUser } from "@/lib/current-user";
import { ComposeFormatHint } from "@/components/outreach/ComposeFormatHint";
import { generateAiContent } from "@/lib/api/ai-compose.functions";
import { TargetLangSection } from "@/components/outreach/TargetLangSection";
import { useMyInfoGuard } from "@/lib/my-info-guard";
import { maskContact } from "@/lib/mask-contact";
import { Checkbox } from "@/components/ui/checkbox";




export type ComposeChannel = "email" | "phone";

/** 手动添加的收件人：key 以 manual: 开头，不参与解锁扣费 */
const MANUAL_PREFIX = "manual:";
function isManualRecipient(r: Recipient) {
  return r.key.startsWith(MANUAL_PREFIX);
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9][0-9\s-]{5,19}$/;




export interface ComposeSendDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  channel: ComposeChannel;
  recipients: Recipient[];
  /** 上层选中总数（用于展示"已自动过滤 N 条无地址"） */
  totalSelected?: number;
  /** 已知发件邮箱（来自上层），不传则内部使用默认邮箱 */
  initialSenderId?: string;
  /** 发送成功回调（已扣费、已生成触达记录） */
  onSent?: (count: number) => void;
}

export function ComposeSendDialog({
  open,
  onOpenChange,
  channel,
  recipients: incomingRecipients,
  totalSelected,
  initialSenderId,
  onSent,
}: ComposeSendDialogProps) {
  const isEmail = channel === "email";
  const mailboxes = useUsableMailboxes();
  const profile = useLeadProfile();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const my = myContext(profile, user);
  const callGenerate = useServerFn(generateAiContent);
  const ledger = useLedger();
  const myInfo = useMyInfoGuard();

  const [recipients, setRecipients] = useState<Recipient[]>(incomingRecipients);
  /** 记录初始进入弹窗时被自动过滤的数量，用于维持“已自动过滤”文案的稳定性 */
  const [initialFilteredCount, setInitialFilteredCount] = useState(0);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [aiUsed, setAiUsed] = useState(false);
  const [senderId, setSenderId] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  /** 目标语言（发送语言）代码 */
  const [targetLang, setTargetLang] = useState<string>("en");
  /** 目标语言译文（实际发送内容） */
  const [translated, setTranslated] = useState("");
  const [translatedSubject, setTranslatedSubject] = useState("");

  // 短信合规追踪：内容是否来自已报备模板
  const [smsTemplateId, setSmsTemplateId] = useState<string | null>(null);
  const [smsTemplateName, setSmsTemplateName] = useState<string | null>(null);

  /** 手动添加收件人输入框 */
  const [manualInput, setManualInput] = useState("");

  function addManualRecipients() {
    const raw = manualInput
      .split(/[,，;；\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (raw.length === 0) return;
    const exists = new Set(recipients.map((r) => r.address.toLowerCase()));
    const added: Recipient[] = [];
    const invalid: string[] = [];
    const dup: string[] = [];
    for (const v of raw) {
      const ok = isEmail ? EMAIL_RE.test(v) : PHONE_RE.test(v);
      if (!ok) {
        invalid.push(v);
        continue;
      }
      if (exists.has(v.toLowerCase())) {
        dup.push(v);
        continue;
      }
      exists.add(v.toLowerCase());
      const key = `${MANUAL_PREFIX}${v.toLowerCase()}`;
      const name = isEmail ? v.split("@")[0] : v;
      added.push({
        key,
        address: v,
        name,
        targetKind: "contact",
        targetId: key,
        ctx: { 联系人名: name, ...my } as VarContext,
      });
    }
    if (added.length > 0) setRecipients((prev) => [...prev, ...added]);
    setManualInput(invalid.join(" "));
    if (invalid.length > 0)
      toast.error(`${invalid.length} 个${isEmail ? "邮箱" : "手机号"}格式不正确`, {
        description: invalid.slice(0, 3).join("、"),
      });
    if (dup.length > 0) toast.info(`已忽略 ${dup.length} 个重复收件人`);
    if (added.length > 0) toast.success(`已添加 ${added.length} 个收件人`);
  }

  // 重置 state 每次打开
  useEffect(() => {
    if (!open) return;
    setRecipients(incomingRecipients);
    if (typeof totalSelected === "number") {
      setInitialFilteredCount(Math.max(0, totalSelected - incomingRecipients.length));
    } else {
      setInitialFilteredCount(0);
    }
    setManualInput("");
    setSubject("");
    setContent("");
    setAiUsed(false);
    
    setTargetLang("en");
    setTranslated("");
    setTranslatedSubject("");

    setSmsTemplateId(null);
    setSmsTemplateName(null);
    if (isEmail) {
      setSenderId(
        initialSenderId ?? getDefaultUsableMailbox(mailboxes)?.id ?? mailboxes[0]?.id ?? "",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sender: Mailbox | undefined = useMemo(
    () => mailboxes.find((m) => m.id === senderId) ?? getDefaultUsableMailbox(mailboxes),
    [mailboxes, senderId],
  );

  const subjectRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  // 退订预检：Dialog 打开即计算，用于顶部非阻塞横幅
  const suppressedRecipients = useMemo(() => {
    const kind = isEmail ? "email" : "phone";
    return recipients.filter((r) => isSuppressed(kind, r.address));
  }, [recipients, isEmail]);

  /** 实际发送内容：有译文则发译文 */
  const sendSubject = (translatedSubject.trim() || subject).trim();
  const sendContent = (translated.trim() || content).trim();

  // 费用合计
  const unit = costForChannel(isEmail ? "email" : "phone");
  const segments = isEmail ? 1 : smsSegments(sendContent || "");

  const sendCostPerRecipient = isEmail ? unit : unit * segments;
  const sendTotal = recipients.length * sendCostPerRecipient;

  // 未解锁字段的自动查看费合计（按每个收件人独立判断）
  const viewCostTotal = useMemo(() => {
    let total = 0;
    for (const r of recipients) {
      // 手动添加的收件人地址由用户自行提供，无需解锁、不产生查看费
      if (isManualRecipient(r)) continue;
      const bd = computeReachBreakdown(
        { targetKind: r.targetKind, targetId: r.targetId },
        isEmail ? "email" : "phone",
        undefined,
        { reachCostOverride: 0 },
      );
      total += bd.viewCost;
    }
    return total;
    // 依赖 ledger 版本以在解锁状态变化时重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipients, isEmail, ledger]);

  /** 单条解锁单价 */
  const unitView = isEmail ? COST_VIEW_EMAIL : COST_VIEW_PHONE;

  /** 尚未解锁明文的收件人 key 集合（手动添加的除外） */
  const lockedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const r of recipients) {
      if (isManualRecipient(r)) continue;
      const bd = computeReachBreakdown(
        { targetKind: r.targetKind, targetId: r.targetId },
        isEmail ? "email" : "phone",
        undefined,
        { reachCostOverride: 0 },
      );
      if (bd.viewCost > 0) s.add(r.key);
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipients, isEmail, ledger]);

  /** 主动解锁明文：立即扣费、永久有效（幂等） */
  function unlockOne(r: Recipient) {
    performReachAutoUnlocks({
      targetKind: r.targetKind,
      targetId: r.targetId,
      targetName: r.name,
      parentRef: r.parentRef,
      detail: r.address,
      fields: isEmail ? [{ field: "email" }] : [{ field: "phone" }],
    });
    toast.success(`已解锁 ${r.name} 的${isEmail ? "邮箱" : "电话"}`, {
      description: `扣除 ${unitView} 积分，永久有效`,
    });
  }

  const [unlockAllOpen, setUnlockAllOpen] = useState(false);
  const [unlockAllAck, setUnlockAllAck] = useState(false);
  function unlockAll() {
    const targets = recipients.filter((r) => lockedKeys.has(r.key));
    targets.forEach((r) =>
      performReachAutoUnlocks({
        targetKind: r.targetKind,
        targetId: r.targetId,
        targetName: r.name,
        parentRef: r.parentRef,
        detail: r.address,
        fields: isEmail ? [{ field: "email" }] : [{ field: "phone" }],
      }),
    );
    setUnlockAllOpen(false);
    setUnlockAllAck(false);
    toast.success(`已解锁 ${targets.length} 位联系人的明文`, {
      description: `扣除 ${targets.length * unitView} 积分，永久有效`,
    });
  }

  const grandTotal = sendTotal + viewCostTotal;


  // 发件邮箱日发上限剩余额度（仅邮件）
  const remainingQuota =
    isEmail && sender ? Math.max(0, sender.dailyLimit - sender.sentToday) : Infinity;
  const overLimit = isEmail && !!sender && recipients.length > remainingQuota;

  const canSend =
    recipients.length > 0 &&
    (!isEmail || !!sender) &&
    (!isEmail || sendSubject.length > 0) &&
    sendContent.length > 0 &&
    (isEmail || !!smsTemplateId) &&
    !overLimit;

  function doSend() {
    if (!canSend) return;
    // 过滤退订名单
    const kind = isEmail ? "email" : "phone";
    const blocked = recipients.filter((r) => isSuppressed(kind, r.address));
    const active = recipients.filter((r) => !isSuppressed(kind, r.address));
    if (active.length === 0) {
      toast.error(`所有收件人均在退订名单中，已阻止发送`);
      return;
    }
    let n = 0;
    for (const r of active) {
      const finalSubject = isEmail ? sendSubject : undefined;
      const finalContent = sendContent;

      // 未解锁时先扣查看费并永久解锁（幂等）；手动添加的地址无需解锁
      if (!isManualRecipient(r)) {
        performReachAutoUnlocks({
          targetKind: r.targetKind,
          targetId: r.targetId,
          targetName: r.name,
          parentRef: r.parentRef,
          detail: r.address,
          fields: isEmail ? [{ field: "email" }] : [{ field: "phone" }],
        });
      }
      createReach({
        targetKind: r.targetKind,
        targetId: r.targetId,
        targetName: r.name,
        parentRef: r.parentRef,
        channel: isEmail ? "email" : "phone",
        detail: r.address,
        senderEmail: isEmail ? sender?.email : undefined,
        subject: finalSubject,
        content: finalContent,
        aiGenerated: aiUsed,
        cost: sendCostPerRecipient,
      });
      n++;
    }
    // 累加发件邮箱当日已发送数
    if (isEmail && sender && n > 0) {
      updateMailbox(sender.id, { sentToday: sender.sentToday + n });
    }
    onOpenChange(false);
    onSent?.(n);
    if (blocked.length > 0) {
      toast.warning(`已跳过 ${blocked.length} 个退订联系人`, {
        description: blocked.slice(0, 3).map((b) => b.address).join("、") +
          (blocked.length > 3 ? ` 等 ${blocked.length} 个` : ""),
      });
    }
    toast.success(
      isEmail
        ? `已加入发送队列：${n} 封邮件`
        : `已加入发送队列：${n} 条短信`,
      {
        description: `共扣除 ${grandTotal} 积分${
          viewCostTotal > 0 ? `（含自动解锁查看 ${viewCostTotal} 积分）` : ""
        }，可在「触达」模块查看进度`,
      },
    );
  }

  function handleSend() {
    if (!canSend) return;
    doSend();
  }

  async function handleAiGenerate() {
    if (aiLoading) return;
    if (!myInfo.ensure()) return;
    setAiLoading(true);
    try {
      const res = await callGenerate({
        data: {
          channel: isEmail ? "email" : "sms",
          scene: "开发信",
          tone: "friendly",
          language: "zh",
          languageName: "中文",
          myCompany: profile.companyName,
          myName: user.name,
          literal: true,
        },
      });
      const post = (t: string) => myInfo.fillAll(t);
      if (isEmail && res.subject) setSubject(post(res.subject));
      if (res.content) setContent(post(res.content));
      setAiUsed(true);
      // AI 生成 → 视为未报备草稿
      if (!isEmail) {
        setSmsTemplateId(null);
        setSmsTemplateName(null);
      }
      toast.success(`AI 已生成${isEmail ? "邮件" : "短信"}首次接触文案`, {
        description: "文案基于我方企业与产品信息生成，全部目标发送同一内容",
      });

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("AI 生成失败", { description: msg });
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            {isEmail ? "撰写并发送邮件" : "撰写并发送短信"}
            <Badge variant="secondary" className="ml-1 font-normal">
              {recipients.length === 1 ? "单条" : `批量 ${recipients.length} 条`}
            </Badge>
          </DialogTitle>
          <DialogDescription className="sr-only">
            撰写发送内容并确认积分消耗
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* 收件人 */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">
                收件人（{recipients.length}）
                {lockedKeys.size > 0 && (
                  <span className="ml-1 text-muted-foreground/80">
                    · {lockedKeys.size} 位{isEmail ? "邮箱" : "电话"}未解锁，默认脱敏展示
                  </span>
                )}
              </Label>
              {recipients.length === 0 ? (
                <span className="text-xs text-rose-600">
                  {initialFilteredCount > 0
                    ? `已选对象均无${isEmail ? "邮箱" : "电话"}，已全部过滤`
                    : "暂无收件人，可在下方手动添加"}
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  {initialFilteredCount > 0 && (
                    <span className="text-xs text-amber-600">
                      已自动过滤 {initialFilteredCount} 条无
                      {isEmail ? "邮箱" : "电话"}的数据
                    </span>
                  )}
                  {lockedKeys.size > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setUnlockAllAck(false);
                        setUnlockAllOpen(true);
                      }}
                    >
                      <Unlock className="h-3.5 w-3.5 mr-1" />
                      全部解锁 · -{lockedKeys.size * unitView}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {suppressedRecipients.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <div className="flex items-start gap-2">
                  <ShieldOff className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">
                      本批次含 {suppressedRecipients.length} 个退订{isEmail ? "邮箱" : "手机号"}，发送时将自动跳过
                    </div>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-amber-800 hover:underline select-none">
                        查看名单
                      </summary>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {suppressedRecipients.map((r) => (
                          <span
                            key={r.key}
                            className="inline-flex items-center gap-1 rounded border border-amber-200 bg-white/70 px-1.5 py-0.5 font-mono text-[11px]"
                          >
                            {r.name} ·{" "}
                            {lockedKeys.has(r.key)
                              ? maskContact(isEmail ? "email" : "phone", r.address)
                              : r.address}

                          </span>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            )}
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5 rounded-md border bg-muted/30 p-2 max-h-28 overflow-y-auto">
                {recipients.map((r) => {
                  const manual = isManualRecipient(r);
                  const locked = !manual && lockedKeys.has(r.key);
                  return (
                    <span
                      key={r.key}
                      className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs"
                    >
                      <span className="font-medium">{r.name}</span>
                      <span className="text-muted-foreground font-mono">
                        ·{" "}
                        {locked
                          ? maskContact(isEmail ? "email" : "phone", r.address)
                          : r.address}
                      </span>
                      {manual && (
                        <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                          手动
                        </Badge>
                      )}
                      {locked && (
                        <button
                          type="button"
                          onClick={() => unlockOne(r)}
                          className="ml-0.5 inline-flex items-center gap-0.5 rounded border border-primary/30 bg-primary/5 px-1 text-[10px] font-medium text-primary hover:bg-primary/10"
                          title={`解锁明文，扣 ${unitView} 积分（永久有效）`}
                        >
                          <Eye className="h-3 w-3" />
                          {unitView}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setRecipients((prev) => prev.filter((x) => x.key !== r.key))
                        }
                        className="ml-0.5 text-muted-foreground hover:text-rose-600"
                        aria-label="移除"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* 手动添加收件人 */}
            <div className="flex items-center gap-2">
              <Input
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addManualRecipients();
                  }
                }}
                placeholder={
                  isEmail
                    ? "手动添加收件邮箱，多个用逗号/空格分隔"
                    : "手动添加手机号，多个用逗号/空格分隔"
                }
                className="h-8 text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={addManualRecipients}
                disabled={!manualInput.trim()}
              >
                添加
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              手动添加的{isEmail ? "邮箱" : "手机号"}由你自行提供，不产生解锁查看费，仅按渠道计发送费。
            </p>

          </section>

          {/* 发件人（邮件） */}
          {isEmail && (
            <section className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <MailboxIcon className="h-3.5 w-3.5" /> 发件邮箱
              </Label>
              {mailboxes.length === 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  尚未配置发件邮箱。
                  <button
                    type="button"
                    className="underline ml-1"
                    onClick={() => {
                      onOpenChange(false);
                      navigate({ to: "/outreach/mailboxes" });
                    }}
                  >
                    去设置
                  </button>
                </div>
              ) : (
                <Select value={sender?.id ?? ""} onValueChange={setSenderId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="选择发件邮箱" />
                  </SelectTrigger>
                  <SelectContent>
                    {mailboxes.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="font-mono">{m.email}</span>
                        <span className="text-muted-foreground ml-2 text-xs">
                          · {m.displayName}
                          {m.isDefault ? " · 默认" : ""}
                          {" · 今日剩余 "}
                          {Math.max(0, m.dailyLimit - m.sentToday)}/{m.dailyLimit}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {sender && (
                <div
                  className={cn(
                    "rounded-md border p-2 text-xs flex items-center justify-between gap-2",
                    overLimit
                      ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
                      : "border-muted bg-muted/40 text-muted-foreground",
                  )}
                >
                  <span>
                    日发上限：{sender.dailyLimit} · 今日已发 {sender.sentToday} ·
                    <span className="font-medium ml-1">剩余 {remainingQuota}</span>
                    {overLimit && (
                      <span className="ml-2">
                        当前选择 {recipients.length} 条，超出 {recipients.length - remainingQuota} 条
                      </span>
                    )}
                  </span>
                  {overLimit && remainingQuota > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setRecipients((prev) => prev.slice(0, remainingQuota))
                      }
                      className="shrink-0 rounded border border-rose-300 bg-white px-2 py-0.5 font-medium hover:bg-rose-100"
                    >
                      仅保留前 {remainingQuota} 条
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {/* 撰写内容 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-2">
                撰写内容
                {aiUsed && (
                  <Badge
                    variant="secondary"
                    className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                  >
                    <Sparkles className="h-3 w-3" />
                    AI 已生成 · 可手动调整
                  </Badge>
                )}
              </Label>
              <div className={cn("flex items-center gap-2", !isEmail && "hidden")}>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={aiLoading}
                  onClick={() => handleAiGenerate()}
                  className="h-7 gap-1"
                >
                  {aiLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  )}
                  {aiLoading
                    ? "生成中…"
                    : aiUsed
                      ? "AI 重新生成"
                      : "AI 生成文案"}
                </Button>
              </div>
            </div>

            <ComposeFormatHint channel={isEmail ? "email" : "sms"} />


            {!isEmail && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  选择已报备短信模板 *
                  <span className="text-muted-foreground font-normal">
                    模板由平台在「管理后台 · 短信模板」统一维护与报备，此处仅可选择使用
                  </span>
                </div>
                <SmsTemplatePicker
                  currentId={smsTemplateId}
                  onPick={(id, name, c) => {
                    setContent(myInfo.fillAll(c));

                    setSmsTemplateId(id);
                    setSmsTemplateName(name);
                    setAiUsed(false);
                  }}
                />
              </div>
            )}

            <div className="grid gap-0 lg:grid-cols-2 lg:divide-x rounded-md border overflow-hidden">
              <div className="space-y-2 p-3">
                <div className="flex h-8 items-center">
                  <Label className="text-xs text-muted-foreground">中文原文 *</Label>
                </div>

                {isEmail && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">主题 *</Label>
                    <Input
                      ref={subjectRef}
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      maxLength={120}
                      placeholder="例：关于出口合作的提案"
                    />
                  </div>
                )}

                <Textarea
                  ref={contentRef}
                  value={content}
                  readOnly={!isEmail}
                  className={cn(!isEmail && "bg-muted/40 cursor-not-allowed")}
                  onChange={(e) => {
                    if (!isEmail) return;
                    setContent(e.target.value);
                  }}
                  rows={isEmail ? 8 : 6}
                  maxLength={isEmail ? 5000 : 300}
                  placeholder={
                    isEmail
                      ? "您好，我是××公司的×××……"
                      : "您好，我是××公司的×××……"
                  }
                />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {content.length} / {isEmail ? 5000 : 300} 字
                    {!isEmail && content && (
                      <span className="ml-2">· 拆分 {smsSegments(content)} 条</span>
                    )}
                  </span>
                </div>
                {!isEmail && content.trim().length > 0 && (
                  <ComplianceStrip templateName={smsTemplateName} />
                )}
              </div>

              {/* 目标语言文案（实际发送内容） */}
              <TargetLangSection
                source={content}
                sourceSubject={isEmail ? subject : undefined}
                lang={targetLang}
                onLangChange={setTargetLang}
                value={translated}
                onChange={setTranslated}
                subjectValue={isEmail ? translatedSubject : undefined}
                onSubjectChange={isEmail ? setTranslatedSubject : undefined}
                rows={isEmail ? 8 : 6}
                kindLabel={isEmail ? "邮件" : "短信"}
                bare
              />

            </div>
          </section>



          {/* 费用 */}
          <section className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs space-y-1 dark:border-rose-900/50 dark:bg-rose-950/30">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                发送费用（{recipients.length} {isEmail ? "封" : "条"} ×{" "}
                {sendCostPerRecipient} 积分{
                  !isEmail && sendContent ? `，按 ${smsSegments(sendContent)} 条拆分` : ""
                }）
              </span>
              <span className="font-medium">{sendTotal} 积分</span>
            </div>
            {viewCostTotal > 0 && (() => {
              const unlockCount = Math.round(viewCostTotal / unitView);
              const alreadyCount = recipients.length - unlockCount;
              return (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    发送后解锁{isEmail ? "邮箱" : "电话"}（{unlockCount} 位未解锁
                    收件人 × {unitView} 积分
                    {alreadyCount > 0 ? `，另 ${alreadyCount} 位已解锁免费` : ""}
                    ，永久生效）
                  </span>
                  <span className="font-medium">{viewCostTotal} 积分</span>
                </div>
              );
            })()}

            <div className="flex justify-between border-t border-rose-200/70 pt-1 dark:border-rose-900/50">
              <span className="font-semibold text-rose-700 dark:text-rose-300">
                合计
              </span>
              <span className="font-semibold text-rose-700 dark:text-rose-300">
                {grandTotal} 积分
              </span>
            </div>
            {viewCostTotal > 0 && (
              <div className="text-[11px] text-rose-700/80 pt-0.5 dark:text-rose-300/80">
                触达完成后，对应{isEmail ? "邮箱" : "电话"}将永久解锁，后续查看/再次触达不再收取查看费。
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleSend}
            disabled={!canSend}
            className="bg-primary"
          >
            <Send className="h-4 w-4" />
            确认发送（-{grandTotal}）
          </Button>
        </DialogFooter>
      </DialogContent>




      {/* 全部解锁 · 二次确认 */}
      <Dialog open={unlockAllOpen} onOpenChange={setUnlockAllOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>解锁全部明文{isEmail ? "邮箱" : "电话"}</DialogTitle>
            <DialogDescription>
              将为 {lockedKeys.size} 位未解锁收件人一次性解锁明文，扣除{" "}
              <span className="font-semibold text-rose-600">
                {lockedKeys.size * unitView}
              </span>{" "}
              积分，解锁后永久有效、不可撤销。批量群发本身无需解锁即可发送。
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={unlockAllAck}
              onCheckedChange={(v) => setUnlockAllAck(v === true)}
              className="mt-0.5"
            />
            <span>我已知晓将立即扣除 {lockedKeys.size * unitView} 积分</span>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockAllOpen(false)}>
              取消
            </Button>
            <Button disabled={!unlockAllAck} onClick={unlockAll}>
              <Unlock className="h-4 w-4" />
              确认解锁
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>

  );
}


/* -------------------- 短信模板选择器 -------------------- */

function SmsTemplatePicker({
  currentId,
  onPick,
}: {
  currentId: string | null;
  onPick: (id: string, name: string, content: string) => void;
}) {
  const all = useSmsTemplates();
  const approved = all.filter((t) => t.status === "approved");
  return (
    <div className="flex items-center gap-2 text-xs">
      <Select
        value={currentId ?? ""}
        onValueChange={(id) => {
          const t = approved.find((x) => x.id === id);
          if (t) {
            onPick(t.id, t.name, toComposeSyntax(t.content));
            toast.success(`已套用模板「${t.name}」`);
          }
        }}
      >
        <SelectTrigger className="h-8 flex-1 text-xs bg-background">
          <FileText className="h-3.5 w-3.5 text-primary mr-1" />
          <SelectValue placeholder="选择一个已报备模板（必选）…" />
        </SelectTrigger>
        <SelectContent>
          {approved.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              暂无已审核模板
            </div>
          ) : (
            approved.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                    {t.channel === "otp"
                      ? "验证码"
                      : t.channel === "marketing"
                      ? "营销"
                      : "通知"}
                  </Badge>
                  <span>{t.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {t.locale}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {getTemplateDeliverableRegions(t.id).length > 0
                      ? getTemplateDeliverableRegions(t.id).map(regionLabel).join(" / ")
                      : "当前无可用通道"}
                  </span>
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

/* -------------------- 合规状态条 -------------------- */

function ComplianceStrip({ templateName }: { templateName: string | null }) {
  if (templateName) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 pt-1">
        <ShieldCheck className="h-3.5 w-3.5" />
        来自已报备模板「{templateName}」，可放心发送
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-400 pt-1">
      <ShieldAlert className="h-3.5 w-3.5" />
      <span>请先在上方选择一个已报备模板后再发送。</span>
    </div>
  );
}
