// Small presentational pieces shared by the supplier screens.
import { DocName } from "@/components/DocName";
import { CalendarClock, CheckCircle2, Eye, FileText, Info, Lock, MinusCircle, PlusCircle, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge, cx, Mono, type Tone } from "@/components/ui";
import { fmtDate, fmtDateTime, nowIso, userName } from "@/domain/selectors";
import type { CiqCase, DocumentRef, OpenPoint } from "@/domain/types";
import { usePortalCaps } from "@/store/portalCaps";
import { useStore } from "@/store/store";
import { changedAt, dueParts, isEmptyDelta, isWithdrawn, sectionCode, sectionTitle, wasReturned, type SectionDelta, type SupplierStatus } from "./lib";

export function StatusPill({ status }: { status: Pick<SupplierStatus, "label" | "tone"> }) {
  return (
    <Badge tone={status.tone} dot>
      {status.label}
    </Badge>
  );
}

/** "Due 4 Nov 2026 · in 29 days" — overdue in the bad tone, always with text. */
export function DueText({ due, className, compact }: { due: string; className?: string; compact?: boolean }) {
  if (!due) return null; // no due date known (live portal): say nothing rather than "Due — · in NaN days"
  const { overdue, days } = dueParts(due, nowIso());
  const rel = days === 0 ? "due today" : overdue ? `overdue by ${-days} day${days === -1 ? "" : "s"}` : `in ${days} day${days === 1 ? "" : "s"}`;
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[12.5px]", overdue ? "font-medium text-bad" : "text-ink-2", className)}>
      <CalendarClock size={13} className="shrink-0" />
      {compact ? (
        <span className="whitespace-nowrap">{overdue ? `Overdue · ${fmtDate(due)}` : `Due ${fmtDate(due)}`}</span>
      ) : (
        <span>
          Due {fmtDate(due)} · {rel}
        </span>
      )}
    </span>
  );
}

/** Beiersdorf reference line: case id and material number. */
export function CaseRef({ c, className }: { c: CiqCase; className?: string }) {
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-ink-3", className)}>
      <span>Beiersdorf ref.</span>
      <Mono className="text-ink-2">{c.id}</Mono>
      {c.materialNo && (
        <>
          <span aria-hidden>·</span>
          <span>Material no.</span>
          <Mono className="text-ink-2">{c.materialNo}</Mono>
        </>
      )}
    </span>
  );
}

const BANNER: Record<"info" | "ok" | "neutral" | "brand", { box: string; icon: string }> = {
  info: { box: "bg-info-soft", icon: "text-info" },
  ok: { box: "bg-ok-soft", icon: "text-ok" },
  neutral: { box: "bg-surface-2 border border-line", icon: "text-ink-3" },
  brand: { box: "bg-brand-soft", icon: "text-brand" },
};

