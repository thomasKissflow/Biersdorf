// Static copy for the "Our understanding" page: the process steps of the swimlane map, the MVP
// scope and the list of inputs we still need. Everything that can be computed (rules, personas,
// assumptions) is read from the domain layer instead.
// Sources: requirements PDF, requirements matrix v2, field-level matrix v0.6, and the process after the
// client call of 9 Oct (context/decisions/2026-10-09-client-call.md: one supplier step with live scope,
// RMM reviews in Part 2, requirements-matrix ending only).

import type { PersonaId } from "@/domain/types";

export type LaneId = "supplier" | "system" | "rmm" | "depts";

export interface LaneDef {
  id: LaneId;
  label: string;
  sub: string;
  icon: "Factory" | "Cpu" | "UserRound" | "Users";
}

/** Map order, as shown to the client: Supplier | System | RMM | Departments. */
export const LANES: LaneDef[] = [
  { id: "supplier", label: "Supplier", sub: "External, up to 2 contacts", icon: "Factory" },
  { id: "system", label: "System", sub: "Rules, tasks, freeze, PDF", icon: "Cpu" },
  { id: "rmm", label: "RMM", sub: "Raw Material Management, case owner", icon: "UserRound" },
  { id: "depts", label: "Departments", sub: "Regulatory · Safety · QM · Microbiology · Sustainability", icon: "Users" },
];

export type Band = "part1" | "part2" | "closure";

export interface StepDef {
  id: string;
  n: number;
  lane: LaneId;
  /** Logical row in the map, 1…7 (steps 4 and 5 share row 4). */
  row: number;
  band: Band;
  /** Full title, used in the side panel. */
  title: string;
  /** Short title on the map card (the lane already names the actor). */
  card: string;
  /** One line under the card title. */
  short: string;
  gate?: boolean;
  /** A second lane that acts in this step too (shown as a ghost on the map and a badge in the side panel). */
  alsoLane?: LaneId;
  who: string;
  what: string;
  rules: string[];
  reqs: string[];
  assumptions: string[];
  source: string;
  persona?: PersonaId;
}

export const BAND_LABEL: Record<Band, string> = {
  part1: "Part 1 · Collect supplier data and documents",
  part2: "Part 2 · Beiersdorf technical review",
  closure: "Closure",
};

/** Shorter band names for the vertical rail on the map (Part 1 now spans only two steps). */
export const BAND_RAIL: Record<Band, string> = {
  part1: "Part 1 · Supplier",
  part2: "Part 2 · Beiersdorf review",
  closure: "Closure",
};

