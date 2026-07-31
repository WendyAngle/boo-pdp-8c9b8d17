import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ShieldCheck,
  Building2,
  BadgeCheck,
  FileCheck2,
  Upload,
  Clock,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  useCertification,
  submitCertification,
  approveCertification,
  resetCertification,
  STATUS_META,
  type CertStatus,
} from "@/lib/certification";
import { formatDateTime } from "@/lib/format-date";

export const Route = createFileRoute("/_app/outreach/certification")({
  head: () => ({
    meta: [
      { title: "企业实名认证 · 企业设置 | 出海大数据平台" },
      {
        name: "description",
        content:
          "完成企业实名认证，解锁触达、解锁客户与 AI 外呼等高级功能，保障交易与外联的真实可信。",
      },
    ],
  }),
  component: CertificationPage,
});

function CertificationPage() {
  const cert = useCertification();
  const navigate = useNavigate();

  return (
    <div className="p-6 space-y-5">
      <section
        className="relative overflow-hidden rounded-2xl p-6 lg:p-7 text-white"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="absolute -right-10 -bottom-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">企业实名认证</h1>
              <p className="text-white/85 text-sm mt-0.5 max-w-2xl">
                完成企业实名认证后，可解锁触达、解锁客户与 AI 智能外呼等高级能力，提升外联可信度。
              </p>
            </div>
          </div>
          <StatusChip status={cert.status} large />
        </div>
      </section>

      {cert.status === "verified" ? (
        <VerifiedPanel cert={cert} onReset={() => navigate({ to: "/outreach/certification" })} />
      ) : cert.status === "pending" ? (
        <PendingPanel cert={cert} onApprove={() => { approveCertification(); toast.success("认证已通过"); }} onReset={resetCertification} />
      ) : (
        <SubmitForm />
      )}
    </div>
  );
}

