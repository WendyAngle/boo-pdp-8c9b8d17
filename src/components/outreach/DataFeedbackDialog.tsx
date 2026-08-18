import { useMemo, useState } from "react";
import { MessageSquareWarning, Plus, Trash2, Info, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Enterprise } from "@/data/enterprises";
import {
  CONTACT_FEEDBACK_FIELDS,
  ENTERPRISE_FEEDBACK_FIELDS,
  ISSUE_TYPE_LABEL,
  NEW_CONTACT_FIELDS,
  SOURCE_NEEDS_URL,
  SOURCE_TYPE_LABEL,
  submitFeedback,
  type FeedbackIssueType,
  type FeedbackItem,
  type FeedbackSourceType,
  type FeedbackSubjectKind,
  type NewContactDraft,
} from "@/lib/data-feedback";

interface Props {
  enterprise: Enterprise;
  /** 指定默认反馈对象（关联人物卡片入口） */
  defaultContactIndex?: number;
  /** 触发按钮形态 */
  trigger?: React.ReactNode;
}

interface Draft {
  field: string;
  issue: FeedbackIssueType;
  suggested: string;
}

const ISSUE_TYPES: FeedbackIssueType[] = ["wrong", "outdated", "missing", "invalid"];
const SOURCE_TYPES = Object.keys(SOURCE_TYPE_LABEL) as FeedbackSourceType[];

function enterpriseValue(e: Enterprise, key: string): string {
  const raw = (e as unknown as Record<string, unknown>)[key];
  if (Array.isArray(raw)) return raw.join("、");
  return raw ? String(raw) : "";
}

