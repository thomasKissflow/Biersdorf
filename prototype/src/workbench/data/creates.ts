// Creates (WORKBENCH-DESIGN.md §7.6). Both run in the ONE create lane (writeQueue.create): create → submit → verify,
// then the next, because Kissflow keeps one draft per user and parallel creates collide (SPIKES L158).
//
// createProcessItem: pre-create Mandatory check (POST_CREATE_KEYS exempt) → createItem at Start → read back and
// compare EVERY field sent → write the _id-derived keys plus anything dropped at Start (write-then-verify; Start
// drafts accept updates, SPIKES L102) → full Mandatory + gate check → submit → settle on a failed/unanswered submit.
// createFormRow: required check → discard the user's open draft FIRST → create → submit → verify (by id, else by key)
// → settle on failure → re-apply missing fields (never for F8: the caller writes a correcting row instead).
import { fieldLabel, isChildTable, mandatoryAt, postCreateKeys, requiredFormFields, startStep, type ChildTableId, type FlowId } from "../schema";
import { errorText } from "../kf/sdk";
import { isNoDraft, isTimeout, WbError, type RawItem } from "./client";
import { stepProblems } from "./gates";
import { isBlank } from "./normalize";
import type { Runtime } from "./runtime";
import { markClosedAct } from "./session";
import type { Patch, Problem } from "./viewModels";
import { missingFrom, missingKeys, normalisePatch, toBody, toPatch, writeVerified, AUDIT_FLOW } from "./writeVerified";

export class ActionError extends Error {
  constructor(
    message: string,
    readonly kind: "problems" | "refused" | "not-kept" | "timeout" | "draft-left" | "kwb-refused",
    readonly problems: Problem[] = [],
    /** A draft left at Start (e.g. the Start gate is not OK yet): fix it and call createProcessItem again with o.draft. */
    readonly draft?: { instanceId: string; activityInstanceId: string },
  ) {
    super(message);
    this.name = "ActionError";
  }
}

const problemsText = (ps: Problem[]) => ps.map((p) => p.message).join(" ");

/** Splits create data into header fields and child-table rows (keys that are child table ids of the flow). */
export function splitData(flow: FlowId, data: Record<string, unknown>): Patch {
  const fields: Record<string, unknown> = {};
  const tables: NonNullable<Patch["tables"]> = {};
  for (const [k, v] of Object.entries(data)) {
    if (isChildTable(flow, k)) {
      if (Array.isArray(v) && v.length) tables[k] = v.map((row) => ({ kind: "add" as const, row: row as Record<string, unknown> }));
    } else fields[k] = v;
  }
  return { fields, tables };
}

export interface CreateProcessOptions {
  /** The _id-derived Start keys (e.g. Case_Code, Request_Key), written at Start after the create. */
  postCreate?: (draft: { instanceId: string; activityInstanceId: string }) => Patch;
  /** Continue an existing draft at Start (after a failed Start check) instead of creating a new one. */
  draft?: { instanceId: string; activityInstanceId: string };
}

