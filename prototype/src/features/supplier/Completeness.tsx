// Completeness check and confirmation (PS-05, REQ-PROC-012/-014): overall progress, the list of
// blockers with jump links, and the declaration modal for the completeness confirmation (PS-05).
// Live-scope cases (D-1): the confirmation closes Part 1 and also needs the required metadata questions.
import { AlertCircle, ArrowRight, CheckCircle2, ListChecks, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { Button, Card, Checkbox, Modal, ProgressBar } from "@/components/ui";
import { check } from "@/domain/permissions";
import { fmtDateTime, nowIso, userById, userName, type Blocker } from "@/domain/selectors";
import type { CiqCase } from "@/domain/types";
import { usePortalCaps } from "@/store/portalCaps";
import { useStore } from "@/store/store";
import { isLiveScope, overallProgress, sectionCode, sectionTitle, supplierBlockers, useSupplierScope } from "./lib";
import { OnlyOthers } from "./parts";

/** Jumps into the questionnaire: a section, a question in it, or a K2.1 component row. */
type Jump = (sectionId: string, fieldId?: string, rowId?: string) => void;

export function CompletenessHeader({ c, onJump }: { c: CiqCase; onJump: Jump }) {
  const { state, me } = useStore();
  const caps = usePortalCaps();
  const [showCheck, setShowCheck] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const p = overallProgress(c);
  const blockers = supplierBlockers(c);
  const colleagues = c.supplierContactIds.filter((id) => id !== me.id).map((id) => userName(state, id));
  // Live-scope requests: only a named contact who may confirm (spec §1.2); the live portal answers through its tasks.
  const denied = isLiveScope(c) ? check(state, me.id, "ciq.confirm", c) : null;
  const confirmers = c.supplierContactIds
    .filter((id) => id !== me.id)
    .map((id) => userById(state, id))
    .filter((u) => !!u && u.active !== false && u.mayConfirm !== false)
    .map((u) => u!.name);

  return (
    <div className="space-y-3">
      <Card className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center" data-testid="completeness-bar" data-blockers={blockers.length}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[22px] leading-none font-semibold tracking-tight text-ink">{p.pct} %</span>
            <span className="text-[13px] text-ink-2">
              complete · {p.done} of {p.total} required answers
            </span>
          </div>
          <ProgressBar className="mt-2.5" value={p.done} max={p.total} tone={blockers.length ? "brand" : "ok"} />
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
            Every answer is saved automatically.
            {colleagues.length > 0 && (
              <span className="inline-flex items-start gap-1">
                <Users size={12} className="mt-[3px] shrink-0" />
                <span>{colleagues.join(", ")} can work on other sections at the same time.</span>
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" icon={<ListChecks size={15} />} onClick={() => setShowCheck((v) => !v)} aria-expanded={showCheck} data-testid="check-completeness">
            {showCheck ? "Hide check" : "Check completeness"}
          </Button>
          {caps.canAct(c.id, "completeness") && !denied ? (
            <Button variant="primary" icon={<ShieldCheck size={15} />} onClick={() => setConfirming(true)} data-testid="confirm-completeness">
              Confirm completeness
            </Button>
          ) : (
            <OnlyOthers names={denied ? confirmers : caps.whoCanAct(c.id, "completeness")} what="confirm completeness" nobody={denied ? (userById(state, c.ownerId)?.name ?? "your contact") : undefined} />
          )}
        </div>
      </Card>
      {showCheck && <BlockerPanel blockers={blockers} templateVersion={c.templateVersion} onJump={onJump} />}
      <ConfirmCompletenessModal c={c} open={confirming} onClose={() => setConfirming(false)} onShowBlockers={() => setShowCheck(true)} />
    </div>
  );
}

function groupBySection(blockers: Blocker[]) {
  const m = new Map<string, Blocker[]>();
  for (const b of blockers) m.set(b.sectionId, [...(m.get(b.sectionId) ?? []), b]);
  return [...m.entries()];
}

function BlockerPanel({ blockers, templateVersion, onJump }: { blockers: Blocker[]; templateVersion: string; onJump: Jump }) {
  if (!blockers.length)
    return (
      <div className="flex items-start gap-3 rounded-card bg-ok-soft px-4 py-3" data-testid="blocker-panel" data-count={0}>
        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" />
        <div className="text-[13px]">
          <p className="font-semibold text-ink">Everything required is answered or justified</p>
          <p className="text-ink-2">You can confirm completeness now. Optional chapters and chapters answered with documents only do not block the confirmation.</p>
        </div>
      </div>
    );
  return (
    <Card data-testid="blocker-panel" data-count={blockers.length}>
      <div className="flex items-center gap-2 border-b border-line px-5 py-3">
        <AlertCircle size={16} className="text-bad" />
        <p className="text-[13.5px] font-semibold text-ink">
          {blockers.length} item{blockers.length === 1 ? "" : "s"} still need an answer or a justification
        </p>
      </div>
      <div className="grid gap-x-8 gap-y-4 px-5 py-4 md:grid-cols-2">
        {groupBySection(blockers).map(([sec, items]) => (
          <div key={sec}>
            <p className="text-[12.5px] font-semibold text-ink-2">
              <span className="font-mono text-ink-3">{sectionCode(sec, templateVersion)}</span> {sectionTitle(sec, templateVersion)}
            </p>
            <ul className="mt-1 space-y-0.5">
              {items.map((b, i) => (
                <li key={`${b.fieldId ?? b.rowId ?? "x"}-${i}`}>
                  <button onClick={() => onJump(b.sectionId, b.fieldId, b.rowId)} className="group inline-flex items-center gap-1 text-left text-[13px] text-brand hover:underline" data-testid="blocker-item" data-section={b.sectionId} data-field={b.fieldId} data-row={b.rowId}>
                    {b.label}
                    <ArrowRight size={13} className="opacity-60 group-hover:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ConfirmCompletenessModal({ c, open, onClose, onShowBlockers }: { c: CiqCase; open: boolean; onClose: () => void; onShowBlockers: () => void }) {
  const { me, confirmCompleteness } = useStore();
  const { supplier } = useSupplierScope();
  const [agree, setAgree] = useState(false);
  const blockers = supplierBlockers(c);
  const at = nowIso();
  const close = () => {
    setAgree(false);
    onClose();
  };
  const confirm = () => {
    if (blockers.length || !agree) return;
    confirmCompleteness(c.id);
    close();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="Confirm completeness"
      subtitle={`${c.materialName} · ${c.id}`}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!!blockers.length || !agree} onClick={confirm} data-testid="confirm-submit">
            Confirm and submit
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-[13.5px]">
        {blockers.length > 0 && (
          <div className="rounded-lg bg-bad-soft px-3.5 py-3">
            <p className="font-semibold text-ink">
              {blockers.length} item{blockers.length === 1 ? "" : "s"} still need an answer or a justification
            </p>
            <p className="mt-0.5 text-[13px] text-ink-2">Complete them first; the confirmation is possible as soon as nothing is missing.</p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2.5"
              onClick={() => {
                close();
                onShowBlockers();
              }}
            >
              Show what is missing
            </Button>
          </div>
        )}
        <blockquote className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-ink">
          “From our point of view the requested data and documents are complete. This is not a Beiersdorf approval of the raw material.”
        </blockquote>
        <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[13px]">
          <dt className="text-ink-3">Confirmed by</dt>
          <dd className="text-ink">
            {me.name}, {me.title}
          </dd>
          <dt className="text-ink-3">E-mail</dt>
          <dd className="text-ink">{me.email}</dd>
          <dt className="text-ink-3">On behalf of</dt>
          <dd className="text-ink">{supplier?.name}</dd>
          <dt className="text-ink-3">Time</dt>
          <dd className="text-ink">{fmtDateTime(at)}</dd>
        </dl>
        <p className="text-[12.5px] text-ink-3">
          After the confirmation you can still correct data and add documents until Beiersdorf requests your final release. Beiersdorf may also ask you questions about single items.
          {isLiveScope(c) && " A changed metadata answer then only adds sections."}
        </p>
        <div data-testid="confirm-agree">
          <Checkbox checked={agree} onChange={setAgree} disabled={!!blockers.length} label="I confirm the statement above on behalf of my company." />
        </div>
      </div>
    </Modal>
  );
}