export const STEPS: StepDef[] = [
  {
    id: "s1", n: 1, lane: "rmm", row: 1, band: "part1",
    title: "RMM starts the case", card: "Starts the case", short: "Material, supplier, markets",
    who: "Raw Material Management, as the case owner",
    what: "RMM opens one CIQ case per raw material and supplier: trade name, supplier, primary and optional second contact, the responsible owner and the target markets. The supplier contact gets access and a task to open the CIQ.",
    rules: [
      "Missing mandatory fields block creation; e-mail formats are validated.",
      "Every case gets a unique ID; creation is audit-trailed with user and timestamp.",
      "RMM sets the target markets (SF-11); the supplier sees them read-only.",
      "No Teamcenter trigger in the MVP: the case is started manually and the material number is stored on it.",
    ],
    reqs: ["REQ-PROC-001", "REQ-PROC-004"],
    assumptions: ["AS-06", "AS-10"],
    source: "Requirements PDF PS-01 · Requirements matrix PS-01",
    persona: "rmm",
  },
  {
    id: "s2", n: 2, lane: "supplier", row: 2, band: "part1", gate: true,
    title: "Supplier fills in the CIQ and confirms completeness", card: "Fills in the CIQ, confirms completeness", short: "Sections open live as it answers",
    who: "One or several supplier contacts (external), working in parallel",
    what: "As confirmed on our call of 9 October, the supplier opens the CIQ directly and does all of Part 1 in this one step. It first sees the basic data and the metadata questions SF-01 to SF-12, above all the origin of every component; RMM has already set the target markets. As it answers, the published rules open the chapters, annexes and evidence that apply, live, each marked mandatory, optional or not applicable with the rule and answer behind it. Nothing goes to Beiersdorf to check or release first. The supplier fills in the open sections as structured data and uploads each document at the question it belongs to; two contacts can split the work. Finally it confirms completeness. This is neither a Beiersdorf approval nor the final release: it closes Part 1 and starts the reviews.",
    rules: [
      "Each metadata answer runs the rules again. Until the completeness confirmation, sections open and close with the answers, and what the supplier entered in a section that closes is kept; after it, a changed answer only adds sections.",
      "Same answers and same rule-set version always give the same scope; the version is logged on the case.",
      "Sections that do not apply are hidden from the supplier but kept internally with the reason. EU REACH always applies; when two rules touch a section, the stricter one wins.",
      "Waste, CCU and chemical recycling have no rules yet: the supplier gets the standard sections and a note that Beiersdorf may ask for more, and the case is flagged for RMM's review in Part 2.",
      "Conditional mandatory means mandatory when visible. Format checks: DUNS 9 digits, CAS check digit, concentration 0–100 % with min ≤ max.",
      "Answers are stored as structured, searchable data. Each upload stays linked to its question, with an overview of all uploads per chapter; user and timestamp are kept for every answer and document.",
      "The completeness confirmation is blocked until every required metadata question is answered (SF-05 colorant or preservative may stay empty; SF-11 is set by RMM) and every mandatory field and document has a value or a written justification; each blocker is named with its section.",
      "The confirmation is recorded with name, e-mail, role and timestamp, and the screen says clearly that it is not the final release. Answers and documents stay editable until Beiersdorf requests the final release, and every change is recorded.",
    ],
    reqs: ["REQ-PROC-004", "REQ-PROC-005", "REQ-PROC-006", "REQ-PROC-007", "REQ-PROC-009", "REQ-PROC-010", "REQ-CFG-003", "REQ-CFG-008", "REQ-CFG-009", "REQ-PROC-011", "REQ-PROC-012", "REQ-CTL-001", "REQ-PROC-014", "REQ-PROC-015", "REQ-PROC-016"],
    assumptions: ["AS-03", "AS-04", "AS-05", "AS-09"],
    source: "Requirements PDF PS-02 to PS-05, §5.1–5.4 · Requirements matrix PS-02 to PS-05 · Field-level matrix v0.6 · Our call on 9 October",
    persona: "supplier",
  },
  {
    id: "s3", n: 3, lane: "system", row: 3, band: "part2",
    title: "System activates only the relevant reviews and assigns the CIQ to RMM", card: "Activates the relevant reviews", short: "RMM and the departments concerned",
    who: "System",
    what: "With the completeness confirmation, the CIQ is assigned to RMM, which reviews all of it, and only the departments this case concerns get a review task, distributed by the configured section owners (lead and co-reviewers). When Safety or Regulatory is concerned, one internal RMES record is created for them; the RMES sheet is filled automatically from the CIQ.",
    rules: [
      "RMM always gets the whole CIQ, as a review task of its own for the case owner.",
      "Departments that are not concerned get no task; every task has exactly one named responsible person.",
      "Customs and Legal are informed and read-only; they have no review step.",
      "RMM and the responsible departments are notified.",
    ],
    reqs: ["REQ-PROC-017", "REQ-PROC-021", "REQ-CFG-006", "REQ-RMES-001"],
    assumptions: ["AS-07"],
    source: "Requirements PDF PS-06 · Requirements matrix PS-05 · Our call on 9 October",
  },
  {
    id: "s4", n: 4, lane: "rmm", row: 4, band: "part2",
    title: "RMM reviews the whole CIQ", card: "Reviews the whole CIQ", short: "At the same time as the departments",
    who: "RMM, as the case owner",
    what: "As confirmed on our call of 9 October, RMM reviews in Part 2, at the same time as the departments. It reads the whole CIQ: every answer and document, and the scope with the rule and answer behind each section. It can ask the supplier directly, with a query pinned to a field, table row or document, and write internal notes the supplier never sees. A case whose origin has no rules yet is flagged here. RMM no longer relays the departments' questions; it completes its own review like a department (step 6).",
    rules: [
      "RMM reads everything but never changes the supplier's answers.",
      "RMM can ask about any section. Its queries follow the same rules as the departments': an object reference, a responsible person and a due date, tracked as an open point. RMM can edit, change or close its own open points, and every change also reaches the supplier in the portal.",
      "An origin without rules yet (waste, CCU, chemical recycling) is flagged on RMM's review. The flag is for information and does not block RMM's completion; RMM or a department asks the supplier for more if needed. If the supplier chooses such an origin after RMM has completed, RMM's review reopens, so the flag is seen before the final release.",
      "RMM does not add sections itself. If one is missing, the department concerned adds it in its review with a justification; it is marked as a manual override and becomes a new supplier task. No section is ever removed.",
      "Internal notes and flags are never visible to the supplier.",
    ],
    reqs: ["REQ-PROC-018", "REQ-PROC-019", "REQ-PROC-020", "REQ-PROC-029", "REQ-ADR-001", "REQ-ADR-002", "REQ-CFG-008"],
    assumptions: ["AS-07", "AS-08", "AS-09"],
    source: "Our call on 9 October · Requirements matrix PS-06, PS-07",
    persona: "rmm",
  },
  {
    id: "s5", n: 5, lane: "depts", row: 4, band: "part2",
    title: "Departments review in parallel, with a direct query loop", card: "Review in parallel", short: "Ask the supplier directly",
    who: "Regulatory, Safety, QM, Microbiology and Sustainability (only those concerned), with the supplier",
    what: "Each department reviews its own sections at the same time as the others and as RMM, and asks the supplier directly. Every query or document request is pinned to the exact field, table row or file and tracked as an open point until the department accepts the answer. The supplier replies to the query and can also correct the field itself, because the questionnaire stays editable until Beiersdorf requests the final release; Beiersdorf reviewers never change the answers. Safety and Regulatory also see the RMES: one read-only sheet with the trade name, supplier, manufacturer and the composition, filled automatically from the CIQ.",
    rules: [
      "A query needs an object reference, a responsible person and a due date before it can be sent.",
      "The supplier answers, completes an added section, adds the requested document at the question it belongs to (not in the conversation), or explains why it cannot provide it.",
      "If a section is missing, the department adds it with a justification, marked as a manual override; a changed metadata answer can also add one. Either way it becomes a new supplier task and an open point for that department.",
      "Every change the supplier makes is recorded with name and time and shown to RMM and the departments that use that data; the full history stays at the object.",
      "If a department has already completed its review and the supplier changes something in a section it leads or co-reviews, that review reopens automatically and its reviewer is told by e-mail. RMM's review reopens the same way for the sections RMM leads or co-reviews.",
      "Only the reviewer who raised an open point can edit, change or close it, and every change also reaches the supplier in the portal. The loop repeats as often as needed.",
      "When an open point is raised or answered, the person who has to act next is told by e-mail.",
      "Internal notes, the RMES and the Safety and Regulatory decisions are never visible to the supplier.",
    ],
    reqs: ["REQ-PROC-016", "REQ-PROC-018", "REQ-PROC-019", "REQ-PROC-029", "REQ-PROC-030", "REQ-PROC-031", "REQ-PROC-032", "REQ-PROC-033", "REQ-PROC-034", "REQ-PROC-035", "REQ-ADR-001", "REQ-ADR-002", "REQ-PROC-022"],
    assumptions: ["AS-08", "AS-03"],
    source: "Requirements PDF PS-07, PS-08 · Requirements matrix PS-06 to PS-09",
    persona: "saf",
  },
  {
    id: "s6", n: 6, lane: "depts", row: 5, band: "part2", alsoLane: "rmm",
    title: "RMM and each department complete their review", card: "Each completes its review", short: "No open point left",
    who: "RMM and each activated department",
    what: "RMM and each department explicitly complete their review: all assigned data and documents reviewed, no open point left. This is not a raw-material approval. Safety and Regulatory also record their internal decision, Approved or Rejected. When RMM and the last department have completed, the supplier gets one single request for the final release.",
    rules: [
      "Completion is refused while any of the reviewer's open points is not closed; blockers are listed with type, section, status and owner.",
      "Safety and Regulatory complete once their decision is recorded. The RMES needs no input: it is filled from the CIQ and is not an approval step.",
      "A Rejected decision needs a reason, does not stop the other reviews and is never shown to the supplier. RMM sees it flagged and decides with the department whether to cancel the case with a justification; otherwise the case goes on to the final release.",
      "Safety and Regulatory complete separately; neither may complete for the other without an auditable delegation.",
      "No supplier message per completion. After the last one, RMM's included, exactly one request for the final release.",
    ],
    reqs: ["REQ-PROC-036", "REQ-PROC-038", "REQ-PROC-039", "REQ-PROC-040", "REQ-RMES-013"],
    assumptions: ["AS-07", "AS-08", "AS-02"],
    source: "Requirements PDF PS-10 · Requirements matrix PS-10 · Our call on 9 October",
    persona: "reg",
  },
  {
    id: "s7", n: 7, lane: "supplier", row: 6, band: "closure",
    title: "Supplier gives the final release", card: "Gives the final release", short: "One request, then frozen",
    who: "Supplier contact (external)",
    what: "When RMM and every activated department have completed, the supplier gets one single request: confirm that the information and evidence in the CIQ are correct and complete. From this request on the questionnaire is locked: the supplier can no longer change answers, documents, basic data or metadata answers, and can only give the release. If something must change, it contacts Beiersdorf, who can reopen a review; the request is then withdrawn and the questionnaire opens again until every review has completed again. With the release the CIQ is frozen.",
    rules: [
      "The request reaches the supplier only when RMM and every activated department have completed.",
      "Recorded with name, role, e-mail and timestamp.",
      "Until the release is requested, a supplier change in a section reopens the completed reviews of the departments that lead or co-review it, so the request waits until they complete again.",
      "From the release request on, every field and upload is locked and a change attempt is refused and logged. A reviewer who reopens its review withdraws the request and unlocks the questionnaire.",
      "With the release the CIQ is frozen. A correction after that needs a new request from Beiersdorf (to confirm).",
    ],
    reqs: ["REQ-PROC-007", "REQ-CFG-008", "REQ-PROC-031", "REQ-PROC-040", "REQ-PROC-042", "REQ-PROC-043"],
    assumptions: ["AS-03"],
    source: "Requirements matrix PS-11 · Our call on 9 October",
    persona: "supplier",
  },
  {
    id: "s8", n: 8, lane: "system", row: 7, band: "closure",
    title: "Case completes, final PDF to RMM", card: "Completes, final PDF to RMM", short: "Immutable PDF, filed and sent",
    who: "System; the RMM owner receives the PDF",
    what: "With the supplier's final release the case completes automatically, as confirmed on our call of 9 October. At that moment the final PDF is created without any user action: the released CIQ, the evidence list, the full text of every open point's questions and answers, the three kinds of confirmation and the case ID. It is versioned immutably, filed at the case and sent to the RMM owner.",
    rules: [
      "No completion without the supplier's final release.",
      "Completion logs the trigger and the timestamp.",
      "The PDF is created automatically and cannot be changed.",
      "Every open point appears with its full back-and-forth as text, in order, with who wrote what and when; attachments are listed in the evidence list, not embedded.",
      "B-Flow filing and Teamcenter feedback stay manual in the MVP.",
    ],
    reqs: ["REQ-PROC-045", "REQ-PROC-046", "REQ-RMES-020"],
    assumptions: ["AS-10", "AS-12"],
    source: "Requirements matrix PS-12 · Our call on 9 October",
    persona: "rmm",
  },
];

