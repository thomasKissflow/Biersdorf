// createPoint (§8.9; used by T1's S5 "Raise department review for D"):
//   client problems → createProcessItem(CIQ_Open_Point_A00, …) in the ONE create lane: pre-create Mandatory check →
//   createItem at Start → the payload read back and compared → the SERVER Start_Gate read back; when it is not "OK"
//   the missing parts are listed (client mirror) and NOTHING is submitted (the draft is kept: ActionError.draft) →
//   submit. The point then routes to OPNT_S1 (to the supplier) or to R_<OP_Dept>.
// Final contract (§12.2): createPoint(input: RaiseInput, c: CaseVM): Promise<{ instanceId }>. The dialog uses
// createPointWith (same steps, explicit actions and draft resume).
import { ActionError, createProcessItem, type Actions } from "../../data/actions";
import { boundRuntime, type Me } from "../../data/runtime";
import type { CaseVM } from "../../data/viewModels";
import { buildRaiseData, OP_FLOW, raiseProblems, type RaiseInput } from "./model";

export type { RaiseInput };

export interface CreatePointOptions {
  /** Resume a draft left at Start (the Start gate was not OK): fix the input and send again. */
  draft?: { instanceId: string; activityInstanceId: string };
  /** Keep the OP_Key of the first attempt when resuming a draft. */
  opKey?: string;
  now?: Date;
  rnd?: () => number;
}

export async function createPointWith(
  actions: Pick<Actions, "createProcessItem">,
  me: Me,
  input: RaiseInput,
  c: CaseVM,
  o: CreatePointOptions = {},
): Promise<{ instanceId: string; opKey: string }> {
  const problems = raiseProblems(input);
  if (problems.length) throw new ActionError(`Nothing was created. ${problems.map((p) => p.message).join(" ")}`, "problems", problems, o.draft);
  const data = buildRaiseData(input, c, me, o.now ?? new Date(), o.rnd ?? Math.random, { opKey: o.opKey });
  const opKey = String(data.OP_Key);
  const r = await actions.createProcessItem(OP_FLOW, data, o.draft ? { draft: o.draft } : undefined);
  return { instanceId: r.instanceId, opKey };
}

export async function createPoint(input: RaiseInput, c: CaseVM): Promise<{ instanceId: string }> {
  const r = await createPointWith({ createProcessItem }, boundRuntime().me, input, c);
  return { instanceId: r.instanceId };
}
