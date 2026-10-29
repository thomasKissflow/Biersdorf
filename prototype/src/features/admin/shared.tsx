// Shared building blocks for the business-administration screens (REQ-CFG-001…006).
import { Info, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useLiveFeatures } from "@/components/liveFeatures";
import { Card, EmptyState, LargerScreenNote, cx } from "@/components/ui";
import { SECTION_BY_ID } from "@/domain/catalog";
import { can } from "@/domain/permissions";
import { useIsPhone } from "@/shell/useLayoutMode";
import { useStore } from "@/store/store";

export * from "./config";

/** Only the business administrator edits; every other internal role reads the configuration (read-only; the auditor
 *  since 14 Oct, RMM and the departments since 29 Oct). `canEdit` is the role (the
 *  pages, the Test rules tab); `canChange` also needs configuration changes to work here: the live app of this version
 *  shows the configuration read-only to the business administrator too (FE-CLEANUP A7, A16), so the edit controls
 *  follow `canChange` only.
 *  Phones (< 768 px, Thomas 30 Oct): nobody changes the configuration there, so `canChange` is false and the business
 *  administrator gets "Use a larger screen to edit" instead (`largerScreen`); viewing works as for every other role.
 *  `phone`: the pages' own phone layout (cards instead of tables; no Test rules, no Run reminders now). */
export function useAdminAccess() {
  const { state, me, persona } = useStore();
  const { configEdit } = useLiveFeatures();
  const phone = useIsPhone();
  const canEdit = can(state, me.id, "config.manage");
  return { canEdit, canChange: canEdit && configEdit && !phone, largerScreen: canEdit && configEdit && phone, phone, canRead: canEdit || persona.side === "internal", isAuditor: persona.id === "auditor", persona };
}

/** Page guard: the configuration pages are for the business administrator (edit) and the other internal roles (read-only). */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { canRead } = useAdminAccess();
  if (canRead) return <>{children}</>;
  return (
    <Card data-testid="admin-no-access">
      <EmptyState icon={<ShieldCheck size={22} />} title="Business administration">
        Only the business administrator maintains the rules, the questionnaire, the section owners and the reminders.
      </EmptyState>
    </Card>
  );
}

type CalloutTone = "info" | "warn" | "neutral" | "brand";

const CALLOUT: Record<CalloutTone, { box: string; icon: string }> = {
  info: { box: "bg-info-soft", icon: "text-info" },
  warn: { box: "bg-warn-soft", icon: "text-[color-mix(in_oklch,var(--warn)_75%,var(--ink))]" },
  neutral: { box: "bg-surface-2 border border-line", icon: "text-ink-3" },
  brand: { box: "bg-brand-soft", icon: "text-brand" },
};

/** Calm inline notice: soft tinted background, icon, optional title and action. */
export function Callout({ tone = "info", icon, title, children, action, className }: { tone?: CalloutTone; icon?: ReactNode; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const t = CALLOUT[tone];
  const defaultIcon = tone === "warn" ? <TriangleAlert size={16} /> : <Info size={16} />;
  return (
    <div className={cx("flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg px-4 py-3 text-[13px] text-ink", t.box, className)}>
      <span className={cx("mt-px shrink-0", t.icon)}>{icon ?? defaultIcon}</span>
      <div className="min-w-0 flex-1 basis-[15rem]">
        {title && <p className="font-semibold text-ink">{title}</p>}
        {children && <div className={cx("text-ink-2", title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="ml-7 max-w-[calc(100%-1.75rem)] shrink-0 self-center sm:ml-0 sm:max-w-full">{action}</div>}
    </div>
  );
}

/** Shown to the auditor: the configuration is visible, but only the business administrator changes it. To the business
 *  administrator on a phone: "Use a larger screen to edit", then `onPhone` (what can still be done there). */
export function ReadOnlyNote({ what, extra, onPhone }: { what: string; extra?: ReactNode; onPhone?: ReactNode }) {
  const { canEdit, largerScreen } = useAdminAccess();
  if (largerScreen) return <LargerScreenNote>{onPhone}</LargerScreenNote>;
  if (canEdit) return null;
  return (
    <div data-testid="admin-read-only">
      <Callout tone="neutral" icon={<Lock size={15} />} className="mb-5">
        <span className="font-medium text-ink">Read-only.</span> Only the business administrator changes {what}.{extra ? <> {extra}</> : null}
      </Callout>
    </div>
  );
}

/** Section code chip with the full title as tooltip. */
export function SectionChip({ id, tone = "neutral", prefix }: { id: string; tone?: "neutral" | "brand" | "ok" | "bad"; prefix?: string }) {
  const sec = SECTION_BY_ID[id];
  const cls = {
    neutral: "border-line bg-surface-2 text-ink-2",
    brand: "border-transparent bg-brand-soft text-brand",
    ok: "border-transparent bg-ok-soft text-ok",
    bad: "border-transparent bg-bad-soft text-bad",
  }[tone];
  return (
    <span title={sec ? `${sec.code} · ${sec.title}` : id} className={cx("inline-flex items-center rounded-md border px-1.5 py-px font-mono text-[11.5px] whitespace-nowrap", cls)}>
      {prefix}
      {sec?.code ?? id}
    </span>
  );
}

export function SectionChips({ ids, tone, prefix, empty = "—" }: { ids: string[]; tone?: "neutral" | "brand" | "ok" | "bad"; prefix?: string; empty?: ReactNode }) {
  if (!ids.length) return <span className="text-ink-3">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => (
        <SectionChip key={id} id={id} tone={tone} prefix={prefix} />
      ))}
    </div>
  );
}
