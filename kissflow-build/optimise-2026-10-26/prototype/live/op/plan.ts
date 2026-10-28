// S-OP's data per run (SPEC §4 S-OP: "every department in turn across runs"; §3: R1 is the showcase, R2 and R3 vary
// the data and clean up). The departments rotate: R1 QM, R2 SAF + REG, R3 MIC + SUS + RMM. Each run covers the three
// decisions (return → round 2 → accept, accept, close while the query is open); R1 also leaves one point answered and
// waiting for the raiser's decision, a stage for Thomas to look at. R4 (21 Oct evening) is a second showcase: five
// points on one case, each left at its own stage (answered, returned with round 2 open, accepted, closed while its query
// was open, edited and waiting for the supplier), QM, SAF and REG among them; its ledger stages name what each step
// proved. Any other run name (offline only) rehearses every run's points in one go. Every text starts with the run
// tag; people are fictional (Thomas is the only real one).
import type { ConfigAnswers, InternalPersonaId, Market, ReviewDept } from "@/domain/types";

/** What happens to a point after it is raised. */
export type PointFlow =
  /** answer → return (round 2: a new query) → answer → accept */
  | "return-accept"
  /** answer → accept */
  | "accept"
  /** closed (withdrawn) while the supplier's query is open */
  | "close"
  /** answer, then left waiting for the raiser's decision (R1, R4 showcase) */
  | "answered"
  /** answer → return (round 2: a new query), then left with the supplier (R4 showcase) */
  | "return"
  /** left with the supplier after the raise (and the edit, when planned): its round-1 query open (R4 showcase) */
  | "open";

export interface PointPlan {
  /** "P1", "P2", … within the run. */
  key: string;
  dept: ReviewDept;
  persona: InternalPersonaId;
  /** A section the department leads (always in scope: catalog.ts BUILTIN_SECTIONS). */
  sectionId: string;
  flow: PointFlow;
  /** editOpenPoint while the query is open (op.edited). */
  edit: boolean;
}

export interface RunPlan {
  run: string;
  depts: ReviewDept[];
  points: PointPlan[];
  /** The case's target markets (SF-11, set by RMM) and the supplier's metadata answers: the scope differs per run. */
  markets: Market[];
  config: ConfigAnswers;
  /** Process items stay for Thomas (R1, R4); otherwise the suite deletes its own ledger items at the end. */
  keep: boolean;
  /** R4: each kept item's ledger stage names what the steps proved on it (R1's name its step as read back). */
  proofs?: boolean;
  /** Offline: the fake I-2's Approve moves the case on (lib/world.ts caseStepsHeld): R4 rehearses 21 Oct evening, when
   *  Thomas is back in Integration service (the held roles stay as read at 02:30). Live reads the roles. */
  caseStepsHeld?: boolean;
  /** The suite's own timeout at the 2.5 s pace, in minutes (default 90; op.live.ts scales it with KF_GAP_MS). R4's five
   *  points make ≈750 calls, ≈1000 after S-CASE R4 (whose items each load reads too): 120. */
  timeoutMin?: number;
}

export const PERSONA_OF: Record<ReviewDept, InternalPersonaId> = { RMM: "rmm", REG: "reg", SAF: "saf", QM: "qm", MIC: "mic", SUS: "sus" };
const SECTION_OF: Record<ReviewDept, string> = { QM: "K3", SAF: "K2.2", REG: "K6.1", MIC: "K5.2", SUS: "A1", RMM: "GEN" };

/** The supplier's metadata answers (testkit PLAIN_CONFIG: vegetable origin opens A1, so Sustainability reviews too). */
const PLAIN: ConfigAnswers = { SF01: ["vegetable"], SF02: false, SF03: false, SF04: false, SF05: [], SF06: false, SF07: false, SF08: false, SF09: false, SF10: false, SF12: true };

const point = (key: string, dept: ReviewDept, flow: PointFlow, edit = false): PointPlan => ({ key, dept, persona: PERSONA_OF[dept], sectionId: SECTION_OF[dept], flow, edit });

const RUNS: Record<string, Omit<RunPlan, "run">> = {
  R1: { depts: ["QM"], markets: ["EU"], config: PLAIN, keep: true, points: [point("P1", "QM", "return-accept", true), point("P2", "QM", "close"), point("P3", "QM", "answered")] },
  R2: { depts: ["SAF", "REG"], markets: ["EU", "UK"], config: { ...PLAIN, SF07: true }, keep: false, points: [point("P1", "SAF", "return-accept", true), point("P2", "REG", "close")] },
  R3: { depts: ["MIC", "SUS", "RMM"], markets: ["EU", "US"], config: { ...PLAIN, SF09: true }, keep: false, points: [point("P1", "MIC", "return-accept", true), point("P2", "SUS", "accept"), point("P3", "RMM", "close")] },
  // R4: R1's scope (proven live on 21 Oct: QM, SAF and REG review it), one point per stage: P1 answered and awaiting the
  // raiser's decision, P2 returned (round 2 open at the supplier), P3 accepted (End), P4 closed while its query was
  // open, P5 edited and awaiting the supplier
  R4: {
    depts: ["QM", "SAF", "REG"],
    markets: ["EU"],
    config: PLAIN,
    keep: true,
    proofs: true,
    caseStepsHeld: true,
    timeoutMin: 120,
    points: [point("P1", "QM", "answered"), point("P2", "SAF", "return"), point("P3", "REG", "accept"), point("P4", "QM", "close"), point("P5", "REG", "open", true)],
  },
};

/** The plan of `run`; another name (offline) gets every run's points, renumbered, and cleans up. */
export function planOf(run: string): RunPlan {
  const own = RUNS[run];
  if (own) return { run, ...own };
  const points = Object.values(RUNS)
    .flatMap((r) => r.points)
    .map((p, i) => ({ ...p, key: `P${i + 1}` }));
  return { run, depts: [...new Set(points.map((p) => p.dept))], points, markets: ["EU", "UK"], config: PLAIN, keep: false };
}

/** The texts of one point (every one starts with the run tag `t(…)`). */
export function textsOf(p: PointPlan, t: (s: string) => string) {
  const d = p.dept;
  return {
    question: t(`${d} ${p.key}: please confirm the specification limits for section ${p.sectionId} and name the test method.`),
    justification: t(`${d} ${p.key}: needed for the ${d} review.`),
    editedQuestion: t(`${d} ${p.key}: please confirm the specification limits for section ${p.sectionId}, the test method and its detection limit.`),
    editedJustification: t(`${d} ${p.key}: needed for the ${d} review (detection limit added).`),
    answer1: t(`Supplier ${p.key}: the limits are in the specification of 12 Oct; method per Ph. Eur. 2.6.12.`),
    returnReason: t(`${d} ${p.key}: please add the detection limit of the method.`),
    answer2: t(`Supplier ${p.key}: the detection limit is 10 cfu/g.`),
    closeReason: t(`${d} ${p.key}: already answered in the dossier on file; no answer needed.`),
  };
}