export async function createProcessItem(rt: Runtime, flow: FlowId, data: Record<string, unknown>, o: CreateProcessOptions = {}): Promise<{ instanceId: string }> {
  const start = startStep(flow);
  // 0. pre-create check: Mandatory at Start minus the _id-derived keys
  const exempt = postCreateKeys(flow);
  const pre: Problem[] = mandatoryAt(start.irId)
    .filter((f) => !exempt.includes(f) && isBlank(data[f]))
    .map((f) => ({ field: f, label: fieldLabel(flow, f), message: `${fieldLabel(flow, f)} is required.` }));
  if (pre.length && !o.draft) throw new ActionError(`Nothing was created. ${problemsText(pre)}`, "problems", pre);
  const patch = splitData(flow, data);

  return rt.queue.create(async () => {
    // 1. create the draft at Start
    let draft = o.draft;
    if (!draft) {
      const body = toBody(flow, normalisePatch(flow, patch, rt.rnd, {})); // a new item: every add is indexed from 0 (WL-15)
      const created = await rt.client.create(flow, body);
      if (!created.act) {
        await discardProcessDraft(rt, flow, created.id, new WbError("Kissflow created the item without a Start task."));
      }
      draft = { instanceId: created.id, activityInstanceId: created.act! };
    }
    const target = { kind: "task" as const, flow, instanceId: draft.instanceId, activityInstanceId: draft.activityInstanceId, step: start.irId, evidence: "activity" as const };
    // 2. read the draft back and compare EVERY field sent (D32)
    let dropped: Patch = { fields: {} };
    try {
      const back = await rt.client.getItem(flow, draft.instanceId, draft.activityInstanceId);
      dropped = toPatch(missingFrom(flow, back, normalisePatch(flow, patch, rt.rnd)));
    } catch (e) {
      throw new ActionError(`The new item could not be read back (${errorText(e)}). It is still a draft at Start.`, "draft-left", [], draft);
    }
    // 3. the _id-derived keys plus everything dropped, written at Start with write-then-verify
    const post = o.postCreate?.(draft) ?? { fields: {} };
    const startPatch: Patch = { fields: { ...dropped.fields, ...post.fields }, tables: { ...(dropped.tables ?? {}), ...(post.tables ?? {}) } };
    if (o.draft) Object.assign(startPatch.fields, patch.fields);
    if (Object.keys(startPatch.fields).length || Object.values(startPatch.tables ?? {}).some((x) => x?.length)) {
      const res = await writeVerified(rt, target, startPatch);
      if (!res.ok) throw new ActionError(`The new item was created but its Start values were not kept: ${res.message}`, res.kind === "timeout" ? "timeout" : "not-kept", [], draft);
    }
    // 4. full Mandatory and gate check at Start (now with the post-create keys)
    const fresh = await rt.client.getItem(flow, draft.instanceId, draft.activityInstanceId);
    const problems = stepProblems(start.irId, fresh);
    if (problems.length) throw new ActionError(`Not sent yet: ${problemsText(problems)}`, "problems", problems, draft);
    // 5. submit, 6. settle
    try {
      await rt.client.submit(flow, draft.instanceId, draft.activityInstanceId);
    } catch (e) {
      await settleProcessSubmit(rt, flow, draft.instanceId, e);
    }
    markClosedAct(rt.session, flow, draft.instanceId, draft.activityInstanceId);
    rt.changed();
    return { instanceId: draft.instanceId };
  });
}

/** After a failed or unanswered submit: if it went through after all, it counts as sent. Otherwise the draft is
 *  discarded and the cause rethrown; a failed discard is said (portal liveActions.ts settle). */
async function settleProcessSubmit(rt: Runtime, flow: FlowId, id: string, cause: unknown): Promise<void> {
  let mine: RawItem[] = [];
  try {
    mine = await rt.client.listMine(flow, "all");
  } catch {
    /* can't tell: treat as not sent */
  }
  const it = mine.find((x) => x._id === id);
  if (it && it._status && String(it._status).toLowerCase() !== "draft") return;
  await discardProcessDraft(rt, flow, id, cause);
}
async function discardProcessDraft(rt: Runtime, flow: FlowId, id: string, cause: unknown): Promise<never> {
  try {
    await rt.client.discard(flow, id);
  } catch {
    throw new ActionError(`${errorText(cause)} The unsent draft could not be removed either: reload and check your drafts before trying again.`, "draft-left");
  }
  throw new ActionError(`${errorText(cause)} Nothing was created.`, isTimeout(cause) ? "timeout" : "refused");
}

