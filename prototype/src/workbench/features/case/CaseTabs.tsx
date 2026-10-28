// The case detail tabs (§8.4): Overview facts, Departments & lanes, Sections, Open points (T2's PointList +
// RaisePointDialog), Change requests, Notes (T3) and Audit (T3). Read-only except the actions they host.
import { FilePlus2, MessageSquarePlus, Wrench } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Card, CardHeader, Mono, cx } from "@/components/ui/primitives";
import { EmptyState, KeyValue } from "@/components/ui/data";
import { DEPTS, stepDef, type Dept, type StepIr } from "../../schema";
import { effectiveDecision } from "../../data/counts";
import { repairBlocker } from "../../data/adminRepair";
import { displayValue } from "../../data/normalize";
import { useTasks, useWorkbench, useWorkbenchContext, type CaseBundle } from "../../data/hooks";
import type { CaseVM, CrVM } from "../../data/viewModels";
import { DEPT_LABEL, deptName, personLabel, ruleSetLabel } from "../../domain/labels";
import { CodeList } from "../../ui/codes";
import { ReadQualityBanner } from "../../ui/ReadQualityBanner";
import { StatusBadge } from "../../ui/badges";
import { AuditTimeline } from "../audit/AuditTimeline";
import { NotesPanel } from "../notes/NotesPanel";
import { PointList } from "../points/PointList";
import { RaisePointDialog } from "../points/RaisePointDialog";
import { impactChips } from "../cr/crLogic";
import { LaneRepairDialog } from "./panels/LaneDialogs";
import { parseRecordedScope } from "./scope";
import { fmtDate, fmtDateTime } from "./shared";
import { newestLaneSnapshot } from "./stepLogic";

export const CASE_TABS = [
  { value: "overview", label: "Overview" },
  { value: "lanes", label: "Department reviews" },
  { value: "sections", label: "Sections" },
  { value: "points", label: "Open points" },
  { value: "change-requests", label: "Change requests" },
  { value: "notes", label: "Notes" },
  { value: "audit", label: "Audit" },
] as const;
export type CaseTab = (typeof CASE_TABS)[number]["value"];

/** Tabs with a test id per tab (the copied overlay Tabs carries none). */
export function CaseTabBar({ value, onChange, counts }: { value: CaseTab; onChange(v: CaseTab): void; counts: Partial<Record<CaseTab, number>> }) {
  return (
    // Tablet check: tighter tabs below lg, so all seven (Audit included) fit at 768 px instead of scrolling out of view
    <div role="tablist" className="flex gap-0 overflow-x-auto shadow-[inset_0_-1px_0_var(--line)] scrollbar-thin lg:gap-1">
      {CASE_TABS.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={t.value === value}
          data-testid={`wb-case-tab-${t.value}`}
          onClick={() => onChange(t.value)}
          className={cx("inline-flex shrink-0 items-center gap-1 border-b-2 px-2 py-2 text-[13.5px] whitespace-nowrap transition-colors lg:gap-1.5 lg:px-3", t.value === value ? "border-brand font-semibold text-ink" : "border-transparent text-ink-3 hover:text-ink")}
        >
          {t.label}
          {counts[t.value] !== undefined && <span className={cx("rounded-full px-1.5 text-[11px]", t.value === value ? "bg-brand-soft text-brand" : "bg-surface-3 text-ink-3")}>{counts[t.value]}</span>}
        </button>
      ))}
    </div>
  );
}

const v = (c: CaseVM, k: string): ReactNode => displayValue(c.v[k]) || <span className="text-ink-3">—</span>;

// ---------------------------------------------------------------- Overview facts

