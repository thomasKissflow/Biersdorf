// /review/:caseId — the review workspace of RMM and the departments: read every section, ask the supplier on any of
// them, decide on the supplier's answers (only the raiser), record the Safety / Regulatory decision and complete the
// review. Safety and Regulatory also have the RMES tab: the read-only sheet filled from the CIQ (BDF's scope of 28 Oct;
// the decision is not part of it and sits on the Questionnaire tab). RMM reviews the whole CIQ (RMM lane) and never adds
// sections; a department may add a missing one. Deep links: ?s=<section>, ?tab=rmes, ?op=<open point> (from the mails).
import { Info, Lock, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Card, EmptyState, Tabs } from "@/components/ui";
import { DEPT_LABEL, ORIGIN_LABEL, sectionOf } from "@/domain/catalog";
import { can } from "@/domain/permissions";
import { undefinedOrigins } from "@/domain/rules";
import { PHASE_LABEL, activeSections, isClosed, rmmFlags, sectionsOwnedBy } from "@/domain/selectors";
import { useCase, useStore } from "@/store/store";
import { ActivateSectionModal, RaiseQueryModal } from "./AskModals";
import { CompletePanel } from "./CompletePanel";
import { InternalNotes } from "./InternalNotes";
import { changeMarkers, joinNames } from "./lib";
import { OpenPointsPanel } from "./OpenPointsPanel";
import { DecisionCard } from "./RmesSide";
import { RmesTab } from "./RmesTab";
import { SectionContent } from "./SectionContent";
import { SectionNav, SectionPicker } from "./SectionNav";
import { type AskTarget, NotReviewer, Notice, isRmesDept, isRmmLane, secCode, useReviewer } from "./shared";
import { WorkspaceHeader } from "./WorkspaceHeader";

function Missing({ title, testId, children }: { title: string; testId: string; children: React.ReactNode }) {
  return (
    <div data-testid={testId}>
      <Link to="/review" className="mb-4 inline-flex text-[13px] text-ink-3 hover:text-ink">
        ← My reviews
      </Link>
      <Card>
        <EmptyState title={title}>{children}</EmptyState>
      </Card>
    </div>
  );
}

