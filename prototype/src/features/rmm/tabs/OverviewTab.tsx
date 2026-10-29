// Overview tab of the case page: the case facts, the review tracks (with the Safety / Regulatory decisions), the
// confirmations and a scope summary. Once completed it links to the final document. The RMES is not shown here: it is
// the Safety and Regulatory reviewers' sheet in their review workspace (BDF's RMES scope, 28 Oct).
// Phones (< 768 px, Thomas 30 Oct): the columns stack (as below 1280 px), the case facts in two columns.
import { ArrowRight, FileCheck2, FilePlus2, Info, TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Avatar, Badge, BreakableEmail, Button, Card, CardHeader, KeyValue, Mono, cx } from "@/components/ui";
import { DecisionBadge, TrackBadge } from "@/components/status";
import { DEPT_LABEL } from "@/domain/catalog";
import { REQUIRED_CONFIG, departmentsForScope, fmtDate, fmtDateTime, isClosed, isConfigAnswered, manufacturerOf, siteOf, trackView, userById, userName } from "@/domain/selectors";
import type { CiqCase } from "@/domain/types";
import { useIsPhone } from "@/shell/useLayoutMode";
import { useStore } from "@/store/store";
import type { CaseTab } from "../CaseDetail";
import { PhoneFacts } from "../phone";
import { canManage, confirmationLabel, undefinedOriginLabels } from "../shared";

const n = (k: number, one: string) => `${k} ${k === 1 ? one : `${one}s`}`;

export function OverviewTab({ c, goTo }: { c: CiqCase; goTo: (t: CaseTab) => void }) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Facts c={c} />
        <Reviews c={c} goTo={goTo} />
        <Confirmations c={c} />
      </div>
      <div className="space-y-6">
        <ChangeReports c={c} />
        {c.phase === "completed" && c.finalDocument && <FinalDocumentCard c={c} goTo={goTo} />}
        <ScopeSummary c={c} goTo={goTo} />
        <Contacts c={c} />
      </div>
    </div>
  );
}

/** After the release (spec §1.12): what the supplier reported, and RMM's way to start the follow-up case from it. */
function ChangeReports({ c }: { c: CiqCase }) {
  const { state, persona } = useStore();
  const nav = useNavigate();
  const phone = useIsPhone();
  const reports = state.changeReports.filter((r) => r.caseId === c.id).sort((a, b) => b.at.localeCompare(a.at));
  if (c.phase !== "completed" || !reports.length) return null;
  return (
    <Card data-testid="case-change-reports">
      <CardHeader title="Change reported after the release" subtitle="The released CIQ stays unchanged. A new case asks the supplier for a new questionnaire." />
      <ul className="divide-y divide-line">
        {reports.map((r) => (
          <li key={r.id} className="px-4 py-3" data-testid={`change-report-${r.id}`}>
            <p className="text-[13px] whitespace-pre-line text-ink">{r.text}</p>
            <p className="mt-1 text-[11.5px] text-ink-3">
              <Mono>{r.id}</Mono> · {userName(state, r.by)} · {fmtDateTime(r.at)}
            </p>
          </li>
        ))}
      </ul>
      {canManage(persona) && (
        <div className="border-t border-line px-4 py-3">
          <Button size="sm" variant="primary" icon={<FilePlus2 size={14} />} onClick={() => nav(`/cases/new?from=${c.id}`)} data-testid="change-report-new-case" className={phone ? "h-11" : undefined}>
            Start a new case
          </Button>
          <p className="mt-1.5 text-[11.5px] text-ink-3">Pre-filled with the supplier, its contacts, the trade name, INCI, material no. and target markets.</p>
        </div>
      )}
    </Card>
  );
}