export const STEP_BY_ID: Record<string, StepDef> = Object.fromEntries(STEPS.map((s) => [s.id, s]));

/** Steps in walk-through order (STEPS is already ordered 1…8). */
export const STEP_ORDER: string[] = STEPS.map((s) => s.id);

/** Secondary nodes on the map that open an existing step. */
export const GHOSTS: { id: string; lane: LaneId; row: number; opens: string; label: string }[] = [
  { id: "g5", lane: "supplier", row: 4, opens: "s5", label: "Answers queries, can still correct any answer" },
  { id: "g6", lane: "rmm", row: 5, opens: "s6", label: "Completes its own review" },
  { id: "g8", lane: "rmm", row: 7, opens: "s8", label: "Receives the final PDF" },
];

// ---------------------------------------------------------------------------
// MVP scope

export const IN_MVP: { title: string; detail: string }[] = [
  { title: "Questionnaire driven by the metadata questions", detail: "As the supplier answers SF-01 to SF-12, the rules open each section live as mandatory, optional or not applicable, with the reason shown." },
  { title: "Supplier portal with two contacts", detail: "Both contacts work at the same time; every answer and upload shows who entered it." },
  { title: "Parallel review by RMM and the departments, with pinned queries", detail: "Each query is pinned to a field, table row or document and tracked until the reviewer who asked closes it." },
  { title: "RMES filled from the CIQ", detail: "One read-only sheet for Safety and Regulatory: trade name, supplier, manufacturer and, per component, INCI, %, CAS, EC and the origin with its free text, each with its CIQ source. Never visible to the supplier." },
  { title: "Versioned rules and questionnaire", detail: "Running cases keep the rule-set and questionnaire version they started with." },
  { title: "Audit trail", detail: "Who did what and when, on which value and which document (file name and upload date)." },
  { title: "Dashboards and reports", detail: "Lead time per phase, waiting time, bottlenecks and supplier performance." },
  { title: "Final PDF (simulated)", detail: "Generation and filing are recorded on the case; the prototype does not produce the file itself." },
];

