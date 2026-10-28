// History tab of the case page (formerly the audit trail tab and the auditor's "Reconstruct a case"): who assessed
// what, when, against which rule set and source, the phase history and the append-only event timeline. E-mails live in
// each person's inbox, not here.
import { Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Card, CardHeader, Mono, Segmented, TextInput, Timeline, cx } from "@/components/ui";
import { DEPT_SHORT, sectionOf } from "@/domain/catalog";
import { ruleSet } from "@/domain/rules";
import { PHASE_LABEL, fmtDateTime, userById, userName } from "@/domain/selectors";
import type { AppState, CiqCase } from "@/domain/types";
import { useStore } from "@/store/store";
import { ResponsiveCardHeader, auditTone } from "../shared";

type Who = "all" | "bdf" | "supplier" | "system";

const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);


export function HistoryTab({ c }: { c: CiqCase }) {
  const { state } = useStore();
  // The e-mails are in each person's inbox; the history keeps the case events only (Thomas, 14 Oct).
  return (
    <div className="space-y-5">
      <Summary state={state} c={c} />
      <Events c={c} />
    </div>
  );
}

/** The auditor's questions answered in plain sentences, each computed from the case record. */
function answers(state: AppState, c: CiqCase): { k: string; v: ReactNode }[] {
  const rs = ruleSet(c.ruleSetVersion);
  const fired = new Set(c.scope.flatMap((s) => s.firedRules));
  const count = (a: string) => c.scope.filter((s) => s.applicability === a).length;
  const comp = c.confirmations.filter((x) => x.type === "completeness").at(-1);
  const fin = c.confirmations.find((x) => x.type === "final-release");
  const assessed = c.rmes?.criteria.filter((x) => x.result) ?? [];
  const assessors = [...new Set(assessed.map((x) => x.by).filter(Boolean) as string[])].map((id) => userName(state, id));
  const completions = c.confirmations.filter((x) => x.type === "dept-completion");
  const end = [...c.phaseHistory].reverse().find((p) => p.phase === "completed" || p.phase === "cancelled");
  const ops = c.openPoints;
  const B = ({ children }: { children: ReactNode }) => <span className="font-medium text-ink">{children}</span>;
  return [
    {
      k: "Configuration",
      v: (
        <>
          Questionnaire <B>{c.templateVersion}</B> with rule set <B>{rs.version}</B>. {fired.size} rules fired: {count("mandatory")} sections mandatory, {count("optional")} optional, {count("na")} not applicable.
          {c.scope.some((s) => s.manual) && <> {c.scope.filter((s) => s.manual).length} added by a department with a justification.</>}
        </>
      ),
    },
    {
      k: "Completeness",
      v: comp ? (
        <>
          <B>{comp.name}</B> ({comp.email}, {comp.role}) confirmed completeness on {fmtDateTime(comp.at)}.
        </>
      ) : (
        "Not confirmed yet: the supplier is filling in the CIQ."
      ),
    },
    {
      k: "Reviews",
      v: c.reviews.length ? (
        <>
          {c.reviews.length} review task{c.reviews.length === 1 ? "" : "s"} ({listJoin(c.reviews.map((r) => DEPT_SHORT[r.dept]))}); {completions.length ? <>completed by {listJoin(completions.map((x) => `${x.name} (${x.dept ? DEPT_SHORT[x.dept] : "review"}, ${fmtDateTime(x.at)})`))}</> : "none completed yet"}.
          {c.reviews.some((r) => r.decision) && <> Internal decisions: {listJoin(c.reviews.filter((r) => r.decision).map((r) => `${DEPT_SHORT[r.dept]} ${r.decision === "approved" ? "Approved" : "Rejected"}`))}.</>}
        </>
      ) : (
        "No review started yet."
      ),
    },
    {
      k: "RMES",
      v: c.rmes ? (
        <>
          {assessed.length} of {c.rmes.criteria.length} criteria assessed{assessors.length ? <> by {listJoin(assessors)}</> : null}; {c.rmes.findings.length} finding{c.rmes.findings.length === 1 ? "" : "s"}. Internal, never shown to the supplier.
        </>
      ) : (
        "No RMES record: it is created when Safety or Regulatory review the case."
      ),
    },
    {
      k: "Open points",
      v: ops.length ? `${ops.length} raised, ${ops.filter((p) => p.status === "closed").length} closed, ${ops.reduce((n, p) => n + p.rounds, 0)} rounds with the supplier.` : "None raised.",
    },
    {
      k: "Closure",
      v: fin ? (
        <>
          Final release by <B>{fin.name}</B> ({fin.email}) on {fmtDateTime(fin.at)}
          {c.finalDocument ? (
            <>
              ; final document generated automatically and sealed (seal <Mono className="text-ink">{c.finalDocument.fingerprint}</Mono>)
            </>
          ) : null}
          .
        </>
      ) : end ? (
        `${PHASE_LABEL[end.phase]} ${fmtDateTime(end.at)}${c.cancelled ? `: ${c.cancelled.reason}` : ""}.`
      ) : (
        `Still open: “${PHASE_LABEL[c.phase]}”.`
      ),
    },
  ];
}