/** Calm full-width status message. Text carries the meaning; colour only supports it. */
export function Banner({ tone = "info", icon, title, children, action }: { tone?: "info" | "ok" | "neutral" | "brand"; icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const t = BANNER[tone];
  return (
    <div className={cx("flex flex-col gap-3 rounded-card px-4 py-3.5 sm:flex-row sm:items-center", t.box)}>
      <span className={cx("mt-0.5 shrink-0 self-start sm:self-center", t.icon)}>{icon ?? (tone === "ok" ? <CheckCircle2 size={18} /> : <Info size={18} />)}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">{title}</p>
        {children && <div className="mt-0.5 text-[13px] text-ink-2">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** "Answered by Ravi Menon · 2 Oct, 14:05" (REQ-CTL-001: parallel contacts, per-answer attribution). */
export function Attribution({ c, keyId, verb = "Answered", fallback }: { c: CiqCase; keyId: string; verb?: string; fallback?: string }) {
  const { state, me } = useStore();
  const a = c.answeredBy[keyId];
  if (!a) return fallback ? <span className="text-[11.5px] text-ink-3">{fallback}</span> : null;
  // M9: filled in when its section opened (e.g. FLD-A2-101 with the main INCI); the supplier can change it
  if (a.by === "system") return <span className="text-[11.5px] text-ink-3">Pre-filled · {fmtDateTime(a.at)}</span>;
  return (
    <span className="text-[11.5px] text-ink-3">
      {verb} by <span className="font-medium text-ink-2">{userName(state, a.by)}</span>
      {a.by === me.id ? " (you)" : ""} · {fmtDateTime(a.at)}
    </span>
  );
}

export function LockedNote({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-ink-3">
      <Lock size={12} />
      {children}
    </span>
  );
}

export function RequestedBadge() {
  return <Badge tone="violet">Requested by Beiersdorf</Badge>;
}

/** Where a question stands for the supplier, plus "Changed by Beiersdorf" when the raiser edited it (AS-08). */
export function QuestionBadges({ op }: { op: OpenPoint }) {
  const changed = changedAt(op);
  return (
    <>
      {op.status === "open" &&
        (wasReturned(op) ? (
          <Badge tone="warn" dot>
            More information needed
          </Badge>
        ) : (
          <Badge tone="brand" dot>
            Your answer needed
          </Badge>
        ))}
      {op.status === "in-progress" && (
        <Badge tone="info" dot>
          With Beiersdorf
        </Badge>
      )}
      {op.status === "closed" &&
        (isWithdrawn(op) ? (
          <Badge tone="neutral" dot>
            Closed, no answer needed
          </Badge>
        ) : (
          <Badge tone="ok" dot>
            Closed
          </Badge>
        ))}
      {changed && <Badge tone="violet">Changed by Beiersdorf · {fmtDate(changed)}</Badge>}
    </>
  );
}

/** "CoA_2408.pdf · uploaded 12 Oct 2026": how a document is referenced (BRM v2: no versions). */
export const docRef = (d: Pick<DocumentRef, "name" | "uploadedAt">) => `${d.name} · uploaded ${fmtDate(d.uploadedAt)}`;

/** The documents stored at a questionnaire item, newest first: file name, upload time, uploader, size. No delete. */
export function DocumentList({ docs, className }: { docs: DocumentRef[]; className?: string }) {
  const { state, me } = useStore();
  const caps = usePortalCaps();
  if (!docs.length) return null;
  return (
    <ul className={cx("space-y-1.5", className)}>
      {docs.map((d) => (
        <li key={d.id} data-testid={`doc-${d.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px]">
          <FileText size={14} className="shrink-0 text-ink-3" />
          <DocName id={d.id} name={d.name} className="min-w-0 font-medium text-ink [overflow-wrap:anywhere]" />
          <span className="text-xs text-ink-3">
            {[`uploaded ${fmtDateTime(d.uploadedAt)}`, `by ${userName(state, d.uploadedBy)}${d.uploadedBy === me.id ? " (you)" : ""}`, d.sizeKb ? `${d.sizeKb} KB` : ""].filter(Boolean).join(" · ")}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {caps.canPreview(d.id) && (
              <button type="button" onClick={() => caps.preview(d.id)} data-testid={`doc-preview-${d.id}`} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] font-medium text-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand" aria-label={`Preview ${d.name}`}>
                <Eye size={14} aria-hidden="true" /> Preview
              </button>
            )}
            {caps.canRemove(d.id) && <RemoveDoc docId={d.id} name={d.name} onRemove={caps.remove} />}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** "Remove" on the contact's own upload, with an inline confirmation (plan v6 D-12: a soft delete, kept for the audit). */
function RemoveDoc({ docId, name, onRemove }: { docId: string; name: string; onRemove: (docId: string) => Promise<boolean> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (busy) return <span className="px-1.5 text-[12.5px] text-ink-3" data-testid={`doc-removing-${docId}`}>Removing…</span>;
  if (!asking)
    return (
      <button type="button" onClick={() => setAsking(true)} data-testid={`doc-remove-${docId}`} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] font-medium text-ink-3 hover:bg-bad-soft hover:text-bad focus-visible:outline-2 focus-visible:outline-brand" aria-label={`Remove ${name}`}>
        <Trash2 size={14} aria-hidden="true" /> Remove
      </button>
    );
  return (
    <span role="group" aria-label={`Remove ${name}?`} className="inline-flex items-center gap-1.5 text-[12.5px]">
      <span className="text-ink-2">Remove this file?</span>
      <button type="button" data-testid={`doc-remove-yes-${docId}`} className="rounded-md px-1.5 py-0.5 font-semibold text-bad hover:bg-bad-soft" onClick={() => { setBusy(true); void onRemove(docId).finally(() => { setBusy(false); setAsking(false); }); }}>
        Yes, remove
      </button>
      <button type="button" className="rounded-md px-1.5 py-0.5 text-ink-3 hover:bg-surface-2" onClick={() => setAsking(false)}>
        No
      </button>
    </span>
  );
}

/**
 * What the last metadata answer did to the questionnaire (D-1): sections that opened or closed, became mandatory or
 * optional, the K5.1 waiver, and, after the completeness confirmation, the sections kept because the scope only grows.
 */
export function SectionDeltaNote({ delta, part2, templateVersion, onSelect }: { delta: SectionDelta; part2: boolean; templateVersion?: string; onSelect: (sectionId: string) => void }) {
  const tv = templateVersion;
  const links = (ids: string[]) =>
    ids.map((id, i) => (
      <span key={id}>
        {i > 0 && ", "}
        <button type="button" onClick={() => onSelect(id)} className="font-medium text-brand hover:underline">
          {sectionCode(id, tv)} {sectionTitle(id, tv)}
        </button>
      </span>
    ));
  const line = (key: string, icon: ReactNode, children: ReactNode) => (
    <li key={key} className="flex items-start gap-1.5">
      <span className="mt-[3px] shrink-0">{icon}</span>
      <span>{children}</span>
    </li>
  );
  const plus = <PlusCircle size={13} className="text-ok" />;
  const minus = <MinusCircle size={13} className="text-ink-3" />;
  const info = <Info size={13} className="text-ink-3" />;
  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
      {isEmptyDelta(delta) ? (
        <p className="flex items-center gap-1.5">
          {info} Your sections did not change.
        </p>
      ) : (
        <ul className="space-y-1">
          {delta.opened.length > 0 && line("opened", plus, <>{part2 ? "Added to your questionnaire: " : "Opened: "}{links(delta.opened)}.{part2 && " You also get a task for it."}</>)}
          {delta.nowMandatory.length > 0 && line("mandatory", plus, <>Now mandatory: {links(delta.nowMandatory)}.</>)}
          {delta.unwaived.length > 0 && line("unwaived", plus, <>{links(delta.unwaived)} applies again.</>)}
          {delta.closed.length > 0 && line("closed", minus, <>Closed: {delta.closed.map((id) => `${sectionCode(id, tv)} ${sectionTitle(id, tv)}`).join(", ")}. Your answers there are kept and come back if the section reopens.</>)}
          {delta.nowOptional.length > 0 && line("optional", minus, <>Now optional: {links(delta.nowOptional)}.</>)}
          {delta.waived.length > 0 && line("waived", info, <>{links(delta.waived)} is now waived. Give the reason in the box under this question.</>)}
          {delta.kept.length > 0 && line("kept", info, <>Stays in your questionnaire: {links(delta.kept)}. You confirmed completeness, so sections are only added now.</>)}
        </ul>
      )}
    </div>
  );
}

/** Neutral note for an origin without rules (waste, CCU, chemical recycling). No scope check: Beiersdorf may ask later. */
export function UndefinedOriginNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
      <Info size={14} className="mt-0.5 shrink-0 text-ink-3" />
      <span>{children}</span>
    </p>
  );
}

export function CountTile({ label, value, hint, tone = "neutral" }: { label: string; value: number; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3 shadow-card">
      <div className="flex items-baseline gap-2">
        <span className="text-[24px] leading-none font-semibold tracking-tight text-ink">{value}</span>
        <span className="text-[13px] font-medium text-ink-2">{label}</span>
      </div>
      {hint && <p className={cx("mt-1.5 text-[12px]", tone === "bad" ? "font-medium text-bad" : "text-ink-3")}>{hint}</p>}
    </div>
  );
}

/** Shown instead of a confirm or release button when that step is assigned to other contacts of the company. */
export function OnlyOthers({ names, what, nobody }: { names: string[]; what: string; /** Prototype requests: nobody named on the request may do it (the case owner names one who may). */ nobody?: string }) {
  if (!names.length && nobody)
    return (
      <p className="max-w-[260px] self-center text-[12.5px] text-ink-3" data-testid="no-confirmer">
        Nobody named on this request may {what}. Ask {nobody} at Beiersdorf to name a colleague who may.
      </p>
    );
  return <p className="max-w-[260px] self-center text-[12.5px] text-ink-3">{names.length ? `${names.join(", ")} can ${what} for your company.` : `This step is assigned to another contact of your company, who can ${what}.`}</p>;
}