export function DataFeedbackDialog({ enterprise, defaultContactIndex, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState<FeedbackSubjectKind>(
    defaultContactIndex === undefined ? "enterprise" : "contact",
  );
  const [contactIdx, setContactIdx] = useState(defaultContactIndex ?? 0);
  const [drafts, setDrafts] = useState<Draft[]>([
    { field: "", issue: "wrong", suggested: "" },
  ]);
  const [sourceType, setSourceType] = useState<FeedbackSourceType | "">("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [allowContact, setAllowContact] = useState(true);

  const contact = enterprise.contacts[contactIdx];
  const fieldDefs = subject === "enterprise" ? ENTERPRISE_FEEDBACK_FIELDS : CONTACT_FEEDBACK_FIELDS;

  const currentOf = (key: string): string => {
    if (subject === "enterprise") return enterpriseValue(enterprise, key);
    if (!contact) return "";
    const raw = (contact as unknown as Record<string, unknown>)[key];
    return raw ? String(raw) : "";
  };

  const reset = () => {
    setSubject(defaultContactIndex === undefined ? "enterprise" : "contact");
    setContactIdx(defaultContactIndex ?? 0);
    setDrafts([{ field: "", issue: "wrong", suggested: "" }]);
    setSourceType("");
    setSourceUrl("");
    setSourceNote("");
    setAllowContact(true);
  };

  const usedFields = drafts.map((d) => d.field).filter(Boolean);

  const validItems = useMemo<FeedbackItem[]>(
    () =>
      drafts
        .filter((d) => d.field)
        .map((d) => ({
          field: d.field,
          label: fieldDefs.find((f) => f.key === d.field)?.label ?? d.field,
          current: currentOf(d.field),
          suggested: d.suggested.trim(),
          issue: d.issue,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drafts, subject, contactIdx],
  );

  const needsUrl = sourceType ? SOURCE_NEEDS_URL.includes(sourceType) : false;
  const missingSuggested = validItems.some(
    (i) => i.issue !== "invalid" && !i.suggested,
  );

  const disabledReason = !validItems.length
    ? "请至少选择一个存在问题的字段"
    : missingSuggested
      ? "请填写正确值（无效/重复可不填）"
      : !sourceType
        ? "请选择数据来源"
        : needsUrl && !sourceUrl.trim()
          ? "请填写来源链接"
          : sourceType === "other" && !sourceNote.trim()
            ? "请补充说明数据来源"
            : "";

  const onSubmit = () => {
    if (disabledReason) return;
    submitFeedback({
      enterpriseId: enterprise.id,
      enterpriseName: enterprise.name,
      subjectKind: subject,
      contactIndex: subject === "contact" ? contactIdx : undefined,
      contactName: subject === "contact" ? contact?.name : undefined,
      items: validItems,
      sourceType: sourceType as FeedbackSourceType,
      sourceUrl: sourceUrl.trim() || undefined,
      sourceNote: sourceNote.trim() || undefined,
      allowContact,
    });
    toast.success("反馈已提交，感谢您的贡献", {
      description: "平台将在 1-3 个工作日内核实，核实通过后数据会自动更新",
    });
    setOpen(false);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-1.5">
            <MessageSquareWarning className="h-4 w-4" />
            问题反馈
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[86vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>问题反馈 · 数据纠错</DialogTitle>
          <DialogDescription>
            请指出有问题的字段并提供正确值，同时说明数据来源以便平台核实。核实通过后将更新企业档案。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* 反馈对象 */}
          <section className="space-y-2">
            <Label className="text-xs text-muted-foreground">反馈对象</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={subject === "enterprise" ? "default" : "outline"}
                onClick={() => {
                  setSubject("enterprise");
                  setDrafts([{ field: "", issue: "wrong", suggested: "" }]);
                }}
              >
                企业数据
              </Button>
              <Button
                type="button"
                size="sm"
                variant={subject === "contact" ? "default" : "outline"}
                disabled={!enterprise.contacts.length}
                onClick={() => {
                  setSubject("contact");
                  setDrafts([{ field: "", issue: "wrong", suggested: "" }]);
                }}
              >
                关联人物
              </Button>
              {subject === "contact" && (
                <Select
                  value={String(contactIdx)}
                  onValueChange={(v) => {
                    setContactIdx(Number(v));
                    setDrafts([{ field: "", issue: "wrong", suggested: "" }]);
                  }}
                >
                  <SelectTrigger className="h-8 w-[220px]">
                    <SelectValue placeholder="选择联系人" />
                  </SelectTrigger>
                  <SelectContent>
                    {enterprise.contacts.map((c, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {c.name}
                        {c.title ? ` · ${c.title}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Badge variant="secondary" className="ml-auto font-normal">
                {enterprise.name}
              </Badge>
            </div>
          </section>

          {/* 问题字段 */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                问题字段（可添加多条）
              </Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                onClick={() =>
                  setDrafts((d) => [...d, { field: "", issue: "wrong", suggested: "" }])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                添加字段
              </Button>
            </div>

            <div className="space-y-2">
              {drafts.map((d, i) => {
                const cur = d.field ? currentOf(d.field) : "";
                return (
                  <div key={i} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={d.field}
                        onValueChange={(v) =>
                          setDrafts((arr) =>
                            arr.map((x, k) => (k === i ? { ...x, field: v } : x)),
                          )
                        }
                      >
                        <SelectTrigger className="h-8 w-[200px]">
                          <SelectValue placeholder="选择字段" />
                        </SelectTrigger>
                        <SelectContent>
                          {fieldDefs.map((f) => (
                            <SelectItem
                              key={f.key}
                              value={f.key}
                              disabled={f.key !== d.field && usedFields.includes(f.key)}
                            >
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={d.issue}
                        onValueChange={(v) =>
                          setDrafts((arr) =>
                            arr.map((x, k) =>
                              k === i ? { ...x, issue: v as FeedbackIssueType } : x,
                            ),
                          )
                        }
                      >
                        <SelectTrigger className="h-8 w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ISSUE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {ISSUE_TYPE_LABEL[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {drafts.length > 1 && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            setDrafts((arr) => arr.filter((_, k) => k !== i))
                          }
                          aria-label="删除该条"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <div className="text-[11px] text-muted-foreground">系统当前值</div>
                        <div className="min-h-8 rounded-md border border-dashed bg-background/60 px-2.5 py-1.5 text-sm text-muted-foreground break-all">
                          {d.field ? cur || "未提供" : "—"}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[11px] text-muted-foreground">
                          正确值
                          {d.issue === "invalid" && (
                            <span className="ml-1 text-muted-foreground/70">（可不填）</span>
                          )}
                        </div>
                        <Input
                          className="h-8"
                          value={d.suggested}
                          maxLength={200}
                          placeholder={
                            d.issue === "invalid"
                              ? "如需说明可在下方备注"
                              : "请填写您了解到的正确内容"
                          }
                          onChange={(ev) =>
                            setDrafts((arr) =>
                              arr.map((x, k) =>
                                k === i ? { ...x, suggested: ev.target.value } : x,
                              ),
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 数据来源 */}
          <section className="space-y-2">
            <Label className="text-xs text-muted-foreground">数据来源（必填）</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Select
                value={sourceType}
                onValueChange={(v) => setSourceType(v as FeedbackSourceType)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="请选择来源类型" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {SOURCE_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="h-9"
                value={sourceUrl}
                maxLength={300}
                placeholder={needsUrl ? "来源链接（必填），如 https://…" : "来源链接（选填）"}
                onChange={(ev) => setSourceUrl(ev.target.value)}
              />
            </div>
            <Textarea
              rows={3}
              maxLength={500}
              value={sourceNote}
              placeholder="补充说明：如何获取到该信息、核实时间、可佐证的细节等（其他来源必填）"
              onChange={(ev) => setSourceNote(ev.target.value)}
            />
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              提交即表示您确认所提供内容真实合法，平台仅将其用于数据核实与更新。
            </p>
          </section>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={allowContact}
              onCheckedChange={(v) => setAllowContact(Boolean(v))}
            />
            允许平台在核实过程中与我联系
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {disabledReason && (
            <span className="mr-auto self-center text-xs text-muted-foreground">
              {disabledReason}
            </span>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button disabled={Boolean(disabledReason)} onClick={onSubmit}>
            提交反馈
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
