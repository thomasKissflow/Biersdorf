import { canonicalFieldType, slug as slugId } from "./util.mjs";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

/**
 * Load a run's App-Spec from disk, FOLDING IN the sibling stage artifacts the conductor writes
 * separately — `automations.json` above all. The blueprint (review.mjs), the deterministic gate
 * (orchestrator/checkAppFloor) and the builders all read `ir.automations`, but the express conductor
 * writes the automations only to `automations.json` and never inlines them into `app-spec.json`. Nothing
 * merged the two, so every consumer saw ZERO automations even when the run authored them: the Blueprint's
 * Automations tab showed its empty state, and the gate's AUTOMATIONS_MISSING floor would fire wrongly.
 * This is the missing "assembly" step. A spec that already carries automations wins — the sibling is a
 * fallback merged only when `ir.automations` is empty, so an inlined spec is never overwritten.
 */
export function loadRunSpec(specPath) {
  const ir = JSON.parse(readFileSync(specPath, "utf8"));
  if (ir && typeof ir === "object" && (!Array.isArray(ir.automations) || !ir.automations.length)) {
    try {
      const sib = join(dirname(specPath), "automations.json");
      if (existsSync(sib)) {
        const a = JSON.parse(readFileSync(sib, "utf8"));
        const arr = Array.isArray(a) ? a : (a && Array.isArray(a.automations) ? a.automations : []);
        if (arr.length) ir.automations = arr;
      }
    } catch { /* the sibling is optional — a spec with no automations.json simply has none */ }
  }
  return ir;
}
// App-Spec IR validation — the contract the AI fills. Validates shape AND
// cross-references (a reference field's target exists, a page's role exists, a
// journey's persona exists), so errors are caught at the IR boundary, never in
// raw metadata.
//
// IR shape (high level):
// {
//   app: { name, id?, description? },
//   personas: [{ id, name, goals?:[string] }],
//   journeys: [{ id, persona, story, steps?:[string] }],
//   roles: [{ name, id?, users?, groups? }],
//   lists: [{ name, id?, items?:[string] }],          // option lists / datasets
//   forms: [{ name, id?, flowType?:"Form"|"Process"|"Case"|"Board", section?,
//             statuses?:[{ name, category? }], // BOARD/CASE only — columns of an UNSTRUCTURED workflow
//                                              // (todos/tasks/projects; service requests/support/onboarding)
//             fields:[{ name, type, required?, ref?, referredList?, currency?, formula?,
//                       prefix?, padding? }],   // SequenceNumber: prefix is MANDATORY on the platform —
//                                               // default "<3-letter flow initials> - ", padding "0001"
//             workflow?: { steps:[{ name, actor?,   // PROCESS only — Sequence steps; actor = role name
//               condition?: "Amount > 500000",       // skip-unless formula (middle steps only): the step
//                                                    // runs when true, is skipped when false (LESSONS §11)
//               field_permissions?: { "<field, section or child-table name>":  // per-step access override
//                 "Editable"|"ReadOnly"|"Hidden"|"Mandatory" } }] } }],  // default: Editable@Start, ReadOnly after
//   pages: [{ name, id?, role?, cards?:[{label, report?, scope?}] }],
//   permissions: [{ role, model, level?, fields?:[{field, level}] }]
// }

const REF_FIELD_TYPES = new Set(["Reference", "ReferenceList"]);
// Every field type whose options come from a list — each one is unusable if that list is empty.
const SELECT_FIELD_TYPES = new Set(["Select", "Multiselect", "Radio", "Checkbox"]);