export function ReviewWorkspace() {
  const { caseId } = useParams();
  const c = useCase(caseId);
  const { state, me } = useStore();
  const { dept } = useReviewer();
  const [params, setParams] = useSearchParams();
  const [ask, setAsk] = useState<AskTarget | null>(null);
  const [activate, setActivate] = useState(false);
  /** Set by the completion bar's decision link: scroll to the decision card once the Questionnaire tab shows it. */
  const [toDecision, setToDecision] = useState(0);
  const [highlight, setHighlight] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  /** The section opened by default, kept per case so it does not jump away when a point gets closed. */
  const defaultSection = useRef<Record<string, string | undefined>>({});
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!toDecision) return;
    const el = document.getElementById("decision-card");
    // still on the RMES tab: wait for the switch to the Questionnaire tab (a params change)
    if (!el && params.get("tab") === "rmes") return;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
    setToDecision(0);
  }, [toDecision, params]);

  const focusOp = useCallback((id: string) => {
    setHighlight(id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHighlight(null), 2500);
  }, []);
  /** Shows one open point: its section in the questionnaire tab, and the point highlighted in the right rail. */
  const showPoint = useCallback(
    (opId: string) => {
      const p = c?.openPoints.find((x) => x.id === opId);
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.delete("op");
          n.delete("tab");
          if (p) n.set("s", p.ref.sectionId);
          return n;
        },
        { replace: true },
      );
      if (p) focusOp(p.id);
    },
    [c, setParams, focusOp],
  );
  // Mail deep link: /review/<case>?op=<point>.
  const opParam = params.get("op");
  useEffect(() => {
    if (opParam && c) showPoint(opParam);
  }, [opParam, c, showPoint]);

  if (!c)
    return (
      <Missing title="Case not found" testId="workspace-not-found">
        There is no case {caseId}, or you have no access to it.
      </Missing>
    );
  if (!dept) return <NotReviewer caseId={c.id} />;
  if (c.reviews.length === 0)
    return (
      <Missing title="The review has not started yet" testId="workspace-not-started">
        {c.id} is in the phase “{PHASE_LABEL[c.phase]}”. The review tasks are created when the supplier confirms completeness; you get an e-mail then.
      </Missing>
    );
  const track = c.reviews.find((r) => r.dept === dept);
  if (!track)
    return (
      <Missing title={isRmmLane(dept) ? "RMM has no review task on this case" : "Your department has no review task on this case"} testId="workspace-no-track">
        {isRmmLane(dept)
          ? `${c.id} has no RMM review task. You can still read the case on the case page.`
          : `No section of ${c.id} is led by ${DEPT_LABEL[dept]}, so no review task was created for you. You can still read the case on the case page.`}{" "}
        <Link to={`/cases/${c.id}`} className="font-medium text-brand hover:underline">
          Open the case page
        </Link>
      </Missing>
    );

  const closed = isClosed(c);
  // Asking and deciding happen while the case is in review and this track is not completed.
  const trackOpen = !closed && c.phase === "review" && track.status !== "completed";
  const rmm = isRmmLane(dept);
  const active = activeSections(c).map((s) => s.sectionId);
  // RMM reviews the whole CIQ. A department's own sections are those it leads or co-reviews; it may ask on the others too.
  const mine = rmm ? active : sectionsOwnedBy(c, dept, state.ownership);
  const others = active.filter((id) => !mine.includes(id));
  const canAsk = trackOpen && can(state, me.id, "op.raise", c, { dept });
  // Only a department adds a section during the review (REQ-ADR-002); RMM asks the supplier or the department concerned.
  const canActivate = trackOpen && !rmm && c.scope.some((s) => s.applicability === "na") && can(state, me.id, "scope.extend", c);
  const flagged = rmm && rmmFlags(c).length > 0;
  // Safety and Regulatory read the RMES once the case is past Part 1 (whether or not its record exists yet: the sheet
  // is derived from the case); nobody else sees it.
  const hasRmes = isRmesDept(dept) && c.phase !== "supplier-input";
  const tab = hasRmes && params.get("tab") === "rmes" ? "rmes" : "ciq";
  const markers = changeMarkers(c, dept);
  const changed = markers.sections.filter((id) => active.includes(id));
  const changedMine = changed.filter((id) => mine.includes(id));
  const inView = (id?: string | null): id is string => !!id && !!sectionOf(id, c.templateVersion) && active.includes(id);
  const codes = (ids: string[]) => ids.map((id) => secCode(id, c.templateVersion)).join(", ");
  const defKey = `${c.id}:${dept}`;
  if (!inView(defaultSection.current[defKey])) {
    const firstWithMyPoint = mine.find((id) => c.openPoints.some((p) => p.dept === dept && p.status !== "closed" && p.ref.sectionId === id));
    defaultSection.current[defKey] = firstWithMyPoint ?? mine[0] ?? others[0];
  }
  const requested = params.get("s");
  const selected = inView(requested) ? requested : (defaultSection.current[defKey] ?? "");

  const setParam = (k: string, v: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v === null) n.delete(k);
        else n.set(k, v);
        return n;
      },
      { replace: true },
    );
  const jump = (sectionId: string) => {
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set("s", sectionId);
        n.delete("tab");
        return n;
      },
      { replace: true },
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // the decision card is on the Questionnaire tab: switch to it, then the effect above scrolls there
  const showDecision = () => {
    if (tab !== "ciq") setParam("tab", null);
    setToDecision((n) => n + 1);
  };
  const myOpen = c.openPoints.filter((p) => p.dept === dept && p.status !== "closed").length;
  const origins = undefinedOrigins(c.config).map((o) => ORIGIN_LABEL[o]);

  return (
    <div data-testid="review-workspace">
      <WorkspaceHeader c={c} state={state} dept={dept} track={track} />

      {flagged && (
        <div className="mb-5">
          <Notice tone="warn" icon={<TriangleAlert size={15} />} title="Flagged for you: origin without rules" testId="workspace-origin-flag">
            No origin rules exist yet for {joinNames(origins)}, so the supplier got the standard sections only. Check whether more is needed: ask the supplier on the section concerned, or ask the department concerned to add a section. The flag does not block your completion.
          </Notice>
        </div>
      )}

      {closed && (
        <div className="mb-5">
          <Notice tone="neutral" icon={<Lock size={15} />} title={`This case is ${PHASE_LABEL[c.phase].toLowerCase()}`} testId="workspace-closed">
            {c.phase === "completed" ? "The supplier gave the final release and the CIQ is frozen. The final document and the history are on the case page." : "Every task on it has ended. The history stays available on the case page."}
          </Notice>
        </div>
      )}
      {!closed && track.status === "completed" && (
        <div className="mb-5">
          <Notice tone={changedMine.length ? "warn" : "ok"} icon={<Info size={15} />} title="Your review is completed" testId="workspace-completed">
            {changedMine.length
              ? `The supplier changed ${codes(changedMine)} ${markers.sinceLabel}. Reopen your review at the bottom of the page if the change matters.`
              : c.phase === "final-release"
                ? "Every review is completed and the supplier has been asked for the final release; its questionnaire is locked meanwhile. If something must change, reopen your review: the case goes back to review and the supplier can change its answers again."
                : "Nothing changed in your sections since you completed. If the supplier changes something in a section you lead or co-review, your review reopens automatically and you get an e-mail."}
          </Notice>
        </div>
      )}
      {trackOpen && changed.length > 0 && (
        <div className="mb-5">
          <Notice tone="info" icon={<Info size={15} />} testId="workspace-changed">
            Changed {markers.sinceLabel}: {codes(changed)}. The changed answers and documents are marked in the sections.
          </Notice>
        </div>
      )}

      {hasRmes && (
        <Tabs
          className="mb-5"
          value={tab}
          onChange={(v) => setParam("tab", v === "rmes" ? "rmes" : null)}
          tabs={[
            { value: "ciq", label: <span data-testid="workspace-tab-ciq">Questionnaire</span>, count: myOpen || undefined },
            { value: "rmes", label: <span data-testid="workspace-tab-rmes">RMES</span> },
          ]}
        />
      )}

      {tab === "ciq" ? (
        <div className="grid items-start gap-5 lg:grid-cols-[212px_minmax(0,1fr)] xl:grid-cols-[212px_minmax(0,1fr)_330px]">
          <SectionNav c={c} dept={dept} ownership={state.ownership} mine={mine} others={others} changed={changed} sinceLabel={markers.sinceLabel} selected={selected} onSelect={(id) => setParam("s", id)} canActivate={canActivate} onActivate={() => setActivate(true)} />
          <SectionPicker lane={rmm ? "rmm" : "dept"} templateVersion={c.templateVersion} mine={mine} others={others} changed={changed} selected={selected} onSelect={(id) => setParam("s", id)} canActivate={canActivate} onActivate={() => setActivate(true)} />
          <div className="min-w-0">
            {selected ? (
              <SectionContent c={c} state={state} sectionId={selected} mine={mine.includes(selected)} canAsk={canAsk} since={markers.since} onAsk={setAsk} onFocusOp={focusOp} />
            ) : (
              <Card>
                <EmptyState title="No section in scope">The case has no section that applies yet.</EmptyState>
              </Card>
            )}
          </div>
          <div className="min-w-0 space-y-5 lg:col-span-2 xl:col-span-1">
            {isRmesDept(dept) && <DecisionCard c={c} dept={dept} track={track} canAct={trackOpen} />}
            <OpenPointsPanel c={c} dept={dept} trackOpen={trackOpen} highlight={highlight} onJump={jump} />
            <InternalNotes c={c} sectionId={selected || undefined} onJump={jump} />
          </div>
        </div>
      ) : (
        <RmesTab c={c} state={state} onJump={jump} />
      )}

      <CompletePanel c={c} dept={dept} track={track} onShowPoint={showPoint} onShowDecision={showDecision} />

      {ask && <RaiseQueryModal c={c} dept={dept} target={ask} onClose={() => setAsk(null)} />}
      {activate && canActivate && (
        <ActivateSectionModal
          c={c}
          dept={dept}
          onClose={() => setActivate(false)}
          onDone={(id) => {
            setActivate(false);
            setParam("s", id);
          }}
        />
      )}
    </div>
  );
}
