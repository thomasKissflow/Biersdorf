// Load-time side effect (DESIGN §4, §6): the store runs it after a successful load, on its serial chain, and reloads
// once when something was created. Owner C. It runs only when the reads it decides from answered on this load
// (load.ts effectBlocked: a refused read looks like "nothing there"), and it takes the audit rows as read (`facts`).
// - ensureRmes (acting SAF / REG): the department's RMES row of a case whose review task it holds, header only (28 Oct:
//   the RMES is a read-only sheet derived from the case, domain/rmesSheet.ts; the row is the REQ-PROC-021 record of
//   the case id and time); not when the history already names the record. It needs nothing of the case's answers, so
//   it is also created for a case the role can't read in full.
// The reviews and the final-release request are no longer the app's (22 Oct, load-time redesign): I-2 starts the
// round-1 reviews with one case-level review.started row (E-A, before its Approve), and E-B sends the release request
// with its release.requested row once every review of the case is completed.
// It is attempted at most once per item per session (a failure is reported, never retried in a loop): the attempts
// are remembered per client, i.e. per signed-in session. A result's message is dev's toast and the Writes log line (item
// ids, raw causes); its `tally` is what production's one toast per effect says (userText.ts effectToasts).
import { DEPT_SHORT } from "@/domain/catalog";
import type { AppState } from "@/domain/types";
import { str } from "@/portal/data/raw";
import { errorText } from "@/portal/kf/sdk";
import { LIST } from "../ids";
import type { EffectResult, LoadFacts } from "../load";
import type { AppClient, WriteCtx } from "../types";
import { trimEnd } from "../userText";
import { recordAudit, work, type Work } from "./audit";
import { compact, rmesFlowOf } from "./encode";
import { caseRefOf, heldReview } from "./guards";
import { missingOf, writeVerified } from "./verify";

const attempted = new WeakMap<AppClient, Set<string>>();
const triedOf = (client: AppClient): Set<string> => {
  let s = attempted.get(client);
  if (!s) attempted.set(client, (s = new Set()));
  return s;
};

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

/** A cause inside a list item, without its own full stop (A15: "…could not be read.."). */
const causeText = (e: unknown) => trimEnd(errorText(e));

// ---------------------------------------------------------------------------------- RMES

/** SAF / REG: creates the own RMES row (header only) of every case whose review task this user holds. Null when nothing
 *  to do. */
export async function ensureRmes(ctx: WriteCtx, state: AppState, facts: LoadFacts): Promise<EffectResult | null> {
  const dept = ctx.acting.dept;
  if (!ctx.containerOk || (dept !== "SAF" && dept !== "REG")) return null;
  const tried = triedOf(ctx.client);
  const w = work();
  const created: string[] = [];
  const failed: string[] = [];
  const flow = rmesFlowOf(dept);
  for (const c of state.cases) {
    if (c.phase !== "review" || !heldReview(ctx, c.id, dept) || ctx.index.rmes.has(`${c.id}|${dept}`)) continue;
    const ref = caseRefOf(ctx, c.id);
    if (!ref) continue;
    const rmesKey = `${c.id}-RMES-${dept}`;
    // M1: the history names the record, so it exists although this load did not list it
    if (facts.audit.some((r) => str(r, "Object_Kind") === "RMES record" && str(r, "Object_Key") === rmesKey)) continue;
    if (tried.has(`${ref.itemId}|rmes|${dept}`)) continue;
    tried.add(`${ref.itemId}|rmes|${dept}`);
    try {
      // no Result_Case: a Reference to the case may be refused when the reviewer can't read it; Case_Item_Id joins. No
      // child table: the criteria and findings are retired (a Table:: key is left out, not sent empty). The record's
      // time is the rmes.saved row's Event_At below (a form list row has no _created_at, trackMap.rmesOf).
      const header = compact({ RMES_Key: rmesKey, Case_Item_Id: ref.itemId, Case_Code: c.id, Cycle_No: ref.cycleNo, RMES_Voided: LIST.no });
      const id = await ctx.client.formCreate(flow, header);
      await writeVerified(
        () => ctx.client.formGet(flow, id),
        async (back) => {
          const again = Object.fromEntries(missingOf(header, back).map((k) => [k, header[k]]));
          if (Object.keys(again).length) await ctx.client.formUpdate(flow, id, again);
        },
        (back) => missingOf(header, back),
      );
      created.push(`${c.id} ${DEPT_SHORT[dept]} RMES record`);
      await recordAudit(
        ctx,
        w,
        {
          code: "rmes.saved",
          caseId: c.id,
          object: { kind: "RMES record", key: rmesKey, itemId: id, state: "Created" },
          ref: { flow, itemId: id },
          entries: [{ id: "", at: ctx.now(), by: "system", action: "RMES record created", detail: `${DEPT_SHORT[dept]} RMES record created.` }],
          snapshot: { rmes: { dept } },
        },
        `${c.id}: the ${DEPT_SHORT[dept]} RMES record`,
        [],
      );
    } catch (e) {
      failed.push(`${c.id} ${DEPT_SHORT[dept]} RMES record (${causeText(e)})`);
    }
  }
  return result(w, created, failed, [], "Started", { done: created.length ? ["created"] : [], failed: failed.length ? ["failed"] : [] });
}
