import { useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  Sparkles,
  Mailbox as MailboxIcon,
  X,
  Loader2,
  Eye,
  Trash2,
  ShieldOff,
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
  addSmsTemplate,
  type SmsTplChannel,
} from "@/lib/sms-templates-store";
import { Link } from "@tanstack/react-router";
import { FileText, ShieldCheck, ShieldAlert } from "lucide-react";

import {
  MESSAGE_VARIABLES,
  renderTemplate,
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
  chargeAiGeneration,
  costForChannel,
  COST_AI_EMAIL,
  COST_AI_SMS,
  COST_VIEW_EMAIL,
  COST_VIEW_PHONE,
  computeReachBreakdown,
  performReachAutoUnlocks,
  useLedger,
} from "@/lib/credits-ledger";
import { useLeadProfile } from "@/lib/lead-profile";
import { useCurrentUser } from "@/lib/current-user";
import { generateAiContent } from "@/lib/api/ai-compose.functions";

export type ComposeChannel = "email" | "phone";

function LangToggle({
  value,
  onChange,
}: {
  value: "zh" | "en";
  onChange: (v: "zh" | "en") => void;
}) {
  return (
    <div className="inline-flex items-center rounded-md border bg-background p-0.5 text-xs">
      <span className="px-1.5 text-[10px] text-muted-foreground">目标语言</span>
      {(["zh", "en"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "rounded px-2 py-0.5 transition-colors",
            value === v
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {v === "zh" ? "中文" : "英文"}
        </button>
      ))}
    </div>
  );
}

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

  const [recipients, setRecipients] = useState<Recipient[]>(incomingRecipients);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [aiUsed, setAiUsed] = useState(false);
  const [aiCount, setAiCount] = useState(0);
  const [senderId, setSenderId] = useState<string>("");
  const [previewIdx, setPreviewIdx] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [targetLang, setTargetLang] = useState<"zh" | "en">("zh");
  // 短信合规追踪：内容是否来自已报备模板
  const [smsTemplateId, setSmsTemplateId] = useState<string | null>(null);
  const [smsTemplateName, setSmsTemplateName] = useState<string | null>(null);
  const [submitTplOpen, setSubmitTplOpen] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  // 重置 state 每次打开
  useEffect(() => {
    if (!open) return;
    setRecipients(incomingRecipients);
    setPreviewIdx(0);
    setSubject("");
    setContent("");
    setAiUsed(false);
    setAiCount(0);
    setTargetLang("zh");
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
  const [focusField, setFocusField] = useState<"subject" | "content">(
    isEmail ? "subject" : "content",
  );

  function insertVarAt(field: "subject" | "content", v: string) {
    const token = `{${v}}`;
    if (field === "subject") {
      const el = subjectRef.current;
      const s = subject;
      if (!el) return setSubject(s + token);
      const start = el.selectionStart ?? s.length;
      const end = el.selectionEnd ?? s.length;
      const next = s.slice(0, start) + token + s.slice(end);
      setSubject(next);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      const el = contentRef.current;
      const s = content;
      if (!el) return setContent(s + token);
      const start = el.selectionStart ?? s.length;
      const end = el.selectionEnd ?? s.length;
      const next = s.slice(0, start) + token + s.slice(end);
      setContent(next);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      });
    }
  }

  const previewRecipient = recipients[Math.min(previewIdx, recipients.length - 1)];

  // 退订预检：Dialog 打开即计算，用于顶部非阻塞横幅
  const suppressedRecipients = useMemo(
    () => {
      const kind = isEmail ? "email" : "phone";
      return recipients.filter((r) => isSuppressed(kind, r.address));
    },
    [recipients, isEmail],
  );
  const previewSubject = previewRecipient
    ? renderTemplate(subject, previewRecipient.ctx)
    : "";
  const previewContent = previewRecipient
    ? renderTemplate(content, previewRecipient.ctx)
    : "";

  const missingContact = useMemo(
    () => recipients.filter((r) => !r.ctx.联系人名 || !r.ctx.联系人名.trim()).length,
    [recipients],
  );

  // 费用合计
  const unit = costForChannel(isEmail ? "email" : "phone");
  const segments = isEmail ? 1 : Math.max(1, smsSegments(content || ""));
  const sendCostPerRecipient = isEmail ? unit : unit * segments;
  const sendTotal = recipients.length * sendCostPerRecipient;

  // 未解锁字段的自动查看费合计（按每个收件人独立判断）
  const viewCostTotal = useMemo(() => {
    let total = 0;
    for (const r of recipients) {
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

  const aiCost = aiCount * (isEmail ? COST_AI_EMAIL : COST_AI_SMS);
  const grandTotal = sendTotal + viewCostTotal + aiCost;

  // 发件邮箱日发上限剩余额度（仅邮件）
  const remainingQuota =
    isEmail && sender ? Math.max(0, sender.dailyLimit - sender.sentToday) : Infinity;
  const overLimit = isEmail && !!sender && recipients.length > remainingQuota;

  const canSend =
    recipients.length > 0 &&
    (!isEmail || !!sender) &&
    (!isEmail || subject.trim().length > 0) &&
    content.trim().length > 0 &&
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
      const finalSubject = isEmail ? renderTemplate(subject, r.ctx) : undefined;
      const finalContent = renderTemplate(content, r.ctx);
      // 未解锁时先扣查看费并永久解锁（幂等）
      performReachAutoUnlocks({
        targetKind: r.targetKind,
        targetId: r.targetId,
        targetName: r.name,
        parentRef: r.parentRef,
        detail: r.address,
        fields: isEmail ? [{ field: "email" }] : [{ field: "phone" }],
      });
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
        }${
          aiCost > 0 ? `（含 AI 文案 ${aiCost} 积分）` : ""
        }，可在「触达」模块查看进度`,
      },
    );
  }

  function handleSend() {
    if (!canSend) return;
    // 短信合规软性拦截：未套用已报备模板时二次确认
    if (!isEmail && !smsTemplateId) {
      setConfirmSendOpen(true);
      return;
    }
    doSend();
  }

  async function handleAiGenerate(params: {
    scene: string;
    tone: "formal" | "friendly" | "concise";
    language: "zh" | "en";
    extra?: string;
  }) {
    setAiLoading(true);
    try {
      const sample = recipients[0];
      const res = await callGenerate({
        data: {
          channel: isEmail ? "email" : "sms",
          ...params,
          myCompany: profile.companyName,
          myName: user.name,
          sampleEnterprise: sample?.ctx.企业名,
        },
      });
      // 调用成功才扣 AI 费用
      chargeAiGeneration({
        channel: isEmail ? "email" : "phone",
        targetName: sample?.name ?? "AI 生成",
      });
      setTargetLang(params.language);
      if (isEmail && res.subject) setSubject(res.subject);
      if (res.content) setContent(res.content);
      setAiUsed(true);
      setAiCount((c) => c + 1);
      // AI 生成 → 视为未报备草稿
      if (!isEmail) {
        setSmsTemplateId(null);
        setSmsTemplateName(null);
      }
      setAiOpen(false);
      toast.success(`AI 已生成${isEmail ? "邮件" : "短信"}文案，扣除 ${
        isEmail ? COST_AI_EMAIL : COST_AI_SMS
      } 积分`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("AI 生成失败", { description: msg });
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
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
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                收件人（{recipients.length}）
              </Label>
              {recipients.length === 0 ? (
                <span className="text-xs text-rose-600">
                  {typeof totalSelected === "number" && totalSelected > 0
                    ? `已选 ${totalSelected} 条，均无${isEmail ? "邮箱" : "电话"}，已全部过滤`
                    : "无有效收件人，请关闭后重试"}
                </span>
              ) : (
                typeof totalSelected === "number" &&
                totalSelected > recipients.length && (
                  <span className="text-xs text-amber-600">
                    已自动过滤 {totalSelected - recipients.length} 条无
                    {isEmail ? "邮箱" : "电话"}的数据
                  </span>
                )
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
                            {r.name} · {r.address}
                          </span>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 rounded-md border bg-muted/30 p-2 max-h-28 overflow-y-auto">
              {recipients.map((r) => (
                <span
                  key={r.key}
                  className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs"
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted-foreground font-mono">
                    · {r.address}
                  </span>
                  {recipients.length > 1 && (
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
                  )}
                </span>
              ))}
            </div>
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
              <div className="flex items-center gap-2">
                <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAiOpen(true)}
                className="h-7 gap-1"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {isEmail
                  ? aiUsed
                    ? "AI 重新生成"
                    : "AI 生成"
                  : aiUsed
                    ? "AI 重新起草"
                    : "AI 起草模板"}
                <span className="text-xs text-muted-foreground">
                  -{isEmail ? COST_AI_EMAIL : COST_AI_SMS} 积分/次
                </span>
                </Button>
              </div>
            </div>

            {!isEmail && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  推荐使用已报备模板
                  <span className="text-muted-foreground font-normal">
                    海外营销短信须使用运营商预审模板，直发自由文本可能被拦截或封号
                  </span>
                </div>
                <SmsTemplatePicker
                  currentId={smsTemplateId}
                  onPick={(id, name, c) => {
                    setContent(c);
                    setSmsTemplateId(id);
                    setSmsTemplateName(name);
                    setAiUsed(false);
                  }}
                />
              </div>
            )}

            {/* 变量插入 */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">
                插入变量（光标处插入到{focusField === "subject" ? "主题" : "正文"}）：
              </span>
              {MESSAGE_VARIABLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVarAt(focusField, v)}
                  className="rounded border bg-background px-1.5 py-0.5 text-[11px] font-mono text-primary hover:bg-primary/10"
                >
                  {`{${v}}`}
                </button>
              ))}
            </div>

            {isEmail && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">主题 *</Label>
                <Input
                  ref={subjectRef}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  onFocus={() => setFocusField("subject")}
                  maxLength={120}
                  placeholder="例：{企业名}，关于 {行业} 出口合作的提案"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {isEmail ? "正文 *" : "短信内容 *"}
              </Label>
              <Textarea
                ref={contentRef}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  // 手动改动 → 视为脱离已报备模板
                  if (smsTemplateId) {
                    setSmsTemplateId(null);
                    setSmsTemplateName(null);
                  }
                }}
                onFocus={() => setFocusField("content")}
                rows={isEmail ? 8 : 5}
                maxLength={isEmail ? 5000 : 300}
                placeholder={
                  isEmail
                    ? "你好 {联系人名}，我是 {我的公司} 的 {我的姓名}……"
                    : "{联系人名}您好，我是{我的公司}的{我的姓名}……"
                }
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {content.length} / {isEmail ? 5000 : 300} 字
                  {!isEmail && content && (
                    <span className="ml-2">
                      · 拆分 {smsSegments(content)} 条
                    </span>
                  )}
                </span>
                {missingContact > 0 && (
                  <span className="text-amber-600">
                    {missingContact} 条记录缺少联系人名，将以「您好」代替
                  </span>
                )}
              </div>
              {!isEmail && content.trim().length > 0 && (
                <ComplianceStrip
                  templateName={smsTemplateName}
                  onSubmitAsTemplate={() => setSubmitTplOpen(true)}
                />
              )}
            </div>
          </section>

          {/* 预览 */}
          {recipients.length > 0 && (
            <section className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  预览（变量已替换）
                  <span className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-normal text-muted-foreground">
                    实时同步
                  </span>
                  {null}
                </Label>
                {recipients.length > 1 && (
                  <Select
                    value={String(previewIdx)}
                    onValueChange={(v) => setPreviewIdx(Number(v))}
                  >
                    <SelectTrigger className="h-7 w-[180px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {recipients.map((r, i) => (
                        <SelectItem key={r.key} value={String(i)}>
                          第 {i + 1} 条 · {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {isEmail && (
                <div className="text-xs">
                  <span className="text-muted-foreground">主题：</span>
                  <span className="font-medium">{previewSubject || "—"}</span>
                </div>
              )}
              <div className="text-xs whitespace-pre-wrap text-foreground/90 max-h-40 overflow-y-auto">
                {previewContent || (
                  <span className="text-muted-foreground">（暂无内容）</span>
                )}
              </div>
            </section>
          )}

          {/* 费用 */}
          <section className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs space-y-1 dark:border-rose-900/50 dark:bg-rose-950/30">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                发送费用（{recipients.length} {isEmail ? "封" : "条"} ×{" "}
                {sendCostPerRecipient} 积分{
                  !isEmail && content ? `，按 ${smsSegments(content)} 条拆分` : ""
                }）
              </span>
              <span className="font-medium">{sendTotal} 积分</span>
            </div>
            {viewCostTotal > 0 && (() => {
              const unitView = isEmail ? COST_VIEW_EMAIL : COST_VIEW_PHONE;
              const unlockCount = Math.round(viewCostTotal / unitView);
              const alreadyCount = recipients.length - unlockCount;
              return (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    自动解锁查看{isEmail ? "邮箱" : "电话"}（{unlockCount} 位未解锁
                    收件人 × {unitView} 积分
                    {alreadyCount > 0 ? `，另 ${alreadyCount} 位已解锁免费` : ""}
                    ，永久生效）
                  </span>
                  <span className="font-medium">{viewCostTotal} 积分</span>
                </div>
              );
            })()}
            {aiCost > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  AI 生成（{aiCount} 次 × {isEmail ? COST_AI_EMAIL : COST_AI_SMS}{" "}
                  积分）
                </span>
                <span className="font-medium">{aiCost} 积分</span>
              </div>
            )}
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

      <AiComposeDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        channel={channel}
        loading={aiLoading}
        defaultLanguage={targetLang}
        onGenerate={handleAiGenerate}
      />

      <SubmitTemplateDialog
        open={submitTplOpen}
        onOpenChange={setSubmitTplOpen}
        initialContent={content}
      />

      <Dialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              内容未使用已报备模板
            </DialogTitle>
            <DialogDescription>
              当前短信内容不是来自已审核模板，海外营销通道（Twilio 10DLC / 印度 DLT
              等）可能拦截该消息，甚至导致发送账号被封。
              <br />
              <br />
              建议：优先选择「已报备模板」发送；如为一次性沟通，也可先
              <button
                type="button"
                className="text-primary underline mx-0.5"
                onClick={() => {
                  setConfirmSendOpen(false);
                  setSubmitTplOpen(true);
                }}
              >
                提交为模板送审
              </button>
              后再发送。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSendOpen(false)}>
              返回修改
            </Button>
            <Button
              variant="outline"
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={() => {
                setConfirmSendOpen(false);
                doSend();
              }}
            >
              仍然发送
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

/* -------------------- AI 生成子弹窗 -------------------- */

function AiComposeDialog({
  open,
  onOpenChange,
  channel,
  loading,
  defaultLanguage = "zh",
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  channel: ComposeChannel;
  loading: boolean;
  defaultLanguage?: "zh" | "en";
  onGenerate: (p: {
    scene: string;
    tone: "formal" | "friendly" | "concise";
    language: "zh" | "en";
    extra?: string;
  }) => void;
}) {
  const isEmail = channel === "email";
  const [scene, setScene] = useState("开发信");
  const [tone, setTone] = useState<"formal" | "friendly" | "concise">("friendly");
  const [language, setLanguage] = useState<"zh" | "en">(defaultLanguage);
  const [extra, setExtra] = useState("");
  useEffect(() => {
    if (open) setLanguage(defaultLanguage);
  }, [open, defaultLanguage]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI 生成{isEmail ? "邮件" : "短信"}文案
          </DialogTitle>
          <DialogDescription className="text-xs">
            生成成功即扣 {isEmail ? COST_AI_EMAIL : COST_AI_SMS} 积分；失败不扣费。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">场景</Label>
            <Select value={scene} onValueChange={setScene}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="开发信">开发信（首次接触）</SelectItem>
                <SelectItem value="跟进">跟进未回复客户</SelectItem>
                <SelectItem value="报价">报价 / 商品推荐</SelectItem>
                <SelectItem value="展会邀请">展会邀请</SelectItem>
                <SelectItem value="节日问候">节日问候</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">语气</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">正式商务</SelectItem>
                  <SelectItem value="friendly">友好诚恳</SelectItem>
                  <SelectItem value="concise">简洁直接</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">目标语言</Label>
              <Select value={language} onValueChange={(v) => setLanguage(v as typeof language)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh">中文</SelectItem>
                  <SelectItem value="en">英文</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">补充要求（可选）</Label>
            <Textarea
              rows={3}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="如：突出我方价格优势、提及具体产品类目等"
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            取消
          </Button>
          <Button
            disabled={loading}
            onClick={() => onGenerate({ scene, tone, language, extra: extra.trim() || undefined })}
            className={cn("bg-primary", loading && "opacity-80")}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "生成中…" : "生成"}
          </Button>
        </DialogFooter>
      </DialogContent>
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
          <SelectValue placeholder="选择一个已报备模板套用…" />
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
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <Link
        to="/outreach/admin/sms-templates"
        target="_blank"
        className="text-primary hover:underline whitespace-nowrap"
      >
        管理模板 →
      </Link>
    </div>
  );
}

/* -------------------- 合规状态条 -------------------- */

function ComplianceStrip({
  templateName,
  onSubmitAsTemplate,
}: {
  templateName: string | null;
  onSubmitAsTemplate: () => void;
}) {
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
      <span>当前内容未报备，海外营销发送可能被拦截。</span>
      <button
        type="button"
        onClick={onSubmitAsTemplate}
        className="underline font-medium hover:text-amber-800"
      >
        提交为模板送审
      </button>
    </div>
  );
}

/* -------------------- 提交为模板送审 弹窗 -------------------- */

function SubmitTemplateDialog({
  open,
  onOpenChange,
  initialContent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialContent: string;
}) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<SmsTplChannel>("marketing");
  const [locale, setLocale] = useState("zh-CN");
  const [contentDraft, setContentDraft] = useState(initialContent);

  useEffect(() => {
    if (open) {
      setName("");
      setChannel("marketing");
      setLocale(/[a-zA-Z]/.test(initialContent) ? "en-US" : "zh-CN");
      setContentDraft(initialContent);
    }
  }, [open, initialContent]);

  const hasOptOut = /STOP|UNSUBSCRIBE|退订|TD|回T/i.test(contentDraft);
  const needOptOut = channel === "marketing" && !hasOptOut;

  function submit() {
    if (!name.trim()) {
      toast.error("请填写模板名称");
      return;
    }
    if (needOptOut) {
      toast.error("营销类模板必须包含退订提示（STOP / 退订 / TD）", {
        description: "可点击下方「一键补退订」自动追加",
      });
      return;
    }
    // 保留 {变量} 语法即可，模板存储层不做转换
    addSmsTemplate({ name: name.trim(), channel, locale, content: contentDraft });
    toast.success("已提交审核，预计 1 个工作日内反馈", {
      description: "审核通过后即可在模板下拉中选用",
    });
    onOpenChange(false);
  }

  function appendOptOut() {
    const suffix = locale === "en-US" ? " Reply STOP to opt out." : "回复T退订。";
    setContentDraft((c) => (c.endsWith(suffix.trim()) ? c : c.trimEnd() + " " + suffix));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            提交为模板送审
          </DialogTitle>
          <DialogDescription>
            当前撰写内容将进入合规审批流程；审批通过后成为可复用的已报备模板。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">模板名称 *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              placeholder="例：跟进 · 报价请求 中文"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">渠道类型</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as SmsTplChannel)}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketing">营销</SelectItem>
                  <SelectItem value="notification">通知</SelectItem>
                  <SelectItem value="otp">验证码</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">语言 / 地区</Label>
              <Select value={locale} onValueChange={setLocale}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-CN">中文</SelectItem>
                  <SelectItem value="en-US">英文</SelectItem>
                  <SelectItem value="multi">多语言</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">模板内容（可编辑）</Label>
              <span className="text-[10px] text-muted-foreground">
                {contentDraft.length} / 300 字
              </span>
            </div>
            <Textarea
              value={contentDraft}
              onChange={(e) => setContentDraft(e.target.value)}
              rows={5}
              maxLength={300}
              className="mt-1 font-mono text-xs"
            />
            {channel === "marketing" && (
              needOptOut ? (
                <div className="mt-1.5 flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1">
                    营销类模板必须包含退订提示（STOP / 退订 / TD / 回T）——运营商合规要求
                  </span>
                  <button
                    type="button"
                    onClick={appendOptOut}
                    className="shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 font-medium hover:bg-amber-100"
                  >
                    一键补退订
                  </button>
                </div>
              ) : (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  已包含退订提示，可提交审核
                </div>
              )
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={needOptOut}>
            提交审核
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}