/** Discards the user's open draft of a Form. "No draft" is fine; anything else stops the create. */
async function discardFormDraft(rt: Runtime, flow: FlowId): Promise<void> {
  try {
    await rt.client.formDiscard(flow);
  } catch (e) {
    if (isNoDraft(e)) return;
    if (/not available/i.test(errorText(e))) return; // no discard in this host: nothing to clear
    throw new ActionError(`Could not clear your open draft of ${flow} (${errorText(e)}). Nothing was created.`, "refused");
  }
}

export interface CreateFormOptions {
  /** Re-apply fields missing after the submit (default true). ALWAYS false for F8 (create-only, WB-15). */
  reapply?: boolean;
}

export async function createFormRow(rt: Runtime, flow: FlowId, data: Record<string, unknown>, keyField: string, o: CreateFormOptions = {}): Promise<{ itemId: string; missing?: string[] }> {
  const reapply = flow === AUDIT_FLOW ? false : (o.reapply ?? true);
  // 0. required check
  const req: Problem[] = requiredFormFields(flow)
    .filter((f) => isBlank(data[f]))
    .map((f) => ({ field: f, label: fieldLabel(flow, f), message: `${fieldLabel(flow, f)} is required.` }));
  if (req.length) throw new ActionError(`Nothing was created. ${problemsText(req)}`, "problems", req);
  if (isBlank(data[keyField])) throw new ActionError(`Nothing was created: the key ${keyField} is blank.`, "problems");
  const patch = splitData(flow, data);
  const norm = normalisePatch(flow, patch, rt.rnd, {}); // a new row: every child add is indexed from 0 (WL-15)
  const body = toBody(flow, norm);
  const keyValue = String(data[keyField]);
  const byKey = async (): Promise<RawItem | null> => {
    try {
      return (await rt.client.formList(flow)).find((r) => String(r[keyField] ?? "") === keyValue) ?? null;
    } catch {
      return null;
    }
  };

  const created = await rt.queue.create(async (): Promise<{ itemId: string; missing?: string[] }> => {
    // 1. discard the user's open draft first (one draft per user; a leftover would leak values)
    await discardFormDraft(rt, flow);
    // 2. create, 3. submit
    const draft = await rt.client.formCreate(flow, body);
    let itemId = draft._id;
    let row: RawItem | null = null;
    try {
      itemId = (await rt.client.formSubmit(flow, draft._id)) ?? draft._id;
    } catch (cause) {
      // 5. settle: the row may exist after all
      row = await byKey();
      if (!row) {
        try {
          await rt.client.formDiscard(flow);
        } catch {
          throw new ActionError(`${errorText(cause)} Your draft of ${flow} is still open; it may block the next create.`, "draft-left");
        }
        throw new ActionError(`${errorText(cause)} Nothing was created.`, isTimeout(cause) ? "timeout" : "refused");
      }
      itemId = row._id;
    }
    // 4. verify by id, else by key (the id may change on submit [unverified])
    if (!row) {
      try {
        row = await rt.client.formGet(flow, itemId);
      } catch {
        row = await byKey();
      }
    }
    if (!row) throw new ActionError(`The new ${flow} row could not be read back. Reload and check before creating it again.`, "not-kept");
    itemId = row._id;
    // 6. missing fields
    const missing = missingFrom(flow, row, norm);
    const missingList = missingKeys(missing);
    if (!missingList.length) return { itemId };
    if (!reapply) return { itemId, missing: missingList };
    const res = await writeVerified(rt, { kind: "form", flow, itemId }, toPatch(missing));
    if (!res.ok) throw new ActionError(`The row was created, but Kissflow did not keep ${missingList.join(", ")}: ${res.message}`, "not-kept");
    return { itemId };
  });
  // CR-T3-admin-2 (T5): a created row changes server state, so hooks reload. Not for F8: every F8 row belongs to a
  // larger action (submit, reject, count write, repair, retire …) that signals the change itself when it ends, and a
  // reload in the middle of that action would only add reads.
  if (flow !== AUDIT_FLOW) rt.changed();
  return created;
}

export type { ChildTableId };