function Facts({ c }: { c: CiqCase }) {
  const { state } = useStore();
  const phone = useIsPhone();
  const sup = state.suppliers.find((s) => s.id === c.supplierId);
  const items = [
    { k: "Trade name", v: c.materialName },
    { k: "Main INCI", v: c.inci },
    { k: "BDF material no.", v: <Mono>{c.materialNo}</Mono> },
    { k: "Supplier", v: sup ? <>{sup.name}<span className="block text-[11.5px] text-ink-3">DUNS <Mono>{sup.duns}</Mono> · {sup.country} · {sup.type === "manufacturer" ? "Manufacturer" : "Distributor"}</span></> : "—" },
    { k: "Manufacturer", v: <span className="whitespace-pre-line">{manufacturerOf(c) || "—"}</span> },
    { k: "Production site", v: siteOf(c) ? <span className="whitespace-pre-line">{siteOf(c)}</span> : <span className="text-ink-3">Entered by the supplier</span> },
    { k: "Case owner (RMM)", v: userName(state, c.ownerId) },
    { k: "Priority", v: c.priority === "high" ? <Badge tone="warn">High</Badge> : "Normal" },
    { k: "Created", v: fmtDate(c.createdAt) },
    { k: "Due", v: fmtDate(c.dueDate) },
    { k: "Questionnaire", v: <span data-testid="case-template-version"><Mono>{c.templateVersion}</Mono></span> },
    { k: "Rule set", v: <span data-testid="case-rule-set"><Mono>{c.ruleSetVersion}</Mono></span> },
  ];
  // on a phone the supplier, manufacturer and site take the whole row
  const wide = ["Supplier", "Manufacturer", "Production site"];
  return (
    <Card data-testid="case-facts">
      <CardHeader title="Case facts" />
      <div className="p-4">{phone ? <PhoneFacts items={items.map((i) => ({ ...i, wide: wide.includes(i.k) }))} /> : <KeyValue cols={3} items={items} />}</div>
    </Card>
  );
}

