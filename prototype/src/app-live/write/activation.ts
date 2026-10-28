// Load-time side effect (DESIGN §4, §6): the store runs it after a successful load, on its serial chain, and reloads
// once when something was created. Owner C. It runs only when the reads it decides from answered on this load
// (load.ts effectBlocked: a refused read looks like "nothing there"), and it takes the audit rows as read (`facts`).
// - ensureRmes (acting SAF / REG): the department's RMES row of a case whose review task it holds, with the criteria
//   the domain would have created (planRmesCriteria); not when the history already names the record, and not while the
//   case can't be read (criteria planned from the header alone would be permanent): a Diagnostics note instead.
// The reviews and the final-release request are no longer the app's (22 Oct, load-time redesign): I-2 starts the
// round-1 reviews with one case-level review.started row (E-A, before its Approve), and E-B sends the release request
// with its release.requested row once every review of the case is completed.
// It is attempted at most once per item per session (a failure is reported, never retried in a loop): the attempts
// are remembered per client, i.e. per signed-in session. A result's message is dev's toast and the Writes log line (item
// ids, raw causes); its `tally` is what production's one toast per effect says (userText.ts effectToasts).
import { DEPT_SHORT } from "@/domain/catalog";
import * as A from "@/domain/actions";
import type { AppState, CiqCase, RmesCriterion } from "@/domain/types";
import { str } from "@/portal/data/raw";
import { errorText, type KfData } from "@/portal/kf/sdk";
import { LIST } from "../ids";
import type { EffectResult, LoadFacts } from "../load";
import type { AppClient, WriteCtx } from "../types";
import { trimEnd } from "../userText";
import { recordAudit, work, type Work } from "./audit";
import { childRowId, compact, criterionRow, rmesFlowOf, rmesTables } from "./encode";
import { caseRefOf, heldReview } from "./guards";
import { lostRows, missingOf, rowsMissing, settle, writeVerified } from "./verify";

const attempted = new WeakMap<AppClient, Set<string>>();
const triedOf = (client: AppClient): Set<string> => {
  let s = attempted.get(client);
  if (!s) attempted.set(client, (s = new Set()));
  return s;
};

/**
 * The RMES criteria the domain would create for the case (DESIGN §6 [decision]): `confirmCompleteness` run as
 * "system" (G-4) on a synthetic copy of the case back in Part 1 (no reviews, no RMES record, no requested documents,
 * not live-scope, every mandatory section optional so no answer blocks it, the K5.1 waiver justified). The scope's
 * non-"na" set is unchanged, so the activated departments and the conditional criteria are the real ones. This reuses
 * the unexported rmesCriteria (domain/actions.ts:584) without copying it.
 */
export function planRmesCriteria(state: AppState, caseId: string, at: string): { criteria: RmesCriterion[] } | { error: string } {
  const c = state.cases.find((x) => x.id === caseId);
  if (!c) return { error: "This case is no longer loaded." };
  const synthetic: CiqCase = {
    ...c,
    phase: "supplier-input",
    reviews: [],
    rmes: undefined,
    requestedDocs: undefined,
    liveScope: false,
    cancelled: undefined,
    // the criteria carry source version reviewVersion + 1, as at the first completeness confirmation
    reviewVersion: 0,
    confirmations: c.confirmations.filter((k) => k.type !== "completeness"),
    scope: c.scope.map((x) => (x.applicability === "mandatory" ? { ...x, applicability: "optional" } : x)),
    justifications: { ...c.justifications, "FLD-5.1-002": c.justifications["FLD-5.1-002"] || "—" },
  };
  const s = { ...state, cases: state.cases.map((x) => (x.id === caseId ? synthetic : x)), toasts: [] };
  const next = A.confirmCompleteness(s, "system", caseId, at);
  if (A.wasRefused(s, next)) return { error: next.toasts.at(-1)?.text ?? "the domain refused" };
  const rmes = next.cases.find((x) => x.id === caseId)?.rmes;
  if (!rmes) return { error: "Neither Safety nor Regulatory reviews this case, so it has no RMES record." };
  return { criteria: rmes.criteria };
}

/** The result of a load-time job: null when nothing was attempted; a note (nothing written) when only `notes`.
 *  `tally`: what it started and what failed, as production says it (the departments, "sent", "created"). */
function result(w: Work, created: string[], failed: string[], notes: string[] = [], verb = "Started", tally: { done: string[]; failed: string[] } = { done: [], failed: [] }): EffectResult | null {
  if (!created.length && !failed.length && !w.warnings.length) return notes.length ? { ok: true, note: true, tone: "info", message: notes.join(" "), handoffs: [], warnings: [] } : null;
  return {
    ok: !failed.length,
    message: [created.length ? `${verb} in Kissflow: ${created.join("; ")}.` : "", failed.length ? `Not ${verb.toLowerCase()}: ${failed.join("; ")}.` : ""].filter(Boolean).join(" "),
    tone: failed.length ? "warning" : "info",
    handoffs: w.handoffs,
    warnings: [...w.warnings, ...notes],
    tally,
  };
}