export function FactsCards({ c }: { c: CaseVM }) {
  let contacts: { name?: string; email?: string; role?: string; canConfirm?: boolean; portalUserId?: string | null }[] = [];
  try {
    const j = JSON.parse(c.caseContactsJson || "[]");
    if (Array.isArray(j)) contacts = j;
  } catch {
    contacts = [];
  }
  const conf = (title: string, x: CaseVM["completeness"], due: string) => (
    <Card>
      <CardHeader title={title} subtitle={x.at ? "Recorded (read-only)" : "Not recorded yet"} />
      <div className="p-4">
        <KeyValue
          items={[
            { k: "Request key", v: x.requestKey || "—" },
            { k: "Due date", v: fmtDate(due) || "—" },
            { k: "Confirmed", v: x.confirm || "—" },
            { k: "At", v: fmtDateTime(x.at) || "—" },
            { k: "By", v: [x.byName, x.byEmail, x.byRole].filter(Boolean).join(" · ") || "—" },
          ]}
        />
      </div>
    </Card>
  );
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title="Case facts" />
        <div className="p-4">
          <KeyValue
            items={[
              { k: "Case title", v: v(c, "Case_Title") },
              { k: "Trade name", v: v(c, "Trade_Name") },
              { k: "Main INCI", v: v(c, "Main_INCI") },
              { k: "BDF / SAP material no", v: [c.bdfMaterialNo, c.sapMaterialNo].filter(Boolean).join(" / ") || "—" },
              { k: "IRMA ref", v: v(c, "IRMA_Ref") },
              { k: "Target markets", v: [c.targetMarketsText, c.marketsLabel].filter(Boolean).join(" · ") || "—" },
              { k: "Origin types", v: v(c, "Origin_Types") },
              { k: "Supplier due date", v: fmtDate(c.supplierDueDate) || "—" },
              { k: "BDF contact", v: [c.bdfContactName, c.bdfContactEmail].filter(Boolean).join(" · ") || "—" },
              { k: "Overall approval required", v: c.overallApprovalRequired ? "Yes" : "No" },
              { k: "Rule set version", v: ruleSetLabel(c.ruleSetVersion) },
              { k: "Test case", v: c.isTest ? "Yes" : "No" },
            ]}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title="Supplier contacts" subtitle="As recorded on the case. Portal user ids are given by portal user management." />
        <div className="space-y-3 p-4 text-[13px]">
          {contacts.length ? (
            <ul className="divide-y divide-line">
              {contacts.map((x, i) => (
                <li key={i} className="flex flex-wrap gap-x-3 py-1.5">
                  <span className="font-medium text-ink">{x.name || x.email}</span>
                  <span className="text-ink-2">{x.email}</span>
                  {x.role && <span className="text-ink-3">{x.role}</span>}
                  {x.canConfirm && <Badge tone="info">can confirm</Badge>}
                  {x.portalUserId ? <Mono>{x.portalUserId}</Mono> : <Badge tone="warn">not invited to the portal yet</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-3">No contacts recorded on the case.</p>
          )}
          <KeyValue cols={1} items={[{ k: "Confirm contact ids", v: c.confirmContactIds || "—" }, { k: "Supplier contact e-mails", v: c.supplierContactEmails || "—" }]} />
        </div>
      </Card>
      {conf("Completeness confirmation", c.completeness, c.completeness.dueDate)}
      {conf("Final release", c.finalRelease, c.finalRelease.dueDate)}
      <Card className="xl:col-span-2">
        <CardHeader title="Open items and holds" subtitle="Counts are written only by Refresh counts, at the open-items checks before release and before close, and at final release. Whether the case may go on is decided by Kissflow." />
        <div className="p-4">
          <KeyValue
            cols={3}
            items={[
              { k: "Open points", v: c.openItemsCount ?? "not counted yet" },
              { k: "Open change requests", v: c.openCrCount ?? "not counted yet" },
              { k: "Held for open items", v: c.holdForOpenItems || "not decided yet" },
              { k: "Ready before release request", v: c.openItemsGateRelease === "OK" ? "Yes" : "No" },
              { k: "Ready before close", v: c.openItemsGateClose === "OK" ? "Yes" : "No" },
              { k: "Hold note", v: c.holdNote || "—" },
              { k: "Late completions", v: <span className="whitespace-pre-wrap">{c.lateCompletionsText || "—"}</span> },
              { k: "Completion trigger", v: c.completionTrigger || "—" },
              { k: "Overall decision", v: [c.overallDecision, c.overallReason].filter(Boolean).join(": ") || "—" },
            ]}
          />
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Departments & lanes

export function LanesTab({ b }: { b: CaseBundle }) {
  const c = b.case;
  const nav = useNavigate();
  const tasks = useTasks();
  const { rt } = useWorkbenchContext();
  const [repair, setRepair] = useState<Dept | null>(null);
  return (
    <Card>
      <CardHeader title="Department reviews" subtitle="Each department's sign-off as read. A Case Admin can restore a lost sign-off from its recorded completion." />
      <div className="relative overflow-x-auto scrollbar-thin">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-ink-3">
              {["Department", "In review", "Confirmed", "Completed by / at", "On behalf of", "Open items", "RMES gaps / decision", "Ready to complete", "Task / record"].map((h) => (
                <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEPTS.map((d) => {
              const l = c.lanes[d];
              const snap = newestLaneSnapshot(b.events, c, d);
              const laneTask = (tasks.data ?? []).find((t) => t.flow === "CIQ_Case_A00" && t.instanceId === c._id && t.step === `CASE_B_${d}`);
              const eff = d === "SAF" || d === "REG" ? effectiveDecision(c, d, b.points) : null;
              const canRepair = !!snap && repairBlocker(rt, c, d, snap) === null;
              return (
                <tr key={d} className={cx("border-b border-line align-top last:border-0", !l.active && "text-ink-3")} data-testid={`wb-case-lane-${d}`} data-active={l.active ? "1" : "0"} data-complete={l.complete ? "1" : "0"}>
                  <td className="px-3 py-2 font-medium">{DEPT_LABEL[d]}</td>
                  <td className="px-3 py-2">{l.active ? <Badge tone="brand">yes</Badge> : "no"}</td>
                  <td className="px-3 py-2">{l.confirm ? <Badge tone={l.complete ? "ok" : "warn"}>{l.confirm}</Badge> : "—"}</td>
                  <td className="px-3 py-2">{[l.completedBy?.name ?? l.completedByEmail, fmtDateTime(l.completedAt)].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-3 py-2">{l.onBehalfOf || "—"}</td>
                  <td className="px-3 py-2">{l.openCount ?? "not counted yet"}</td>
                  <td className="px-3 py-2">
                    {d === "SAF" || d === "REG" ? (
                      <div className="space-y-0.5">
                        <div>gaps {l.rmesGaps ?? "not counted yet"}</div>
                        <div>RMES decision {l.rmesDecision || "—"}</div>
                        {eff && (
                          <div className="text-ink-2" data-testid={`wb-case-effective-${d}`}>
                            effective {eff.decision ?? "—"} ({eff.source === "late" ? "later department review" : "RMES decision"})
                          </div>
                        )}
                        {l.rmesDecisionReason && <div className="text-ink-3">{l.rmesDecisionReason}</div>}
                      </div>
                    ) : (
                      <span className="text-ink-3">n/a</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{l.gate === "OK" ? <Badge tone="ok">Yes</Badge> : l.active ? <span className="text-ink-2">No</span> : "—"}</td>
                  <td className="space-y-1 px-3 py-2">
                    {laneTask && (
                      <Button size="sm" onClick={() => nav(`/review/lane/${c._id}/${encodeURIComponent(laneTask.activityInstanceId)}`)}>
                        Open review task
                      </Button>
                    )}
                    {snap ? <div className="text-[12px] text-ink-3">completion recorded {fmtDateTime(snap.at)}{snap.actorName ? ` · ${snap.actorName}` : ""}</div> : <div className="text-[12px] text-ink-3">no completion recorded</div>}
                    {canRepair && (
                      <Button size="sm" variant="subtle" icon={<Wrench size={13} />} onClick={() => setRepair(d)} data-testid={`wb-lane-repair-${d}`}>
                        Restore sign-off
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {repair && <LaneRepairDialog open onClose={() => setRepair(null)} c={c} dept={repair} snapshot={newestLaneSnapshot(b.events, c, repair)!} />}
    </Card>
  );
}

// ---------------------------------------------------------------- Sections

export function SectionsTab({ b }: { b: CaseBundle }) {
  const na = b.runs.flatMap((r) => {
    const rec = parseRecordedScope(r.resultJson);
    return rec ? rec.sections.filter((s) => s.applicability === "N.A.").map((s) => ({ ...s, run: r.runKey })) : [];
  });
  return (
    <div className="space-y-4">
      <ReadQualityBanner quality={b.quality.sections} what="Sections" scope="sections" />
      <Card>
        <CardHeader title="Sections" subtitle="Supplier answers live in the portal and are not readable from the Workbench yet." />
        {b.sections.length ? (
          <div className="relative overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-ink-3">
                  {["Section", "Key", "Applicability", "Lead", "Co-review", "Origin", "Added later", "Supplier due"].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.sections.map((s) => (
                  <tr key={s._id} className="border-b border-line last:border-0" data-testid={`wb-case-section-${s.sectionKey}`}>
                    <td className="px-3 py-2">
                      <span className="font-medium">{s.sectionCode}</span> {s.sectionTitle}
                    </td>
                    <td className="px-3 py-2">
                      <Mono>{s.sectionKey}</Mono>
                    </td>
                    <td className="px-3 py-2">{s.applicabilityLabel || "—"}</td>
                    <td className="px-3 py-2">{deptName(s.leadDept)}</td>
                    <td className="px-3 py-2">{s.coReviewDepts.map(deptName).join(", ") || "—"}</td>
                    <td className="px-3 py-2">{s.origin || "—"}</td>
                    <td className="px-3 py-2">{s.addedLater || "—"}</td>
                    <td className="px-3 py-2">{fmtDate(s.supplierDueDate) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No sections yet">The BASIC section is created with the case; the others at the scope check.</EmptyState>
        )}
      </Card>
      {na.length > 0 && (
        <Card>
          <CardHeader title="Not applicable (N.A.)" subtitle="Recorded in the scope run; no section row is created for them." />
          <ul className="divide-y divide-line px-4 text-[13px]">
            {na.map((s) => (
              <li key={`${s.run}-${s.sectionKey}`} className="py-2">
                <span className="font-medium">{s.code}</span> {s.title} <span className="text-ink-3">· default {s.default}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <CardHeader title="Scope runs" />
        {b.runs.length ? (
          <div className="relative overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-ink-3">
                  {["Run", "Trigger", "By", "At", "Rule set", "Sections added"].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.runs.map((r) => (
                  <tr key={r._id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      {r.runNo ?? "—"} <Mono className="text-ink-3">{r.runKey}</Mono>
                    </td>
                    <td className="px-3 py-2">{r.scopeTrigger || "—"}</td>
                    <td className="px-3 py-2">{personLabel(r.runBy)}</td>
                    <td className="px-3 py-2">{fmtDateTime(r.runAt) || "—"}</td>
                    <td className="px-3 py-2">{ruleSetLabel(r.ruleSetVersion)}</td>
                    <td className="px-3 py-2">{r.addedSectionKeys ? <CodeList value={r.addedSectionKeys} /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No scope run yet">The scope check records the first run.</EmptyState>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Open points (T2 components)

export function PointsTab({ b, onChanged }: { b: CaseBundle; onChanged(): void }) {
  const { caps, notify } = useWorkbench();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const c = b.case;
  return (
    <div className="space-y-4">
      <ReadQualityBanner quality={b.quality.points} what="Open points" scope="open points" />
      <Card>
        <CardHeader
          title="Open points"
          subtitle="Queries, document requests and internal reviews of this case."
          action={
            caps.canInitiate("CIQ_Open_Point_A00") && !c.cancelled ? (
              <Button size="sm" variant="primary" icon={<MessageSquarePlus size={14} />} onClick={() => setOpen(true)} data-testid="wb-case-raise-point">
                Raise open point
              </Button>
            ) : undefined
          }
        />
        <div className="p-2">{b.points.length ? <PointList points={b.points} onOpen={(id) => nav(`/points/${id}`)} /> : <EmptyState title="No open points readable for this case" />}</div>
      </Card>
      {open && (
        <RaisePointDialog
          open
          onClose={() => setOpen(false)}
          c={c}
          onRaised={() => {
            setOpen(false);
            notify("Open point raised.", "success");
            onChanged();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Change requests

export function CrsTab({ b }: { b: CaseBundle }) {
  const { caps } = useWorkbench();
  const nav = useNavigate();
  const c = b.case;
  return (
    <div className="space-y-4">
      <ReadQualityBanner quality={b.quality.crs} what="Change requests" scope="change requests" />
      <Card>
        <CardHeader
          title="Change requests"
          subtitle="Change requests of this case. Before triage they are matched by case code and cycle."
          action={
            caps.canInitiate("CIQ_Change_Request_A00") ? (
              <Button size="sm" icon={<FilePlus2 size={14} />} onClick={() => nav(`/change-requests/new?case=${encodeURIComponent(c._id)}`)} data-testid="wb-case-new-cr">
                Manual change request
              </Button>
            ) : undefined
          }
        />
        {b.crs.length ? <CrRows crs={b.crs} onOpen={(id) => nav(`/change-requests/${id}`)} /> : <EmptyState title="No change requests readable for this case" />}
      </Card>
    </div>
  );
}

export function CrRows({ crs, onOpen, caseOf, stepOfRow, hrefOf = (cr) => `/change-requests/${cr._id}` }: { crs: CrVM[]; onOpen(id: string): void; caseOf?(cr: CrVM): ReactNode; /** The step when known (a held task), else the row's own (item-level) step. */ stepOfRow?(cr: CrVM): StepIr | null; /** The link of the CR key (UX-07). */ hrefOf?(cr: CrVM): string }) {
  return (
    <div className="relative overflow-x-auto scrollbar-thin">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-line text-ink-3">
            {["Change request", ...(caseOf ? ["Case"] : []), "Kind", "Section / field", "Status · step", "Outcome", "Impacts"].map((h) => (
              <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {crs.map((r) => (
            <tr key={r._id} className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface-2" onClick={() => onOpen(r._id)} data-testid={`wb-cr-row-${r._id}`}>
              <td className="px-3 py-2 whitespace-nowrap">
                {/* UX-07: a real link (keyboard and screen readers); the row click stays a convenience */}
                <Link to={hrefOf(r)} onClick={(e) => e.stopPropagation()} className="text-brand hover:underline">
                  <Mono>{r.crKey || r._id}</Mono>
                </Link>
                {!r.caseItemId && <Badge tone="warn" className="ml-1.5">not triaged</Badge>}
              </td>
              {caseOf && <td className="px-3 py-2">{caseOf(r)}</td>}
              <td className="px-3 py-2">{r.changeKind || "—"}</td>
              <td className="px-3 py-2">{[r.sectionKey, r.fieldKey].filter(Boolean).join(" / ") || "—"}</td>
              <td className="px-3 py-2">
                <StatusBadge status={r.status} />
                {(stepOfRow?.(r) ?? r.step) && <div className="mt-0.5 text-[12px] text-ink-2">{stepDef((stepOfRow?.(r) ?? r.step)!).name}</div>}
              </td>
              <td className="px-3 py-2">{r.outcome || "—"}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {impactChips(r).map((x) => (
                    <Badge key={x.dept} tone={x.assessed ? "ok" : "warn"}>
                      {DEPT_LABEL[x.dept]}
                      {x.assessed ? `: ${x.assessment}` : ": assessment pending"}
                    </Badge>
                  ))}
                  {!impactChips(r).length && <span className="text-ink-3">—</span>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- Notes / Audit (T3 components)

export function NotesTab({ c }: { c: CaseVM }) {
  return (
    <Card>
      <CardHeader title="Internal notes" />
      <div className="p-4">
        <NotesPanel c={c} />
      </div>
    </Card>
  );
}
export function AuditTab({ b }: { b: CaseBundle }) {
  return (
    <div className="space-y-4">
      <ReadQualityBanner quality={b.quality.events} what="Audit events" scope="audit events" />
      <Card>
        <CardHeader title="Audit events" subtitle="Rows are written once and never edited." />
        <div className="p-4">{b.events.length ? <AuditTimeline events={b.events} /> : <EmptyState title="No audit events readable for this case" />}</div>
      </Card>
    </div>
  );
}
