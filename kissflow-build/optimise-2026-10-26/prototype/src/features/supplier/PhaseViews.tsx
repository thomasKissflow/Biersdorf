// Phase-specific views of a request: scope check (waiting; live portal old flow only), review (questions for you),
// final release, the completed view (release record, question history, "Report a change") and the withdrawn state.
// Never shows department outcomes, RMES or internal content.
import { AlertCircle, ArrowRight, FilePen, FileQuestion, Hourglass, MessageSquareText, Send, ShieldCheck, Stamp } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, CardHeader, Checkbox, EmptyState, Field, KeyValue, Modal, Select, TextArea } from "@/components/ui";
import { check, raiserOf } from "@/domain/permissions";
import { deriveScope } from "@/domain/rules";
import { fmtDate, fmtDateTime, nowIso, userById, userName } from "@/domain/selectors";
import type { CiqCase, OpenPoint } from "@/domain/types";
import { usePortalCaps } from "@/store/portalCaps";
import { useStore } from "@/store/store";
import { caseLink, closedAt, isLiveScope, ownConfirmations, releasedAt, sectionCode, sectionKind, sectionTitle, submittedAt, supplierKindLabel, supplierReleaseBlockers, supplierSections, useSupplierScope } from "./lib";
import { Banner, DueText, OnlyOthers, QuestionBadges } from "./parts";

/** Live portal only (old flow): phase scope-check comes from the portal's mapping (map.ts derivePhase). The prototype
 *  store never produces it: the sections follow the supplier's metadata answers live (D-1). */