export function validateIR(ir) {
  const issues = [];
  const err = (code, msg, where = "") => issues.push({ level: "error", code, msg, where });
  const warn = (code, msg, where = "") => issues.push({ level: "warn", code, msg, where });

  if (!ir || typeof ir !== "object") return { ok: false, issues: [{ level: "error", code: "IR_EMPTY", msg: "IR missing" }] };
  if (!ir.app?.name) err("NO_APP_NAME", "app.name is required");

  // ── SEQUENCE NUMBER ON A CASE ─────────────────────────────────────────────────────────────────
  // A SequenceNumber field on a Case flow is PLAN-GATED on dev accounts, and the failure is
  // catastrophic and silent: publish 403s "YourPlanNotSupport" with args.feature = null (the
  // platform does not even name the gated feature), but the case is ALREADY Live from its creation
  // publish — so it stays Live carrying only Summary/Description/Attachment and EVERY custom field
  // is lost. Bisected live on dev-lcncdemo 2026-08-02: removing the SequenceNumber field alone
  // flips the publish dry-run from 403 to 200. It silently gutted three apps before it was found
  // (PulseBook Support Request, Order Desk Fulfilment, Hire-to-Onboard Onboarding).
  // Cases already carry an auto-generated `_id`; a human-readable code belongs on a Form/Process.
  for (const f of ir.forms || []) {
    if (!/^(case|board)$/i.test(f.flowType || "")) continue;
    for (const fld of f.fields || [])
      if (/^sequencenumber$/i.test(fld.type || ""))
        err("CASE_SEQUENCE_NUMBER",
          `Case "${f.name}" has a SequenceNumber field ("${fld.name}") — plan-gated on Case flows; publishing strips EVERY custom field while leaving the case Live. Use a Text field, or drop it (cases already have _id).`,
          `${f.name}.${fld.name}`);

    // ── A CASE IS ITS STATUSES ──────────────────────────────────────────────────────────────────
    // A Case has no routed steps; its statuses ARE the workflow — the board's columns and the only
    // thing that moves work. With none declared the flow publishes as a board with no lanes: nothing
    // can be triaged, nothing can progress, and the review page has to render "No statuses defined",
    // which is a design that cannot be signed off. Blocking rather than defaulted on purpose —
    // inventing statuses would invent the business meaning the case exists to express.
    // Read BOTH keys, exactly as buildBoard does. A design-shape spec's statuses arrive merged under
    // `caseflow` and the builder honours them; only this check looked at `statuses` alone, so a Case
    // with a complete, designed set of statuses was reported as declaring none.
    const statuses = (f.statuses || f.caseflow?.statuses || []).map((s) => (typeof s === "string" ? s : s?.name)).filter(Boolean);
    if (!statuses.length)
      err("CASE_NO_STATUSES",
        `Case "${f.name}" declares no statuses — a Case has no steps, so its statuses ARE its workflow. Publishing gives a board with no columns and no way to move work. Declare them (e.g. statuses: [{ name: "Open", category: "NotStarted" }, …]), or model this as a Process if work is handed between roles.`,
        f.name);
    else if (statuses.length < 2)
      warn("CASE_ONE_STATUS",
        `Case "${f.name}" has a single status ("${statuses[0]}") — nothing can ever move. A case needs at least a start and a done state.`,
        f.name);
    else {
      const key = (x) => String(x).trim().toLowerCase();
      const dupes = [...new Set(statuses.filter((s, i) => statuses.findIndex((x) => key(x) === key(s)) !== i))];
      if (dupes.length)
        err("CASE_DUPLICATE_STATUS", `Case "${f.name}" declares the same status twice (${dupes.join(", ")}) — the board would render duplicate columns`, f.name);
    }
  }

  // ── THE WORKFLOW GATE ─────────────────────────────────────────────────────────────────────────
  // Three shipped apps in a row (PulseBook 07-30, a food-ordering app, Capital Expenditure 07-31)
  // arrived with approval language all over their domain and NOT ONE Process flow — every entity
  // modelled as a Form or a bare Case, so nothing routed work between roles and every gate passed,
  // because an app with zero workflow is structurally valid. Structural validity is not the bar.
  // If the domain talks about approvals, someone has to approve: that is a Process with steps, and
  // its absence is an ERROR, not a style choice. The architect's rule of thumb (confirmed 07-31):
  // status transitions someone performs on their OWN record → Case; work handed BETWEEN ROLES
  // (approve / review / sign-off) → Process.
  // A PROCESS IS ITS STEPS. The check below asks "is there any Process with steps?" and then asks the
  // domain PROSE whether that absence matters — so a flow that declares itself a Process and carries
  // none passes whenever the text happens not to say "approve". Field Service Dispatch shipped that
  // way (2026-08-13): two Process flows, zero steps, `engine validate` reporting 0 errors and 0
  // warnings, while the steps sat in the file under a `workflow:` ARRAY that no consumer reads.
  // normalizeIR now lowers that shape — this is the gate that would have caught it either way, and
  // catches the next mis-shape nobody has thought of yet. It needs no prose to fire: declaring a
  // Process and giving it no steps is incoherent on its own terms.
  {
    const topFlow = !Array.isArray(ir.workflow) && ir.workflow?.flow;
    for (const f of ir.forms || []) {
      if (!/^process$/i.test(f.flowType || "")) continue;
      if ((f.workflow?.steps || f.steps || []).length) continue;
      const key = String(f.id ?? f.name ?? "").toLowerCase();
      // the single top-level workflow may be this flow's, either by naming it or by being the only one
      const covered = !Array.isArray(ir.workflow) && (ir.workflow?.steps || []).length &&
        (!topFlow || String(topFlow).toLowerCase() === key);
      if (covered) continue;
      err("PROCESS_NO_STEPS",
        `flow "${f.name || f.id}" is declared a Process but carries no workflow steps — a Process IS ` +
        `its steps: with none it publishes as a form nobody routes, no work moves between roles, and ` +
        `the app has no workflow at all. Give it steps, or model it as a Form (one record, no handoff) ` +
        `or a Case (statuses someone sets on their own record).`,
        "workflow");
    }
  }

  {
    const flows = ir.forms || [];
    const hasProcessWithSteps = flows.some((f) =>
      /^process$/i.test(f.flowType || "") && ((f.workflow?.steps || f.steps || []).length >= 2));
    if (!hasProcessWithSteps) {
      const APPROVAL = /approv|review|sign[- ]?off|authori[sz]|reject|escalat|verif(y|ication)|validat/i;
      const talksApproval = [];
      for (const j of ir.journeys || []) {
        const txt = [j.name, j.goal, j.description, ...(j.steps || []).map((x) => (typeof x === "string" ? x : x?.name || ""))].join(" ");
        if (APPROVAL.test(txt)) talksApproval.push(`journey '${j.name || "?"}'`);
      }
      for (const f of flows) {
        const txt = [f.name, f.description, ...(f.statuses || []).map((x) => x?.name || x)].join(" ");
        if (APPROVAL.test(txt)) talksApproval.push(`flow '${f.name || f.id}'`);
      }
      for (const pmt of ir.permissions || []) if (APPROVAL.test(String(pmt.intent || ""))) talksApproval.push(`permission intent for '${pmt.role}'`);
      if (talksApproval.length) {
        err("WORKFLOW_MISSED",
          `the domain talks about approvals (${[...new Set(talksApproval)].slice(0, 4).join(", ")}) but no flow is a Process with steps — ` +
          `work that moves BETWEEN ROLES must be a Process; a Case only tracks statuses someone sets on their own record`,
          "workflow");
      }
    }
  }

  const formIds = new Set((ir.forms || []).map((f) => f.id || f.name));
  const listIds = new Set((ir.lists || ir.datasets || []).map((l) => l.id || l.name));

  // field-map verification helpers (used by automations): resolve a flow by id OR name, and get its
  // declared field-name set (incl. child-table columns). Returns null when the flow is unknown or
  // declares no fields — in which case we can't verify and skip (no false positives).
  const norm = (s) => String(s ?? "").replace(/[^a-z0-9]+/gi, "").toLowerCase();
  const SYS_FIELDS = new Set(["name", "id", "id_", "createdat", "createdby", "modifiedat", "modifiedby", "status", "currentstep", "flowname"].map(norm));
  const flowFieldSet = (flowRef) => {
    const f = (ir.forms || []).find((x) => (x.id || x.name) === flowRef || x.name === flowRef || x.id === flowRef);
    if (!f) return null;
    const names = [];
    for (const fl of f.fields || []) { if (fl.name) names.push(fl.name); if (fl.id) names.push(fl.id); }
    for (const ct of f.child_tables || []) for (const fl of ct.fields || []) if (fl.name) names.push(fl.name);
    return names.length ? new Set(names.map(norm)) : null;
  };
  // a source value is a plain field ref only if it's not a quoted literal and not a computed expression
  const isBareField = (v) => {
    const s = String(v ?? "").trim();
    if (!s) return false;
    if (/^['"]/.test(s)) return false;                                   // 'literal'
    if (/[-+*/()]|,/.test(s)) return false;                              // arithmetic / call args
    if (/\b(SUM|AVG|COUNT|MIN|MAX|UNIQUE_COUNT|IF|CONCAT|CONCATENATE|ROUND|DATEDIFF|TODAY|NOW)\s*\(/i.test(s)) return false; // function
    if (s.includes(".")) return false;                                   // Flow.Field cross-ref
    return true;
  };
  const roleNames = new Set((ir.roles || []).map((r) => r.name));
  const personaIds = new Set((ir.personas || []).map((p) => p.id || p.name));

  // forms + fields
  for (const f of ir.forms || []) {
    const w = `form:${f.name}`;
    if (!f.name) err("FORM_NO_NAME", "form missing name", w);
    if (!Array.isArray(f.fields) || !f.fields.length) warn("FORM_NO_FIELDS", "form has no fields", w);

    // ── Three cheap structural checks the adversarial verifier had to find by hand (personal-banking,
    // 2026-08-02). All three passed a clean `gate` twice, which is exactly why they belong here.

    // Field ids are slugged, so two differently-spelled names can collide into ONE column: the later
    // definition silently replaces the earlier and the model lists the id twice.
    const bySlug = new Map();
    for (const fld of f.fields || []) {
      if (!fld.name) continue;
      const id = fld.id || slugId(fld.name);
      if (bySlug.has(id) && bySlug.get(id) !== fld.name)
        err("FIELD_ID_COLLISION", `fields '${bySlug.get(id)}' and '${fld.name}' both slug to id '${id}' — one silently replaces the other on the model`, w);
      else if (bySlug.has(id))
        err("FIELD_DUPLICATE", `field '${fld.name}' is declared twice`, w);
      bySlug.set(id, fld.name);
    }

    // A step's field_permissions keys resolve against fields AND sections, and the section branch
    // wins and CASCADES to every field inside it. A section sharing a field's name therefore applies
    // that level to unrelated fields — silently forcing gate inputs Mandatory for the initiator.
    // Sharing the name is harmless UNTIL a step keys a permission on it — only then does the section
    // branch win and cascade. Flagging the mere collision fires on valid IRs (a golden reference does
    // exactly this), so the check is on actual use.
    const sectionNames = new Set((f.fields || []).map((x) => x.section).filter(Boolean));
    const permKeys = new Set((f.workflow?.steps || []).flatMap((s) => Object.keys(s.field_permissions || {})));
    for (const fld of f.fields || [])
      if (fld.name && sectionNames.has(fld.name) && permKeys.has(fld.name))
        err("PERM_KEY_AMBIGUOUS", `step permission keyed on '${fld.name}', which is BOTH a field and a section on this flow — the section wins and the level cascades to every field inside it, not just this one`, w);

    for (const fld of f.fields || []) {
      // Width is packed into a 6-wide grid as an INTEGER. A string ("half", "full") is never
      // converted: it is concatenated into the column Start/End and the whole section collapses.
      if (fld.width !== undefined && (typeof fld.width !== "number" || !Number.isInteger(fld.width) || fld.width < 1 || fld.width > 6))
        err("FIELD_WIDTH_NOT_NUMERIC", `field '${fld.name}' has width ${JSON.stringify(fld.width)} — must be an integer 1-6 (6 = full row)`, w);

      // A formula's nodes are ALL typed from the TARGET field. Put a numeric comparison against a
      // literal on a Text target and it compiles as a STRING compare: "9000" > "25000" is true and
      // "100000" > "25000" is false. On an approval gate that is under-approval on the largest
      // amounts — introduced by a fix that was closing the opposite bug (personal-banking D1a,
      // 2026-08-02). Keep numeric comparisons on a Number/Currency target and compare the result.
      if (fld.formula && !/^(number|currency|decimal|integer)$/i.test(fld.type || "")) {
        const numericCompare = /[<>]=?\s*-?\d|(?:-?\d+(?:\.\d+)?)\s*[<>]=?/.exec(String(fld.formula));
        if (numericCompare)
          err("FORMULA_LITERAL_TYPE",
            `field '${fld.name}' is ${fld.type || "Text"} but its formula compares a numeric literal (…${numericCompare[0].trim()}…) — every node is typed from the target field, so this compiles as a STRING comparison and orders values lexicographically. Compute the comparison on a Number/Currency field and test its result here.`,
            w);
      }
      if (!fld.name) err("FIELD_NO_NAME", "field missing name", w);
      if (!fld.type) err("FIELD_NO_TYPE", `field '${fld.name}' missing type`, w);
      else if (!canonicalFieldType(fld.type))
        warn("FIELD_TYPE_UNKNOWN", `field '${fld.name}' has unknown type '${fld.type}' — publish will likely 500; use a canonical Kissflow type`, w);
      if (REF_FIELD_TYPES.has(fld.type)) {
        if (!fld.ref) err("REF_NO_TARGET", `reference field '${fld.name}' has no ref (target model)`, w);
        else if (!formIds.has(fld.ref) && !listIds.has(fld.ref)) err("REF_TARGET_MISSING", `reference field '${fld.name}' → '${fld.ref}' is not a known form/list`, w);
      }
      // A Select-family field MUST resolve to a list that exists and has items. Publishing one with
      // no ReferredList does not fail — Kissflow quietly creates an EMPTY list named
      // `<App>_<Field>_A00` and binds the field to it. Nothing errors, the app goes Live, and the
      // field can never be set by anyone: every write is dropped and every submit fails
      // "Value is required". A required Select makes the whole flow unusable, which is exactly what
      // happened to Work Order.Priority on the facilities run (2026-08-02) — 7 seeded work orders
      // stuck as invisible drafts. Blocking, not a warning.
      if (SELECT_FIELD_TYPES.has(fld.type)) {
        const list = fld.referredList || fld.list;
        // A Select that carries its OWN option set needs no list — buildForm mints the backing list
        // from those options (hasOwnOptions), which is the case this rule exists to guarantee. Only a
        // Select with neither is the unsettable field described below.
        const ownOptions = Array.isArray(fld.options || fld.possibleValues || fld.PossibleValues)
          && (fld.options || fld.possibleValues || fld.PossibleValues).length > 0;
        if (!list && ownOptions) { /* self-describing — nothing to bind */ }
        else if (!list)
          err("SELECT_NO_LIST", `select field '${fld.name}' names no list — Kissflow will bind it to an auto-created EMPTY list and the field becomes permanently unsettable (give it 'referredList': "<list name>")`, w);
        else if (!listIds.has(list))
          err("SELECT_LIST_MISSING", `select field '${fld.name}' → list '${list}' is not defined in lists[] — the field will bind to an empty auto-created list and can never be set`, w);
      }
    }
    // workflow steps: names present, actors are known roles, field_permissions resolve
    const PERM_LEVELS = new Set(["Editable", "ReadOnly", "Hidden", "Mandatory"]);
    if (f.workflow?.steps) {
      // valid override keys: top-level field names/ids + child-table names (a table is one
      // permission column) + SECTION names (a section override cascades to its member fields)
      const permKeys = new Set();
      for (const fl of f.fields || []) { if (fl.name) permKeys.add(norm(fl.name)); if (fl.id) permKeys.add(norm(fl.id)); if (fl.section) permKeys.add(norm(fl.section)); }
      for (const ct of f.child_tables || []) if (ct.name) permKeys.add(norm(ct.name));
      if (f.section) permKeys.add(norm(f.section));
      if ((f.fields || []).some((fl) => !fl.section) && !f.section) permKeys.add(norm("Details")); // default section
      f.workflow.steps.forEach((s, i) => {
        const sw = `${w} step:${s.name || i}`;
        if (!s.name) err("STEP_NO_NAME", `workflow step ${i} missing name`, w);
        if (s.actor && roleNames.size && !roleNames.has(s.actor)) warn("STEP_ACTOR_MISSING", `step '${s.name}' actor '${s.actor}' is not a defined role (assignee will be skipped)`, sw);
        for (const [k, v] of Object.entries(s.field_permissions || {})) {
          if (!PERM_LEVELS.has(v)) err("STEP_PERM_LEVEL_BAD", `field_permissions['${k}'] = '${v}' (must be Editable|ReadOnly|Hidden|Mandatory)`, sw);
          if (permKeys.size && !permKeys.has(norm(k)) && !SYS_FIELDS.has(norm(k))) err("STEP_PERM_FIELD_MISSING", `field_permissions key '${k}' is not a field, section or child table on this flow`, sw);
        }
        // parallel branches (LESSONS §12): middle steps only; ≥2 arms; each arm ≥1 step with known actors
        if (s.branches !== undefined) {
          if (i === 0 || i === f.workflow.steps.length - 1)
            err("STEP_BRANCHES_TERMINAL", `step '${s.name}' has branches but is the ${i === 0 ? "start" : "end"} step — parallel forks are middle steps only`, sw);
          if (!Array.isArray(s.branches) || s.branches.length < 2)
            err("STEP_BRANCHES_TOO_FEW", `step '${s.name}' needs ≥2 branches to fork`, sw);
          for (const br of Array.isArray(s.branches) ? s.branches : []) {
            const bSteps = br.steps || [br];
            if (!bSteps.length || bSteps.some((b) => !b.name)) err("BRANCH_STEP_NO_NAME", `branch '${br.name || "?"}' of '${s.name}' has an unnamed step`, sw);
            for (const b of bSteps) if (b.actor && roleNames.size && !roleNames.has(b.actor))
              warn("STEP_ACTOR_MISSING", `branch step '${b.name}' actor '${b.actor}' is not a defined role (assignee will be skipped)`, sw);
          }
        }
        // A FORK WRITTEN AS PROSE IS NOT A FORK. "Review (parallel) — Budget Approval + Sourcing
        // Check" is one step whose NAME claims two things happen at once. Nothing downstream can act
        // on a claim in a name: the blueprint draws one box in a straight line, and builders.mjs
        // compiles one sequential activity instead of a NodeType:"Parallel" with an arm each. The
        // reviewer signs off a workflow that does not do what its own step title says.
        if (s.branches === undefined && /\(\s*(?:parallel|concurrent|in parallel)\s*\)/i.test(String(s.name || ""))) {
          err("STEP_PARALLEL_IN_NAME",
            `step '${s.name}' calls itself parallel in its NAME but has no branches[] — write the arms as ` +
            `branches:[{name,steps:[…]}] so the fork is built and drawn; a name is not a structure`, sw);
        }
        // step condition (skip-unless formula, LESSONS §11): middle steps only; field tokens must resolve
        if (s.condition) {
          if (i === 0 || i === f.workflow.steps.length - 1)
            err("STEP_CONDITION_TERMINAL", `step '${s.name}' has a condition but is the ${i === 0 ? "start" : "end"} step — conditions apply to middle steps only`, sw);
          const FN = /^(IF|AND|OR|NOT|TRUE|FALSE|CONCATENATE|ROUND|DATEDIFF|SUM|COUNT|TODAY|NOW)$/i;
          // Strip QUOTED LITERALS before tokenising. `Approval_Required = "Yes"` is correct syntax,
          // but the raw tokenizer read `Yes` as a field name and warned that a perfectly good gate
          // "would build UNCONDITIONAL" — on every equality-to-literal condition there is. A warning
          // that always fires on correct input is worse than no warning, because it is the same
          // message that flags the real defect (personal-banking run, 2026-08-02).
          const conditionSrc = String(s.condition).replace(/"[^"]*"|'[^']*'/g, " ");
          for (const t of conditionSrc.match(/[A-Za-z_][A-Za-z0-9_.]*/g) || [])
            if (!FN.test(t) && permKeys.size && !permKeys.has(norm(t)) && !SYS_FIELDS.has(norm(t)))
              warn("STEP_CONDITION_FIELD_MISSING", `condition token '${t}' on step '${s.name}' doesn't match a field on this flow — the step would build UNCONDITIONAL`, sw);
        }
      });
    }
  }

  // pages reference roles
  for (const p of ir.pages || []) {
    if (p.role && !roleNames.has(p.role)) warn("PAGE_ROLE_MISSING", `page '${p.name}' role '${p.role}' not defined`, `page:${p.name}`);
  }
  // permissions reference roles + models
  for (const perm of ir.permissions || []) {
    if (!roleNames.has(perm.role)) err("PERM_ROLE_MISSING", `permission role '${perm.role}' not defined`, "permissions");
    if (perm.model && !formIds.has(perm.model) && !listIds.has(perm.model)) err("PERM_MODEL_MISSING", `permission model '${perm.model}' not defined`, "permissions"); // a permission may target a reference LIST too
  }
  // journeys reference personas
  for (const j of ir.journeys || []) {
    if (j.persona && !personaIds.has(j.persona)) warn("JOURNEY_PERSONA_MISSING", `journey '${j.id || j.story}' persona '${j.persona}' not defined`, "journeys");
  }
  // automations (flow-stitches): source + target flows must exist; internal channel is emittable
  for (const a of ir.automations || []) {
    const where = `automation '${a.id || a.name}'`;
    if (!a.source?.flow || !formIds.has(a.source.flow)) err("AUTO_SOURCE_MISSING", `${where} source flow '${a.source?.flow}' not defined`, "automations");
    if (!a.action?.target_flow || !formIds.has(a.action.target_flow)) err("AUTO_TARGET_MISSING", `${where} target flow '${a.action?.target_flow}' not defined`, "automations");
    if (a.action && !["create", "update", "notify"].includes(a.action.type)) err("AUTO_TYPE_BAD", `${where} action.type must be create|update|notify`, "automations");
    if (a.source?.flow && a.action?.target_flow && a.source.flow === a.action.target_flow) warn("AUTO_SELF", `${where} stitches a flow to itself`, "automations");
    // field_map: keys are TARGET fields (must exist on target flow); values are SOURCE fields
    // (must exist on source flow) unless a literal or computed expression.
    const fm = a.action?.field_map;
    if (fm && typeof fm === "object") {
      const tgt = flowFieldSet(a.action.target_flow), src = flowFieldSet(a.source?.flow);
      for (const [k, v] of Object.entries(fm)) {
        if (tgt && !tgt.has(norm(k)) && !SYS_FIELDS.has(norm(k)))
          err("AUTO_MAP_TARGET_FIELD", `${where}: target field '${k}' not on flow '${a.action.target_flow}'`, "automations");
        if (src && isBareField(v) && !src.has(norm(v)) && !SYS_FIELDS.has(norm(v)))
          warn("AUTO_MAP_SOURCE_FIELD", `${where}: source field '${v}' not on flow '${a.source?.flow}' (mapped → '${k}')`, "automations");
      }
    }
  }

  return { ok: !issues.some((i) => i.level === "error"), issues };
}

/**
 * Coherence: does the app SOLVE the problem per persona? Light checks that the
 * journeys/personas map to artifacts (every persona has a page; every journey's flow exists).
 */
export function checkCoherenceIR(ir) {
  const issues = [];
  const pagesByRole = new Set((ir.pages || []).map((p) => p.role).filter(Boolean));
  for (const p of ir.personas || []) {
    // a persona usually maps to a role of the same/closely-related name
    if (ir.roles?.length && ir.pages?.length && ![...pagesByRole].some((r) => r && (r === p.name || r === p.id))) {
      issues.push({ level: "warn", code: "PERSONA_NO_LANDING", msg: `persona '${p.name}' has no role-landing page (dashboard)`, where: "coherence" });
    }
  }
  if ((ir.forms || []).length && !(ir.roles || []).length) issues.push({ level: "warn", code: "NO_ROLES", msg: "app has data but no roles — who uses it?", where: "coherence" });
  if ((ir.forms || []).length && !(ir.pages || []).length) issues.push({ level: "warn", code: "NO_PAGES", msg: "app has data but no pages — nothing is surfaced to users (build auto-adds a baseline; design richer pages with kf-experience-designer)", where: "coherence" });
  if ((ir.pages || []).length && !((ir.nav?.menus || []).length)) issues.push({ level: "warn", code: "NO_NAV", msg: "app has pages but no navigation — users can't reach them (build auto-adds a baseline)", where: "coherence" });
  for (const r of (ir.roles || [])) {
    const rn = r.name || r;
    if ((ir.pages || []).length && ![...pagesByRole].includes(rn)) issues.push({ level: "warn", code: "ROLE_NO_LANDING", msg: `role '${rn}' has no landing page`, where: "coherence" });
  }
  return issues;
}

// checkGateIR — the STRUCTURAL checks the AI verifier/coherence-critic used to reason out by hand, now
// deterministic so the hybrid gate can run them every step at ~ms (the AI gate is demoted to the SEMANTIC
// + novelty pass — relevance/meaningfulness, which code cannot judge). Ratchet: when the AI gate finds a
// NEW structural failure class, add a check here so future runs catch it for free.
// Operates on the app-spec IR shape: roles[{id,name}], permissions[{role,model,level,scope}],
// nav.menus[].submenus[{page,visibleTo[]}], pages[{name,landing}], forms[{id,name}].
/**
 * THE APP FLOOR — is this an application, or a set of forms with a login?
 *
 * Deliberately its OWN pass, not part of validateIR or checkGateIR. Those two answer "is this
 * structurally valid" and their fixtures are minimal on purpose — a test for parallel branches has no
 * business carrying two automations. This asks a different question, of a whole app, and mixing it in
 * made six unrelated unit tests fail for a reason none of them was about.
 *
 * Called by `gate` and by `apply`. Apply matters most: the pipeline floors added earlier are enforced
 * by `engine apply --quick`, so anything reaching apply another way — a different mode flag, --force,
 * a conductor that never called the guard — walked straight past them, which is exactly what kept
 * happening.
 */
export function checkAppFloor(ir) {
  const issues = [];
  const err = (code, msg, where = "app") => issues.push({ level: "error", code, msg, where });
  if (!ir || typeof ir !== "object") return issues;
  // ── THE APP FLOOR: workflow · business logic · automations ────────────────────────────────────
  // An app that only stores and lists records is a spreadsheet with a login. These three are what
  // make it an application, and all three kept going missing — most recently on an express run that
  // shipped forms and nothing else (2026-08-03).
  //
  // This lives in validateIR, NOT in the pipeline stage list, because that is the only place every
  // path passes through. The pipeline floors added earlier are enforced by `engine apply --quick`,
  // so anything that reaches apply by another route — a different mode flag, --force, a conductor
  // that never called the guard — walked straight past them. `validateIR` runs inside gate, verify,
  // build AND apply, so there is no path left that skips it.
  {
    const flows = ir.forms || [];
    const steps = (f) => f.workflow?.steps || f.steps || [];
    const procs = flows.filter((f) => /^process$/i.test(f.flowType || "") && steps(f).length >= 2);
    const cases = flows.filter((f) => /^(case|board)$/i.test(f.flowType || "") && (f.statuses || []).length >= 2);
    if (!procs.length && !cases.length)
      err("NO_WORKFLOW",
        "no workflow anywhere — not one Process with steps, not one Case with statuses. Work that never moves between people or states is a set of forms, not an app. Model the journey the domain actually describes.",
        "workflow");

    // BUSINESS LOGIC = what the app COMPUTES or DECIDES, as opposed to what it merely stores:
    // a formula, an aggregate, a step that runs only under a condition, a per-step field rule.
    let logic = 0;
    const countFields = (fields) => { for (const fld of fields || []) if (fld.formula || fld.computed || fld.aggregate) logic++; };
    for (const f of flows) {
      countFields(f.fields);
      for (const c of f.child_tables || []) countFields(c.fields);
      for (const s of steps(f)) {
        if (s.condition) logic++;
        if (s.field_permissions && Object.keys(s.field_permissions).length) logic++;
      }
    }
    if (!logic)
      err("NO_BUSINESS_LOGIC",
        "the app computes and decides nothing — no formula, no aggregate, no conditional step, no per-step field rule. Every number is typed in by hand and every step runs every time. Whatever the domain says is derived (a total, a balance, a threshold that changes who approves) belongs here.",
        "business-logic");

    const autos = (ir.automations || []).length;
    if (autos < 2)
      err("AUTOMATIONS_MISSING",
        `only ${autos} automation${autos === 1 ? "" : "s"} — at least 2 are required, and a notification counts. Two are available in any real domain: the deadline nobody is watching, and the handoff nobody is told about. An app where nothing fires on its own is one where every handoff waits for someone to notice.`,
        "automations");
  }
  return issues;
}

export function checkGateIR(ir) {
  const issues = [];
  const err = (code, msg, where = "gate") => issues.push({ level: "error", code, msg, where });
  const warn = (code, msg, where = "gate") => issues.push({ level: "warn", code, msg, where });
  if (!ir || typeof ir !== "object") return issues;

  // identity match is case- AND separator-insensitive: nav often carries slugs ("super-admin") while
  // roles/permissions carry display names ("Super Admin") — same identity, don't false-flag. Uses the
  // SAME normalizer as validateIR (ir.mjs:45); a bare .toLowerCase() left "super-admin" ≠ "super admin".
  const norm = (s) => String(s ?? "").replace(/[^a-z0-9]+/gi, "").toLowerCase();

  // ── FORM_NO_UI ────────────────────────────────────────────────────────────────────────────────
  // A Mandatory Reference whose TARGET has no page card is an app that cannot be used on day one:
  // the picker is empty, the field is required, and the first person to open the form is stuck.
  // Nothing else catches it — the reference resolves, the permission exists, the gate is clean.
  // `ensureExperience` only auto-adds pages for PROCESS flows, so a referenced dataform stays
  // invisible. Hit twice on one spec: Approval_Policy, then Disputed_Transaction — the second time
  // inside the fix for the first (personal-banking, 2026-08-02).
  {
    const cardFlows = new Set();
    for (const p of ir.pages || []) for (const c of p.cards || []) if (c.source_flow) cardFlows.add(norm(c.source_flow));
    const byName = new Map((ir.forms || []).map((f) => [norm(f.id || f.name), f]));
    const seen = new Set();
    for (const f of ir.forms || []) {
      for (const fld of f.fields || []) {
        if (!fld.ref || !fld.required) continue;
        if (!byName.get(norm(fld.ref)) || cardFlows.has(norm(fld.ref)) || seen.has(norm(fld.ref))) continue;
        seen.add(norm(fld.ref));
        err("FORM_NO_UI",
          `'${f.name}.${fld.name}' is a MANDATORY reference to '${fld.ref}', but no page has a card on that flow — the picker will be empty and nobody can complete the form. Give it a page (and a way to create rows), or seed it before go-live.`,
          `${f.name}.${fld.name}`);
      }
    }

    // ── NAV_GRANT_ESCALATION ────────────────────────────────────────────────────────────────────
    // Applying a page GRANTS membership on every flow its cards reference — and the grant is driven
    // by `page.role` as well as nav `visibleTo`. So a role declared ReadOnly silently gains edit
    // (Forms: Member+Delete) or initiate rights (Processes: InitiateItems) simply by having a card.
    // On the banking spec that gave Compliance the ability to raise disputes and an RM to raise
    // service requests, both declared ReadOnly — a segregation-of-duties break in a bank app that
    // no permission review would catch, because the permission matrix says the opposite.
    const declared = new Map();
    for (const p of ir.permissions || []) declared.set(`${norm(p.role)}::${norm(p.model)}`, String(p.level || ""));
    const pageByName = new Map((ir.pages || []).map((p) => [norm(p.name), p]));
    const grantsFrom = []; // { role, flow, via }
    for (const p of ir.pages || []) if (p.role) for (const c of p.cards || []) if (c.source_flow) grantsFrom.push({ role: p.role, flow: c.source_flow, via: `page '${p.name}'` });
    for (const m of ir.nav?.menus || []) for (const sub of m.submenus || []) {
      const pg = pageByName.get(norm(sub.page));
      for (const r of sub.visibleTo || []) for (const c of pg?.cards || []) if (c.source_flow) grantsFrom.push({ role: r, flow: c.source_flow, via: `nav '${sub.name || sub.page}'` });
    }
    const flagged = new Set();
    for (const g of grantsFrom) {
      const key = `${norm(g.role)}::${norm(g.flow)}`;
      const lvl = declared.get(key);
      if (!lvl || !/^(view|readonly|read-only|none)$/i.test(lvl)) continue;
      const target = byName.get(norm(g.flow));
      const right = /^process$/i.test(target?.flowType || "") ? "InitiateItems (can raise new items)" : "Member+Delete (can edit and delete rows)";
      const sig = `${key}::${right}`;
      if (flagged.has(sig)) continue;
      flagged.add(sig);
      err("NAV_GRANT_ESCALATION",
        `'${g.role}' is declared ${lvl} on '${g.flow}', but ${g.via} carries a card on it — applying the page grants ${right}. The permission matrix and the built app will disagree.`,
        `${g.role}/${g.flow}`);
    }

    // ── PERM_INERT ──────────────────────────────────────────────────────────────────────────────
    // A permission whose model the role can never reach is a statement of intent with no effect. It
    // reads as access control in review and does nothing in the app — 11 of them in the banking spec.
    for (const p of ir.permissions || []) {
      if (!p.role || !p.model || /^none$/i.test(p.level || "")) continue;
      const reachable = grantsFrom.some((g) => norm(g.role) === norm(p.role) && norm(g.flow) === norm(p.model));
      const isActor = (ir.forms || []).some((f) => (f.workflow?.steps || []).some((s) => norm(s.actor) === norm(p.role) && norm(f.id || f.name) === norm(p.model)));
      if (!reachable && !isActor)
        warn("PERM_INERT",
          `'${p.role}' has ${p.level || "access"} on '${p.model}' but no page card and no workflow step reaches it — the permission has no effect in the built app`,
          `${p.role}/${p.model}`);
    }

    // ── CONFIG_LITERAL_DIVERGENCE ───────────────────────────────────────────────────────────────
    // A formula hardcodes a number that a config field also advertises, and the two disagree. The
    // config record is what a human reads and believes; the literal is what actually routes. The
    // banking spec shipped a policy record saying 5,000 while the gate routed on 25,000.
    const literals = new Set();
    for (const f of ir.forms || []) for (const fld of f.fields || [])
      for (const m of String(fld.formula || "").matchAll(/[<>]=?\s*(\d{3,})/g)) literals.add(Number(m[1]));
    if (literals.size) for (const f of ir.forms || []) for (const fld of f.fields || []) {
      const dflt = Number(fld.default);
      if (!Number.isFinite(dflt) || !/threshold|limit|amount/i.test(fld.name || "")) continue;
      if (!literals.has(dflt))
        warn("CONFIG_LITERAL_DIVERGENCE",
          `'${f.name}.${fld.name}' defaults to ${dflt}, but the routing formulas compare against ${[...literals].join(", ")} — the value people read is not the value that routes`,
          `${f.name}.${fld.name}`);
    }
  }
  const normRole = norm;
  const roleIdent = new Set();
  for (const r of ir.roles || []) { if (typeof r === "string") roleIdent.add(normRole(r)); else { if (r.name) roleIdent.add(normRole(r.name)); if (r.id) roleIdent.add(normRole(r.id)); } }
  const pageNames = new Set((ir.pages || []).map((p) => p.name).filter(Boolean).map(norm));
  // model identity = forms AND lists/datasets — a permission (or reference) can legitimately target a
  // reference LIST (roles need access to master data), so lists must count as known models or the gate
  // false-flags every list permission as PERM_UNKNOWN_MODEL.
  const modelIdent = new Set();
  for (const f of ir.forms || []) { if (f.id) modelIdent.add(norm(f.id)); if (f.name) modelIdent.add(norm(f.name)); }
  for (const l of ir.lists || ir.datasets || []) { if (l.id) modelIdent.add(norm(l.id)); if (l.name) modelIdent.add(norm(l.name)); }
  const submenus = (ir.nav?.menus || []).flatMap((m) => m.submenus || []);

  // 1. nav → page reachability: a nav link to a non-existent page is a dead end.
  for (const sm of submenus)
    if (sm.page && !pageNames.has(norm(sm.page))) err("NAV_DANGLING_PAGE", `nav item '${sm.name || sm.page}' points to page '${sm.page}' which does not exist`);

  // 2. orphan pages: a page no nav item surfaces is unreachable (landings excepted — reached by role switch).
  const navPages = new Set(submenus.map((s) => s.page).filter(Boolean).map(norm));
  for (const p of ir.pages || [])
    if (p.name && !navPages.has(norm(p.name)) && !p.landing) warn("ORPHAN_PAGE", `page '${p.name}' is not in any nav menu — users can't reach it`);

  // 3. nav visibility: an item nobody can see, and roles that can't reach any page.
  const rolesWithNav = new Set();
  for (const sm of submenus) {
    const vt = sm.visibleTo || [];
    if (!vt.length) warn("NAV_NO_AUDIENCE", `nav item '${sm.name || sm.page}' has empty visibleTo — nobody (or everybody) sees it`);
    for (const r of vt) { rolesWithNav.add(normRole(r)); if (!roleIdent.has(normRole(r))) warn("NAV_UNKNOWN_ROLE", `nav item '${sm.name || sm.page}' visibleTo unknown role '${r}'`); }
  }
  for (const r of ir.roles || []) { const rn = (typeof r === "string" ? r : (r.name || r.id)); if (submenus.length && rn && !rolesWithNav.has(normRole(rn)) && !rolesWithNav.has(normRole(typeof r === "string" ? r : r.id))) warn("ROLE_NO_REACHABLE_PAGE", `role '${rn}' is visibleTo no nav item — it has no landing/navigation`); }

  // 4. permission referential integrity: every permission's role + model must resolve.
  const perms = Array.isArray(ir.permissions) ? ir.permissions : Object.values(ir.permissions || {});
  for (const pm of perms) {
    if (pm.role && !roleIdent.has(normRole(pm.role))) err("PERM_UNKNOWN_ROLE", `permission references unknown role '${pm.role}' (model ${pm.model})`);
    if (pm.model && !modelIdent.has(norm(pm.model))) err("PERM_UNKNOWN_MODEL", `permission references unknown model '${pm.model}' (role ${pm.role})`);
  }

  // 5. role-access collapse: two roles with an identical permission signature are redundant (design smell).
  const sig = {};
  for (const pm of perms) if (pm.role) (sig[pm.role] = sig[pm.role] || []).push(`${pm.model}:${pm.level}:${pm.scope}`);
  const byFingerprint = {};
  for (const [role, list] of Object.entries(sig)) {
    const fp = list.sort().join("|");
    (byFingerprint[fp] = byFingerprint[fp] || []).push(role);
  }
  for (const group of Object.values(byFingerprint))
    if (group.length > 1) warn("ROLE_ACCESS_COLLAPSE", `roles ${group.join(", ")} have identical access — do they need to be distinct roles?`);

  // 6. a model no role can touch = an unreachable entity (dead data).
  const modelsWithPerm = new Set(perms.map((p) => p.model).filter(Boolean).map(norm));
  for (const f of ir.forms || [])
    if (f.id && !modelsWithPerm.has(norm(f.id)) && !modelsWithPerm.has(norm(f.name))) warn("MODEL_NO_PERMISSION", `model '${f.name || f.id}' has no permission for any role — nobody can access it`);

  return issues;
}

// validationGate — the VALIDATION ENGINE GATE (EDIT PATH ONLY). Deterministically diffs the DESIRED IR
// against the LIVE (imported) IR at the ITEM level and blocks changes OUTSIDE the intended scope — the
// guardrail the structural gates lack (they check "valid", this checks "minimal/scoped"). This is what
// stops a re-created IR from silently rewriting unrelated fields/flows/pages on publish. It requires a
// live baseline, so it runs ONLY for edits — a fresh CREATE (no live IR) skips it.
//   scope: array of id fragments the user intended to touch (form id, "form.field", role, page name…).
//          A change is in-scope if its id contains any scope fragment. No scope → nothing is blocked,
//          but the FULL changeset is still reported for the user/agent to confirm.
export function validationGate(live, desired, { scope = null } = {}) {
  const changes = [];
  const idx = (arr, keyFn) => { const m = {}; for (const x of arr || []) { const k = keyFn(x); if (k != null) m[k] = x; } return m; };
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const diffSet = (liveMap, desMap, kind, detail = (x) => x) => {
    for (const k of new Set([...Object.keys(liveMap), ...Object.keys(desMap)])) {
      if (!(k in liveMap)) changes.push({ kind, id: k, change: "added" });
      else if (!(k in desMap)) changes.push({ kind, id: k, change: "removed" });
      else if (!eq(detail(liveMap[k]), detail(desMap[k]))) changes.push({ kind, id: k, change: "modified" });
    }
  };
  // forms + field-level (the finest granularity — where drift usually hides)
  const lf = idx(live.forms, (f) => f.id || f.name), df = idx(desired.forms, (f) => f.id || f.name);
  for (const id of new Set([...Object.keys(lf), ...Object.keys(df)])) {
    if (!lf[id]) { changes.push({ kind: "form", id, change: "added" }); continue; }
    if (!df[id]) { changes.push({ kind: "form", id, change: "removed" }); continue; }
    const lfld = idx(lf[id].fields, (x) => x.id || x.name), dfld = idx(df[id].fields, (x) => x.id || x.name);
    const before = changes.length;
    diffSet(lfld, dfld, "field", (x) => x); // field ids reported bare; prefix ONLY the ones just added
    // prefix exactly this form's newly-added field changes — NOT via a `.includes(".")` guard, which
    // also skipped legitimate field names that themselves contain a dot ("Est. Cost"), leaving them
    // bare so scope-matching by form id failed and blocked an in-scope edit.
    for (let i = before; i < changes.length; i++) if (changes[i].kind === "field") changes[i].id = `${id}.${changes[i].id}`;
    if (!eq(lf[id].workflow, df[id].workflow)) changes.push({ kind: "workflow", id, change: "modified" });
    if (lf[id].flowType !== df[id].flowType) changes.push({ kind: "flowType", id, change: "modified" });
  }
  diffSet(idx(live.lists, (l) => l.id || l.name), idx(desired.lists, (l) => l.id || l.name), "list");
  diffSet(idx(live.permissions, (p) => `${p.role}|${p.model}`), idx(desired.permissions, (p) => `${p.role}|${p.model}`), "permission");
  diffSet(idx(live.pages, (p) => p.name || p.id), idx(desired.pages, (p) => p.name || p.id), "page");
  diffSet(idx(live.roles, (r) => r.id || r.name || r), idx(desired.roles, (r) => r.id || r.name || r), "role");
  if (!eq(live.nav, desired.nav)) changes.push({ kind: "nav", id: "nav", change: "modified" });
  if (!eq(live.app, desired.app)) changes.push({ kind: "app", id: "app", change: "modified" });

  // scope match is BOUNDARY-AWARE: a fragment "Order" matches the form "Order" and its fields
  // "Order.<field>" — but NOT "OrderArchive". A substring `includes` let "orderarchive" match scope
  // "order", so an unrelated form's rewrite passed the guardrail (the gate failing OPEN — its worst
  // direction). Case- and separator-insensitive, but the "." field boundary is preserved.
  const nscope = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9.]+/g, "");
  const inScope = (c) => {
    if (!scope || !scope.length) return true;
    const cid = nscope(c.id);
    return scope.some((s) => { const ss = nscope(s); return !!ss && (cid === ss || cid.startsWith(ss + ".")); });
  };
  const outOfScope = scope && scope.length ? changes.filter((c) => !inScope(c)) : [];
  return { changes, outOfScope, pass: outOfScope.length === 0, scoped: !!(scope && scope.length) };
}