function StatusChip({ status, large }: { status: CertStatus; large?: boolean }) {
  const meta = STATUS_META[status];
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm ${
        large ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-1 text-xs"
      } font-medium`}
    >
      {status === "verified" && <CheckCircle2 className="h-4 w-4" />}
      {status === "pending" && <Clock className="h-4 w-4" />}
      {status === "unverified" && <AlertTriangle className="h-4 w-4" />}
      <span>{meta.label}</span>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function SubmitForm() {
  const [form, setForm] = useState({
    enterpriseName: "",
    creditCode: "",
    legalRep: "",
    registeredAddress: "",
    contactName: "",
    contactPhone: "",
    licenseName: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((s) => ({ ...s, [k]: v }));

  const valid =
    form.enterpriseName.trim() &&
    form.creditCode.trim().length >= 8 &&
    form.legalRep.trim() &&
    form.contactName.trim() &&
    form.contactPhone.trim() &&
    form.licenseName.trim();

  const onSubmit = async () => {
    if (!valid) {
      toast.error("请填写完整必填信息并上传营业执照");
      return;
    }
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 700));
    submitCertification(form);
    setSubmitting(false);
    toast.success("已提交认证申请，预计 1-2 个工作日完成审核");
  };

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <FileCheck2 className="h-4 w-4 text-primary" />
        提交认证资料
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="企业名称" required>
          <Input
            value={form.enterpriseName}
            onChange={(e) => set("enterpriseName", e.target.value)}
            placeholder="请输入企业全称"
          />
        </Field>
        <Field label="统一社会信用代码" required>
          <Input
            value={form.creditCode}
            onChange={(e) => set("creditCode", e.target.value.toUpperCase())}
            placeholder="如 91440300MA5XXXXX9X"
          />
        </Field>
        <Field label="法定代表人" required>
          <Input
            value={form.legalRep}
            onChange={(e) => set("legalRep", e.target.value)}
            placeholder="请输入法定代表人姓名"
          />
        </Field>
        <Field label="联系人" required>
          <Input
            value={form.contactName}
            onChange={(e) => set("contactName", e.target.value)}
            placeholder="企业联系人姓名"
          />
        </Field>
        <Field label="联系电话" required>
          <Input
            value={form.contactPhone}
            onChange={(e) => set("contactPhone", e.target.value)}
            placeholder="联系人手机号"
          />
        </Field>
        <Field label="注册地址">
          <Input
            value={form.registeredAddress}
            onChange={(e) => set("registeredAddress", e.target.value)}
            placeholder="企业注册地址"
          />
        </Field>
      </div>
      <Field label="营业执照" required>
        <label className="flex items-center gap-3 rounded-lg border border-dashed border-input bg-muted/30 px-4 py-3 cursor-pointer hover:bg-muted/60 transition-colors">
          <div className="h-9 w-9 rounded-md bg-accent flex items-center justify-center">
            <Upload className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm text-foreground">
              {form.licenseName || "点击上传营业执照（PDF / 图片）"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              支持 .pdf .jpg .png，大小不超过 5MB
            </div>
          </div>
          <input
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) set("licenseName", f.name);
            }}
          />
        </label>
      </Field>

      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-muted-foreground max-w-md">
          提交即同意平台核实所填信息，认证期间可继续使用基础功能，部分高级能力将在认证通过后开放。
        </p>
        <Button onClick={onSubmit} disabled={submitting}>
          {submitting ? "提交中…" : "提交认证"}
        </Button>
      </div>
    </Card>
  );
}

function PendingPanel({
  cert,
  onApprove,
  onReset,
}: {
  cert: ReturnType<typeof useCertification>;
  onApprove: () => void;
  onReset: () => void;
}) {
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-600">
        <Clock className="h-4 w-4" />
        认证审核中
      </div>
      <p className="text-sm text-muted-foreground">
        您的认证申请已提交，预计 1-2 个工作日完成审核。审核期间可继续使用基础功能，高级能力将在通过后开放。
      </p>
      <div className="grid gap-3 md:grid-cols-2 rounded-lg bg-muted/40 p-4">
        <InfoLine label="企业名称" value={cert.enterpriseName} />
        <InfoLine label="统一社会信用代码" value={cert.creditCode} />
        <InfoLine label="法定代表人" value={cert.legalRep} />
        <InfoLine label="联系人" value={cert.contactName} />
        <InfoLine label="联系电话" value={cert.contactPhone} />
        <InfoLine label="提交时间" value={cert.submittedAt ? formatDateTime(cert.submittedAt) : "—"} />
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onApprove}>
          <CheckCircle2 className="h-4 w-4" /> 模拟审核通过
        </Button>
        <Button variant="ghost" size="sm" onClick={onReset}>
          撤回并重填
        </Button>
      </div>
    </Card>
  );
}

function VerifiedPanel({ cert }: { cert: ReturnType<typeof useCertification>; onReset: () => void }) {
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
        <BadgeCheck className="h-4 w-4" />
        企业实名认证已通过
      </div>
      <div className="grid gap-3 md:grid-cols-2 rounded-lg bg-muted/40 p-4">
        <InfoLine label="企业名称" value={cert.enterpriseName} />
        <InfoLine label="统一社会信用代码" value={cert.creditCode} />
        <InfoLine label="法定代表人" value={cert.legalRep} />
        <InfoLine label="注册地址" value={cert.registeredAddress || "—"} />
        <InfoLine label="联系人" value={cert.contactName} />
        <InfoLine label="联系电话" value={cert.contactPhone} />
        <InfoLine label="认证编号" value={cert.certNo ?? "—"} />
        <InfoLine label="通过时间" value={cert.verifiedAt ? formatDateTime(cert.verifiedAt) : "—"} />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Badge variant="secondary" className="gap-1">
          <Building2 className="h-3.5 w-3.5" /> 触达 · 解锁 · AI 外呼能力已开放
        </Badge>
        <Button variant="ghost" size="sm" onClick={resetCertification}>
          <RefreshCw className="h-4 w-4" /> 重新认证
        </Button>
      </div>
    </Card>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground truncate">{value}</div>
    </div>
  );
}