export function ScopeCheckView({ c }: { c: CiqCase }) {
  const { state } = useStore();
  const owner = userById(state, c.ownerId);
  // Before Beiersdorf releases the sections (live portal), show the scope the same rule engine expects from the
  // answers, as the prototype does; Beiersdorf's check decides the final scope.
  const released = supplierSections(c);
  const expected = !released.some((s) => s.sectionId !== "GEN");
  const sections = expected ? supplierSections({ ...c, scope: deriveScope(c.config, c.ruleSetVersion, c.templateVersion) }) : released;
  const submitted = c.phaseHistory.find((p) => p.phase === "scope-check")?.at;
  const tv = c.templateVersion;
  const groups = [
    { title: "Chapters", items: sections.filter((s) => sectionKind(s.sectionId, tv) !== "annex") },
    { title: "Annexes", items: sections.filter((s) => sectionKind(s.sectionId, tv) === "annex") },
  ];
  return (
    <div className="space-y-6">
      <Banner tone="info" icon={<Hourglass size={18} />} title="Beiersdorf is checking the scope of your questionnaire">
        You submitted the basic questions on {fmtDate(submitted)}. Your answers produced the questionnaire below. Beiersdorf checks it and may add a section if needed, then releases it to you.
      </Banner>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader title="Your questionnaire" subtitle={`${sections.filter((s) => s.applicability === "mandatory").length} mandatory and ${sections.filter((s) => s.applicability === "optional").length} optional sections, ${expected ? "expected from your answers. Beiersdorf confirms the final list." : "derived from your answers."}`} />
          <div className="grid gap-6 px-5 py-4 md:grid-cols-2">
            {groups.map((g) => (
              <div key={g.title}>
                <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{g.title}</p>
                <ul className="space-y-1">
                  {g.items.map((s) => (
                    <li key={s.sectionId} className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="min-w-0 truncate text-ink">
                        <span className="font-mono text-[11.5px] text-ink-3">{sectionCode(s.sectionId, tv)}</span> {sectionTitle(s.sectionId, tv)}
                      </span>
                      <span className="shrink-0 text-[11.5px] text-ink-3">{s.waived ? "Waived" : s.applicability === "mandatory" ? "Mandatory" : "Optional"}</span>
                    </li>
                  ))}
                  {g.items.length === 0 && <li className="text-[13px] text-ink-3">None</li>}
                </ul>
              </div>
            ))}
          </div>
        </Card>
        <Card className="self-start">
          <CardHeader title="What happens next" />
          <ol className="space-y-3 px-5 py-4 text-[13px]">
            {[
              "Beiersdorf checks the derived scope.",
              "You get a task and an e-mail when the questionnaire is released.",
              "You and your colleagues fill in the sections and upload the evidence.",
              "You confirm completeness. Beiersdorf then reviews your submission.",
            ].map((t, i) => (
              <li key={t} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-ink-2">{i + 1}</span>
                <span className="text-ink-2">{t}</span>
              </li>
            ))}
          </ol>
          {owner && <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-3">Need to change an answer? Contact {owner.name} ({owner.email}).</p>}
        </Card>
      </div>
    </div>
  );
}

/**
 * Questions Beiersdorf asked about this request. Live-scope requests also keep the questions the raiser closed
 * ("Closed, no answer needed", AS-08); `readOnly` is the question history of a released request (View only).
 */
export function QuestionsForYou({ c, onOpen, readOnly = false }: { c: CiqCase; onOpen: (opId: string) => void; readOnly?: boolean }) {
  const { state } = useStore();
  const live = isLiveScope(c);
  const open = c.openPoints.filter((p) => p.status === "open").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const waiting = c.openPoints.filter((p) => p.status === "in-progress");
  const closed = c.openPoints.filter((p) => p.status === "closed" && (live || p.outcome !== "withdrawn"));
  const all = [...open, ...waiting, ...closed];
  if (!all.length && !live) return null;
  const title = readOnly ? "Questions and answers" : "Questions for you";
  const subtitle = readOnly ? "Every question Beiersdorf asked on this request, with the full conversation. Read-only." : open.length ? `${open.length} waiting for your answer` : "Nothing to answer right now";
  return (
    <Card data-testid={readOnly ? "questions-history" : "questions-for-you"}>
      <CardHeader title={title} subtitle={all.length ? subtitle : undefined} />
      {all.length === 0 ? (
        <EmptyState icon={<MessageSquareText size={24} />} title={readOnly ? "No questions were asked on this request" : "No questions from Beiersdorf so far"}>
          {readOnly ? "Beiersdorf reviewed the questionnaire without asking you anything." : "If Beiersdorf has a question while reviewing, it appears here and you get a task and an e-mail."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {all.map((op) => (
            <QuestionRow key={op.id} op={op} asker={live ? userById(state, raiserOf(op))?.name : undefined} readOnly={readOnly} onOpen={() => onOpen(op.id)} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function QuestionRow({ op, asker, readOnly, onOpen }: { op: OpenPoint; asker?: string; readOnly: boolean; onOpen: () => void }) {
  const isOpen = op.status === "open" && !readOnly;
  return (
    <li className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center" data-testid={`question-${op.id}`} data-status={op.status} data-outcome={op.outcome}>
      <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand sm:flex">
        <FileQuestion size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-semibold text-ink">{supplierKindLabel(op.kind)}</span>
          <QuestionBadges op={op} />
        </div>
        <p className="text-[12.5px] text-ink-3">
          {op.ref.label}
          {asker && <> · Asked by {asker}, Beiersdorf</>}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">{op.question}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {isOpen && <DueText due={op.dueDate} compact />}
        <Button size="sm" variant={isOpen ? "primary" : "secondary"} onClick={onOpen} data-testid={isOpen ? `answer-${op.id}` : `view-${op.id}`}>
          {isOpen ? "Answer" : "View"}
        </Button>
      </div>
    </li>
  );
}

export function ReviewBanner({ c }: { c: CiqCase }) {
  const at = submittedAt(c);
  if (!isLiveScope(c))
    return (
      <Banner tone="info" icon={<Hourglass size={18} />} title={`Completeness confirmed on ${fmtDate(at)}`}>
        Beiersdorf is reviewing; you'll get a task if Beiersdorf has a question. You can still correct data and add documents until Beiersdorf requests your final release.
      </Banner>
    );
  return (
    <Banner tone="info" icon={<Hourglass size={18} />} title={`Beiersdorf is reviewing. You confirmed completeness on ${fmtDate(at)}.`}>
      You get a task and an e-mail if Beiersdorf has a question. You can still correct data and add documents until Beiersdorf requests your final release. A changed metadata answer can now only add sections.
    </Banner>
  );
}

/** Who else on the request may give the confirmations (for a contact who may not). */
function confirmerNames(state: ReturnType<typeof useStore>["state"], c: CiqCase, meId: string): string[] {
  return c.supplierContactIds
    .filter((id) => id !== meId)
    .map((id) => userById(state, id))
    .filter((u) => !!u && u.active !== false && u.mayConfirm !== false)
    .map((u) => u!.name);
}

export function FinalReleaseView({ c, onOpen }: { c: CiqCase; onOpen?: (opId: string) => void }) {
  const { state, me, finalRelease } = useStore();
  const caps = usePortalCaps();
  const nav = useNavigate();
  const { supplier } = useSupplierScope();
  const [open, setOpen] = useState(false);
  const [agree, setAgree] = useState(false);
  const live = isLiveScope(c);
  const sections = supplierSections(c);
  const completeness = [...c.confirmations].reverse().find((x) => x.type === "completeness");
  // Live-scope requests (spec §1.9): refused while a question is open or with Beiersdorf, or something mandatory is missing.
  const blockers = live ? supplierReleaseBlockers(c) : [];
  const denied = live ? check(state, me.id, "ciq.release", c) : null;
  const mayAct = caps.canAct(c.id, "final-release") && !denied;
  const close = () => {
    setOpen(false);
    setAgree(false);
  };
  return (
    <Card data-testid="final-release-card" data-blocked={blockers.length ? "true" : "false"}>
      <div className="flex flex-col gap-4 px-5 py-5 md:flex-row md:items-center">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Stamp size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold text-ink">All Beiersdorf reviews are complete. Please give the final release.</h2>
          <p className="mt-0.5 text-[13px] text-ink-2">With the final release you confirm that the information and evidence are correct and complete. The CIQ is then frozen and filed by Beiersdorf.</p>
        </div>
        {mayAct ? (
          <Button variant="primary" icon={<ShieldCheck size={15} />} disabled={blockers.length > 0} onClick={() => setOpen(true)} data-testid="final-release">
            Give final release
          </Button>
        ) : (
          <OnlyOthers names={denied ? confirmerNames(state, c, me.id) : caps.whoCanAct(c.id, "final-release")} what="give the final release" nobody={denied ? (userById(state, c.ownerId)?.name ?? "your contact") : undefined} />
        )}
      </div>
      {blockers.length > 0 && (
        <div className="border-t border-line bg-bad-soft/40 px-5 py-4" data-testid="final-release-blockers" data-count={blockers.length}>
          <p className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
            <AlertCircle size={16} className="text-bad" />
            The final release is possible once {blockers.length === 1 ? "this is" : "these are"} done
          </p>
          {/* Locked (Thomas, 15 Oct): the supplier cannot fix a missing item now; Beiersdorf reopens its review first. */}
          {live && (
            <p className="mt-1 text-[12.5px] text-ink-2" data-testid="release-blockers-locked">
              Your questionnaire is locked, so {blockers.length === 1 ? "this item" : "these items"} can only be completed after Beiersdorf reopens its review. Please contact {userById(state, c.ownerId)?.name ?? "your Beiersdorf contact"}.
            </p>
          )}
          <ul className="mt-2 space-y-1">
            {blockers.map((b, i) => (
              <li key={`${b.opId ?? b.fieldId ?? b.sectionId ?? "x"}-${i}`}>
                {b.opId && onOpen ? (
                  <button type="button" onClick={() => onOpen(b.opId!)} className="group inline-flex items-center gap-1 text-left text-[13px] text-brand hover:underline" data-testid="release-blocker-item">
                    {b.label}
                    <ArrowRight size={13} className="opacity-60 group-hover:opacity-100" />
                  </button>
                ) : b.sectionId ? (
                  <button type="button" onClick={() => nav(caseLink(c.id, { s: b.sectionId, f: b.fieldId }))} className="group inline-flex items-center gap-1 text-left text-[13px] text-brand hover:underline" data-testid="release-blocker-item">
                    {b.label}
                    <ArrowRight size={13} className="opacity-60 group-hover:opacity-100" />
                  </button>
                ) : (
                  <span className="text-[13px] text-ink-2" data-testid="release-blocker-item">
                    {b.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="border-t border-line px-5 py-4">
        <KeyValue
          cols={3}
          items={[
            { k: "Sections in your questionnaire", v: `${sections.filter((s) => s.applicability === "mandatory").length} mandatory · ${sections.filter((s) => s.applicability === "optional").length} optional` },
            { k: "Documents submitted", v: `${c.documents.length}` },
            { k: "Completeness confirmed", v: completeness ? `${completeness.name} · ${fmtDate(completeness.at)}` : "—" },
            isLiveScope(c)
              ? { k: "Questions closed", v: c.openPoints.length ? `${c.openPoints.filter((p) => p.status === "closed").length} of ${c.openPoints.length}` : "None asked" }
              : { k: "Questions answered", v: `${c.openPoints.filter((p) => p.status === "closed").length}` },
            { k: "Due", v: fmtDate(c.dueDate) },
          ]}
        />
      </div>
      <Modal
        open={open}
        onClose={close}
        title="Give the final release"
        subtitle={`${c.materialName} · ${c.id}`}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!agree || blockers.length > 0}
              data-testid="final-release-submit"
              onClick={() => {
                finalRelease(c.id);
                close();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              Give final release
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-[13.5px]">
          <blockquote className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-ink">“The information given in this CIQ and the evidence submitted are correct and complete. The CIQ will be frozen.”</blockquote>
          <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[13px]">
            <dt className="text-ink-3">Released by</dt>
            <dd className="text-ink">
              {me.name}, {me.title}
            </dd>
            <dt className="text-ink-3">E-mail</dt>
            <dd className="text-ink">{me.email}</dd>
            <dt className="text-ink-3">On behalf of</dt>
            <dd className="text-ink">{supplier?.name}</dd>
            <dt className="text-ink-3">Time</dt>
            <dd className="text-ink">{fmtDateTime(nowIso())}</dd>
          </dl>
          <p className="text-[12.5px] text-ink-3">After the release no answer or document can be changed.</p>
          <div data-testid="final-release-agree">
            <Checkbox checked={agree} onChange={setAgree} label="I confirm the statement above on behalf of my company." />
          </div>
        </div>
      </Modal>
    </Card>
  );
}

export function ClosedBanner({ c, onReportChange }: { c: CiqCase; onReportChange?: () => void }) {
  const { state } = useStore();
  // Live portal: the previous report has no receipt from Beiersdorf yet, so a second one waits (it would overwrite it).
  const reportPending = usePortalCaps().changeReportPending(c.id);
  if (c.phase === "completed") {
    const release = [...c.confirmations].reverse().find((x) => x.type === "final-release");
    if (!isLiveScope(c))
      return (
        <Banner tone="ok" title={`Released on ${fmtDate(releasedAt(c))}. Beiersdorf has filed the final document.`}>
          Thank you. The questionnaire is frozen with your final release. If something changes for this raw material, Beiersdorf will start a new request.
        </Banner>
      );
    return (
      <Banner
        tone="ok"
        title={`Released on ${fmtDate(releasedAt(c))}${release ? ` by ${release.name || userName(state, release.by)}` : ""}. Beiersdorf has filed the final document.`}
        action={
          onReportChange &&
          (reportPending ? (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3" role="status" data-testid="report-change-pending">
              <Hourglass size={14} /> Sending your report…
            </span>
          ) : (
            <Button variant="secondary" size="sm" icon={<FilePen size={14} />} onClick={onReportChange} data-testid="report-change">
              Report a change
            </Button>
          ))
        }
      >
        Thank you. The questionnaire is frozen with your final release. If something changes for this raw material later, use “Report a change”: Beiersdorf decides whether a new request is needed.
      </Banner>
    );
  }
  return (
    <Banner tone="neutral" icon={<Send size={18} />} title="Beiersdorf has withdrawn this request">
      Withdrawn on {fmtDate(closedAt(c))}. No further action is needed from you, and open tasks for this request have ended.
    </Banner>
  );
}

const CONFIRMATION_TEXT: Record<string, string> = {
  completeness: "Completeness confirmed",
  "final-release": "Final release given",
};

/** The supplier's own confirmations on a released request (REQ-PROC-015). Never the department completions. */
export function ReleaseRecord({ c }: { c: CiqCase }) {
  const own = ownConfirmations(c).sort((a, b) => a.at.localeCompare(b.at));
  return (
    <Card data-testid="release-record">
      <CardHeader title="Your confirmations" subtitle="Recorded with name, role, e-mail and time." />
      {own.length === 0 ? (
        <EmptyState title="No confirmations recorded" />
      ) : (
        <ul className="divide-y divide-line">
          {own.map((x, i) => (
            <li key={`${x.type}-${x.at}-${i}`} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4" data-testid={`confirmation-${x.type}`}>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-ink">{CONFIRMATION_TEXT[x.type] ?? x.type}</p>
                <p className="text-[12.5px] text-ink-2">
                  {x.name}
                  {x.role && <>, {x.role}</>}
                  {x.email && <span className="text-ink-3"> · {x.email}</span>}
                </p>
              </div>
              <span className="shrink-0 text-[12.5px] text-ink-3">{fmtDateTime(x.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Changes the supplier reported after the release (its own text only). */
export function ChangeReports({ c }: { c: CiqCase }) {
  const { state } = useStore();
  const reports = (state.changeReports ?? []).filter((r) => r.caseId === c.id).sort((a, b) => b.at.localeCompare(a.at));
  if (!reports.length) return null;
  return (
    <Card data-testid="change-reports">
      <CardHeader title="Changes you reported" subtitle="Beiersdorf has been told about each one. The released questionnaire stays unchanged." />
      <ul className="divide-y divide-line">
        {reports.map((r) => (
          <li key={r.id} className="px-5 py-3">
            <p className="text-[12.5px] text-ink-3">
              {userName(state, r.by)} · {fmtDateTime(r.at)}
              {r.id.startsWith("pending-") && " · sending to Beiersdorf…"}
            </p>
            <p className="mt-0.5 text-[13px] whitespace-pre-line text-ink-2">{r.text}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** "Report a change" after the release (spec §1.12): what changed and why, optionally the section. Mails RMM. */
export function ReportChangeModal({ c, open, onClose }: { c: CiqCase; open: boolean; onClose: () => void }) {
  const { reportChange } = useStore();
  const [what, setWhat] = useState("");
  const [why, setWhy] = useState("");
  const [section, setSection] = useState("");
  const sections = supplierSections(c).filter((s) => !s.waived);
  const valid = what.trim().length > 0 && why.trim().length > 0;
  const close = () => {
    setWhat("");
    setWhy("");
    setSection("");
    onClose();
  };
  const send = () => {
    if (!valid) return;
    const where = section ? `${sectionCode(section, c.templateVersion)} ${sectionTitle(section, c.templateVersion)}: ` : "";
    if (reportChange(c.id, `${where}${what.trim()}\nWhy: ${why.trim()}`)) close();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="Report a change"
      subtitle={`${c.materialName} · ${c.id}`}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Send size={15} />} disabled={!valid} onClick={send} data-testid="report-change-send">
            Send to Beiersdorf
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-ink-2">The released questionnaire stays as it is. Beiersdorf reads your report and decides whether a new request is needed; you then get a new invitation.</p>
        <Field label="What has changed?" required>
          <TextArea rows={4} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="For example: the antioxidant changes from tocopherol to rosemary extract from batch 2611 on." data-testid="report-change-what" />
        </Field>
        <Field label="Why, and from when?" required>
          <TextArea rows={3} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="For example: a new supplier of the antioxidant from November 2026." data-testid="report-change-why" />
        </Field>
        <Field label="Section concerned" hint="Optional.">
          <Select value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section concerned">
            <option value="">Not sure / several</option>
            {sections.map((s) => (
              <option key={s.sectionId} value={s.sectionId}>
                {sectionCode(s.sectionId, c.templateVersion)} · {sectionTitle(s.sectionId, c.templateVersion)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