export const LATER: { title: string; detail: string; tag: "Integration" | "Scope" | "Your decision" }[] = [
  { title: "Teamcenter start and status feedback", detail: "Cases start manually in the MVP; the material number is stored on every case.", tag: "Integration" },
  { title: "B-Flow filing", detail: "The final document is filed manually in the MVP.", tag: "Integration" },
  { title: "SAP MDG supplier master", detail: "Suppliers and contacts are maintained in the CIQ application for now.", tag: "Integration" },
  { title: "Suppliers who send their own documents", detail: "Who transfers a supplier's own questionnaire into the portal, and how it is marked.", tag: "Your decision" },
  { title: "Production-site qualification", detail: "Field-level matrix v0.6 keeps one production site; additional sites are informative only.", tag: "Scope" },
  { title: "AI document review beyond a first check", detail: "Any AI suggestion is marked and must be confirmed or discarded by a reviewer.", tag: "Scope" },
  { title: "Retention rules", detail: "Retention periods and legal hold for cases and documents.", tag: "Your decision" },
];

export const NEEDS: { title: string; why: string }[] = [
  { title: "Your process diagram", why: "The requirements PDF refers to a diagram we have not seen. We drew this map from your documents and our call on 9 October." },
  { title: "Test plan and scorecard", why: "So we build and demonstrate exactly the cases you will score." },
  { title: "Binding configuration table", why: "The rule table in the documents contradicts itself in places. We need the version you stand behind." },
  { title: "CIQ 2026 Word template", why: "Final wording, help texts and order of every chapter and annex." },
  { title: "RMES origin free text", why: "Which CIQ answer is the free text of the components' origin: the specification asked per origin type, or the feedstock (FLD-A1-102). The CIQ asks it once per origin type, not per component." },
  { title: "Beiersdorf limit values", why: "Heavy metals, PAH and MOAH limits. The prototype checks heavy metals against illustrative values." },
  { title: "Final PDF content", why: "What the immutable final document for RMM must contain, and whether it is created without user action or by RMM with one click." },
  { title: "Anonymised sample CIQs", why: "Real answers to test the rules and the supplier experience against." },
];

// ---------------------------------------------------------------------------
// Timeline (client call view)

export interface Milestone {
  date: string; // ISO day, e.g. "2026-10-09"
  title: string;
  detail: string;
  /** What we need from Beiersdorf before this milestone can happen. */
  needs?: string;
  done?: boolean;
}

export const TIMELINE: Milestone[] = [
  { date: "2026-10-09", done: true, title: "Process walkthrough with you", detail: "We walked you through the end-to-end flow and clarified your open questions together." },
  { date: "2026-10-14", title: "Clickable mockup of the screens and the flow", detail: "We show the screens and the flow in a clickable mockup, so your team can try it out and check that the fields match your needs." },
  { date: "2026-10-16", title: "Backend walkthrough for your team", detail: "We show how the solution is set up in Kissflow: what each form and process does, and how your team can get the data through API calls." },
  { date: "2026-10-26", title: "Application development complete", detail: "The internal application and the supplier portal are ready for production testing.", needs: "Who will test: the users for the internal application roles and the supplier portal users." },
  { date: "2026-10-27", title: "Open for production testing", detail: "Your end users test the application and the supplier portal and try it out freely." },
];