/** A cause inside a list item, without its own full stop (A15: "…has no RMES record.."). */
const causeText = (e: unknown) => trimEnd(errorText(e));

// ---------------------------------------------------------------------------------- RMES

/** The note of an RMES record that waits for the case to be readable (M1). */
export const RMES_WAITS = (caseId: string, dept: "SAF" | "REG") =>
  `${caseId}: the ${DEPT_SHORT[dept]} RMES record was not created yet, because your role can't read the case's questionnaire and criteria that depend on the supplier's answers would be missing for good. It is created once the case can be read.`;

/** SAF / REG: creates the own RMES row of every case whose review task this user holds. Null when nothing to do. */
export async function ensureRmes(ctx: WriteCtx, state: AppState, facts: LoadFacts): Promise<EffectResult | null> {
  const dept = ctx.acting.dept;
  if (!ctx.containerOk || (dept !== "SAF" && dept !== "REG")) return null;
  const tried = triedOf(ctx.client);
  const w = work();
  const created: string[] = [];
  const failed: string[] = [];
  const notes: string[] = [];
  const flow = rmesFlowOf(dept);
  const model = rmesTables(dept).criteria;
  for (const c of state.cases) {
    if (c.phase !== "review" || !heldReview(ctx, c.id, dept) || ctx.index.rmes.has(`${c.id}|${dept}`)) continue;
    const ref = caseRefOf(ctx, c.id);
    if (!ref) continue;
    const rmesKey = `${c.id}-RMES-${dept}`;
    // M1: the history names the record, so it exists although this load did not list it
    if (facts.audit.some((r) => str(r, "Object_Kind") === "RMES record" && str(r, "Object_Key") === rmesKey)) continue;
    // M1: criteria planned from the header alone would stay incomplete for good: wait until the case can be read
    if (!ref.readable) {
      notes.push(RMES_WAITS(c.id, dept));
      continue;
    }
    if (tried.has(`${ref.itemId}|rmes|${dept}`)) continue;
    tried.add(`${ref.itemId}|rmes|${dept}`);
    const plan = planRmesCriteria(state, c.id, ctx.now());
    if ("error" in plan) {
      failed.push(`${c.id}: the RMES criteria could not be prepared: ${trimEnd(plan.error)}`);
      continue;
    }
    const criteria = plan.criteria.filter((x) => x.dept === dept);
    try {
      const rows: KfData[] = criteria.map((cr) => ({ _is_created: true, _id: childRowId(model), ...criterionRow(cr, ctx) }));
      // no Result_Case: a Reference to the case may be refused when the reviewer can't read it; Case_Item_Id joins
      const header = compact({
        RMES_Key: rmesKey,
        Case_Item_Id: ref.itemId,
        Case_Code: c.id,
        Cycle_No: ref.cycleNo,
        Open_Criteria_Count: criteria.filter((x) => !x.result).length,
        Open_Blocking_Findings_Count: 0,
        RMES_Voided: LIST.no,
      });
      const id = await ctx.client.formCreate(flow, { ...header, [`Table::${model}`]: rows });
      // a criterion row lost by Kissflow is added again (a new row, as it is missing); present rows are never re-sent.
      // Kissflow may show a new item's child rows late (20 Oct, a new supplier's contact: the first read-back showed
      // none, and the row sent again at once was a duplicate): wait and read again first, as formCreated does; only rows
      // still missing then go again
      await writeVerified(
        () => ctx.client.formGet(flow, id),
        async (first) => {
          const cur = lostRows(first, model, "Criteria_Code", rows).length ? await ctx.client.formGet(flow, await settle(id)) : first;
          const lost = lostRows(cur, model, "Criteria_Code", rows);
          const again: KfData = { ...Object.fromEntries(missingOf(header, cur).map((k) => [k, header[k]])), ...(lost.length ? { [`Table::${model}`]: lost } : {}) };
          if (Object.keys(again).length) await ctx.client.formUpdate(flow, id, again);
        },
        (back) => [...missingOf(header, back), ...rowsMissing(back, model, "Criteria_Code", rows.map(({ _is_created: _c, _id: _i, ...r }) => r))],
      );
      created.push(`${c.id} ${DEPT_SHORT[dept]} RMES record (${criteria.length} criteria)`);
      await recordAudit(
        ctx,
        w,
        {
          code: "rmes.saved",
          caseId: c.id,
          object: { kind: "RMES record", key: rmesKey, itemId: id, state: "Created" },
          ref: { flow, itemId: id },
          entries: [{ id: "", at: ctx.now(), by: "system", action: "Created RMES record", detail: `${DEPT_SHORT[dept]} RMES record created with ${criteria.length} criteria: ${criteria.map((x) => x.id).join(", ")}.` }],
          snapshot: { rmes: { dept } },
        },
        `${c.id}: the ${DEPT_SHORT[dept]} RMES record`,
        [],
      );
    } catch (e) {
      failed.push(`${c.id} ${DEPT_SHORT[dept]} RMES record (${causeText(e)})`);
    }
  }
  return result(w, created, failed, notes, "Started", { done: created.length ? ["created"] : [], failed: failed.length ? ["failed"] : [] });
}