function Contacts({ c }: { c: CiqCase }) {
  const { state } = useStore();
  const phone = useIsPhone();
  return (
    <Card data-testid="case-contacts">
      <CardHeader
        title="Supplier contacts"
        subtitle="Only they see this request and get its e-mails"
      />
      <ul className="divide-y divide-line">
        {c.supplierContactIds.map((id) => {
          const u = userById(state, id);
          return (
            <li key={id} className="flex items-center gap-2.5 px-4 py-2.5">
              <Avatar initials={u?.initials ?? "?"} side="supplier" size={26} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink">
                  {u?.name ?? id}
                  {u?.active === false && (
                    <Badge tone="neutral" className="ml-1.5">
                      Inactive
                    </Badge>
                  )}
                </p>
                {phone ? (
                  // a phone: the title, then the e-mail on a line of its own (whole, breaking at @ or a dot), then the flag
                  <>
                    {u?.title && <p className="truncate text-[11.5px] text-ink-3">{u.title}</p>}
                    {u?.email && (
                      <p className="text-[12.5px] text-ink-2">
                        <BreakableEmail email={u.email} />
                      </p>
                    )}
                    {u?.mayConfirm === false && (
                      <Badge tone="neutral" className="mt-1">
                        May not confirm
                      </Badge>
                    )}
                  </>
                ) : (
                  <p className="truncate text-[11.5px] text-ink-3">
                    {u?.title}
                    {u?.email ? ` · ${u.email}` : ""}
                  </p>
                )}
              </div>
              {!phone && u?.mayConfirm === false && <span className="shrink-0 text-[11.5px] text-ink-3">May not confirm</span>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ScopeSummary({ c, goTo }: { c: CiqCase; goTo: (t: CaseTab) => void }) {
  const n = (a: string) => c.scope.filter((s) => s.applicability === a).length;
  const answered = REQUIRED_CONFIG.filter((k) => isConfigAnswered(c, k)).length;
  const later = c.scope.filter((s) => s.addedLater).length;
  const origins = undefinedOriginLabels(c);
  const part1 = c.phase === "supplier-input";
  const phone = useIsPhone();
  return (
    <Card data-testid="case-scope-summary">
      <CardHeader title="Scope" subtitle={part1 ? "Follows the supplier's metadata answers until completeness" : "Fixed at completeness; it can only grow"} />
      <div className="space-y-3 p-4 text-[13px]">
        {c.scope.length ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Mandatory", n("mandatory")],
              ["Optional", n("optional")],
              ["Not applicable", n("na")],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-surface-2 px-2 py-2">
                <div className="text-[18px] font-semibold text-ink">{v}</div>
                <div className="text-[11.5px] text-ink-3">{k}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-ink-3">No section is open yet.</p>
        )}
        <p className="text-ink-2">
          Required metadata questions answered: <span className="font-medium text-ink">{answered} of {REQUIRED_CONFIG.length}</span>
          {later ? ` · ${later} section${later === 1 ? "" : "s"} added after completeness` : ""}
        </p>
        {origins.length > 0 && (
          <p className="flex items-start gap-1.5 text-ink-2">
            <TriangleAlert size={14} className="mt-px shrink-0 text-warn" aria-hidden />
            Origin without rules: {origins.join(", ")}. Flagged for RMM's review.
          </p>
        )}
        <button type="button" onClick={() => goTo("questionnaire")} data-testid={phone ? "scope-sections-link" : undefined} className={cx("inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline", phone && "min-h-11")}>
          Sections and answers <ArrowRight size={13} />
        </button>
      </div>
    </Card>
  );
}

function FinalDocumentCard({ c, goTo }: { c: CiqCase; goTo: (t: CaseTab) => void }) {
  const d = c.finalDocument!;
  const phone = useIsPhone();
  return (
    <Card data-testid="case-final-document-card">
      <CardHeader title="Final document" subtitle={`Created automatically ${fmtDateTime(d.generatedAt)}`} />
      <div className="space-y-3 p-4 text-[13px] text-ink-2">
        <p>
          {n(d.sections.length, "section")}, {n(d.evidence.length, "document")}, {n(d.threads.length, "open-point thread")} and {n(d.confirmations.length, "confirmation")}. Sealed at the final release.
        </p>
        <Button size="sm" variant="secondary" icon={<FileCheck2 size={14} />} onClick={() => goTo("final-document")} className={phone ? "h-11" : undefined}>
          Open final document
        </Button>
      </div>
    </Card>
  );
}

function Reviews({ c, goTo }: { c: CiqCase; goTo: (t: CaseTab) => void }) {
  const { state } = useStore();
  // live too, the reviews start at the completeness confirmation (I-2 with E-A) and the release request goes on the last
  // completion (E-B), 22 Oct
  if (!c.reviews.length) {
    const closed = isClosed(c);
    const expected = c.scope.length && !closed ? departmentsForScope(c.scope, state.ownership) : [];
    const showExpected = !closed && c.scope.length > 0;
    return (
      <Card data-testid="case-reviews">
        <CardHeader title="Reviews" />
        <div className="flex items-start gap-3 px-4 py-5 text-[13.5px] text-ink-2">
          <Info size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
          <div>
            <p>{closed ? `No review was started: the case was ${c.phase === "cancelled" ? "cancelled" : "closed"} before the supplier's completeness confirmation.` : "The reviews start when the supplier confirms completeness."}</p>
            {showExpected && (
              <p className="mt-1 text-ink-3">
                Based on the current scope: RMM (whole CIQ){expected.map((d) => `, ${DEPT_LABEL[d]}`).join("")}. Customs and Legal will be informed.
              </p>
            )}
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card data-testid="case-reviews">
      <CardHeader
        title="Reviews"
        subtitle={`RMM and each department concerned complete their own review; the supplier is asked for the final release once all have completed. Only Safety and Regulatory record an internal decision.`}
      />
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {c.reviews.map((r) => {
          const pts = c.openPoints.filter((p) => p.dept === r.dept);
          const open = pts.filter((p) => p.status !== "closed").length;
          const decides = r.dept === "SAF" || r.dept === "REG";
          return (
            <div key={r.dept} className="rounded-lg border border-line p-3" data-testid={`case-track-${r.dept}`} data-status={trackView(c, r)}>
              <p className="text-[13.5px] font-semibold text-ink">{DEPT_LABEL[r.dept]}</p>
              <div className="mt-1.5">
                <TrackBadge status={trackView(c, r)} />
              </div>
              <dl className="mt-3 space-y-1.5 text-[12.5px]">
                <Row k="Assignee" v={userName(state, r.assigneeId)} />
                {r.dept === "RMM" ? <Row k="Covers" v="The whole CIQ" /> : <Row k="Decision" v={decides ? <DecisionBadge decision={r.decision} /> : <span className="text-ink-3">No decision step</span>} />}
                {r.decision === "rejected" && r.decisionReason && <p className="rounded-md bg-bad-soft px-2 py-1 text-[12px] text-ink-2">{r.decisionReason}</p>}
                {r.continueAfterRejection && <p className="rounded-md bg-surface-2 px-2 py-1 text-[12px] text-ink-2">Continued after the rejection: {r.continueAfterRejection.note}</p>}
                <Row
                  k="Open points"
                  v={
                    pts.length ? (
                      <button onClick={() => goTo("points")} className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
                        {open ? `${open} of ${pts.length} still open` : `All ${pts.length} closed`} <ArrowRight size={12} />
                      </button>
                    ) : (
                      <span className="text-ink-3">None</span>
                    )
                  }
                />
                <Row k={r.completedAt ? "Completed" : trackView(c, r) === "ended" ? "Ended" : "Started"} v={fmtDate(r.completedAt ?? (trackView(c, r) === "ended" ? c.cancelled?.at : r.startedAt))} />
              </dl>
            </div>
          );
        })}
        {c.informed.map((d) => (
          <div key={d} className="rounded-lg border border-dashed border-line-strong p-3">
            <p className="text-[13.5px] font-semibold text-ink">{DEPT_LABEL[d]}</p>
            <div className="mt-1.5">
              <Badge tone="neutral">Informed · read-only</Badge>
            </div>
            <p className="mt-3 text-[12.5px] text-ink-3">Owns {d === "CUS" ? "K7 (customs and foreign trade)" : "K8 and K8.1 (patents and licences)"}. Reads the case and may post internal notes.</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2">
    <dt className="text-ink-3">{k}</dt>
    <dd className="text-right text-ink">{v}</dd>
  </div>
);

function Confirmations({ c }: { c: CiqCase }) {
  const list = [...c.confirmations].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Card data-testid="case-confirmations">
      <CardHeader title="Confirmations" subtitle="Recorded with name, e-mail, role and time. None of them is a raw-material approval." />
      {list.length === 0 ? (
        <p className="px-4 py-5 text-[13.5px] text-ink-3">Nothing confirmed yet. The first entry is the supplier's completeness confirmation.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((x, i) => {
            const supplierSide = x.type === "completeness" || x.type === "final-release";
            return (
              <li key={`${x.type}-${x.at}-${i}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium text-ink">{confirmationLabel(x.type, x.dept)}</span>
                    <Badge tone={supplierSide ? "violet" : "neutral"}>{supplierSide ? "Supplier" : "Beiersdorf"}</Badge>
                  </div>
                  <p className="mt-1 text-[12.5px] text-ink-2">
                    {x.name} · {x.role} · <span className="text-ink-3">{x.email}</span>
                  </p>
                  {x.note && <p className="mt-0.5 text-[12.5px] text-ink-3">{x.note}</p>}
                </div>
                <div className="shrink-0 text-left text-[12px] text-ink-3 sm:text-right">{fmtDateTime(x.at)}</div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