function Summary({ state, c }: { state: AppState; c: CiqCase }) {
  return (
    <Card data-testid="history-summary">
      <CardHeader title="Who assessed what" subtitle="When, against which rule set, data and documents. Computed from the case record." />
      <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <dl className="divide-y divide-line">
          {answers(state, c).map((a) => (
            <div key={a.k} className="grid gap-1 py-2.5 first:pt-0 sm:grid-cols-[130px_minmax(0,1fr)] sm:gap-4">
              <dt className="text-[13px] text-ink-3">{a.k}</dt>
              <dd className="text-[13.5px] text-ink-2">{a.v}</dd>
            </div>
          ))}
        </dl>
        <div>
          <h4 className="text-[13px] font-semibold text-ink">Phases</h4>
          <ol className="mt-2 space-y-2">
            {c.phaseHistory.map((p, i) => (
              <li key={`${p.phase}-${i}`} className="flex items-baseline gap-2.5 text-[13px]">
                <span className={cx("h-2 w-2 shrink-0 translate-y-[-1px] rounded-full", i === c.phaseHistory.length - 1 ? "bg-brand" : "bg-line-strong")} />
                <span className="flex-1 text-ink-2">{PHASE_LABEL[p.phase]}</span>
                <span className="text-xs whitespace-nowrap text-ink-3">{fmtDateTime(p.at)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Card>
  );
}

function Events({ c }: { c: CiqCase }) {
  const { state } = useStore();
  const [who, setWho] = useState<Who>("all");
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const side = (by: string) => (by === "system" ? "system" : userById(state, by)?.side === "supplier" ? "supplier" : "bdf");
  const events = [...c.audit]
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id, undefined, { numeric: true }))
    .filter((e) => who === "all" || side(e.by) === who)
    .filter((e) => !needle || `${e.action} ${e.detail} ${userName(state, e.by)}`.toLowerCase().includes(needle));

  return (
    <Card data-testid="history-events" data-count={events.length}>
      <ResponsiveCardHeader
        title="Events"
        subtitle={`${c.audit.length} entries · newest first · append-only. Every change is recorded with name and time.`}
        action={
          <Segmented<Who>
            value={who}
            onChange={setWho}
            options={[
              { value: "all", label: "All" },
              { value: "bdf", label: "Beiersdorf" },
              { value: "supplier", label: "Supplier" },
              { value: "system", label: "System" },
            ]}
          />
        }
      />
      <div className="border-b border-line px-4 py-2.5">
        <div className="relative max-w-sm">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
          <TextInput aria-label="Search the history" placeholder="Search action, detail or person…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" data-testid="history-search" />
        </div>
      </div>
      <div className="px-4 py-4">
        {events.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-ink-3">{c.audit.length ? "No entries match." : "No entries yet."}</p>
        ) : (
          <Timeline
            items={events.map((e) => ({
              id: e.id,
              at: fmtDateTime(e.at),
              title: e.action,
              who: (
                <>
                  {userName(state, e.by)}
                  {side(e.by) === "supplier" ? " (supplier)" : ""}
                </>
              ),
              tone: auditTone(e.action, e.by, e.detail),
              body: (
                <>
                  <span className="block">{e.detail}</span>
                  {e.sectionId && (
                    <span className="mt-0.5 block text-[11.5px] text-ink-3">
                      Section <Mono className="text-[11px]">{sectionOf(e.sectionId, c.templateVersion)?.code ?? e.sectionId}</Mono>
                    </span>
                  )}
                </>
              ),
            }))}
          />
        )}
      </div>
    </Card>
  );
}

