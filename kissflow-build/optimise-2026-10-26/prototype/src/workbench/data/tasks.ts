// My Tasks for the three processes → TaskVM[] keyed `_id|_activity_instance_id` (WB-7), with the evidence-based
// step resolver (WORKBENCH-DESIGN.md §6.3, WB-6).
//
// A case in Part 2 can hold up to 6 open branch activities on one `_id`. Every row key such as `_current_step` is
// item-level until Diagnostics proves otherwise: on a Part 2 item it may name the block "Part 2 – Beiersdorf review"
// or ANOTHER branch. So, in order, each answer carrying an evidence level:
//   1. the activity filter used to fetch the row (serverActivityId, after read-back)          → "activity"
//   2. getProgress({instanceId}) matched by the row's _activity_instance_id                  → "activity"
//   3. item-level keys, ONLY when the user holds exactly one open task on that _id:
//        a known non-Parallel step name                                                      → "item"
//        the Parallel block's name and the (lensed) roles own exactly one branch of it       → "block-unique"
//   4. otherwise unresolved (step null): "Task at an unidentified step: open in Kissflow".
// It never returns a Parallel or End step.
import { allSteps, branchStepsOf, flowName, parallelBlockOf, processFlows, stepDef, stepOf, stepsOf, type FlowId, type RoleIr, type StepIr } from "../schema";
import { flowNoun, plural } from "../domain/labels";
import { F } from "../schema/generated";
import { actOf, pool, taskKeyOf, type RawItem, type WbClient } from "./client";
import { STEP_KEYS, num, str, stepNamesOf } from "./map";
import { activityKey, type SessionState } from "./session";
import type { Evidence, TaskVM } from "./viewModels";

export interface ProgressActivity {
  activityInstanceId: string;
  name: string;
  activityId?: string;
}

const pick = (o: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
};

/** Activities from a getProgress answer. The shape is [unverified] (harness assumption): tolerant parsing. */
export function progressActivities(body: unknown): ProgressActivity[] {
  const list: unknown[] = Array.isArray(body)
    ? body
    : body && typeof body === "object"
      ? ((["items", "Items", "Data", "data", "activities", "Activities", "progress", "Progress"].map((k) => (body as Record<string, unknown>)[k]).find(Array.isArray) as unknown[] | undefined) ?? [])
      : [];
  const out: ProgressActivity[] = [];
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const act = pick(o, ["_activity_instance_id", "ActivityInstanceId", "activityInstanceId", "activity_instance_id", "InstanceId"]);
    const name = pick(o, ["Name", "name", "_activity_name", "ActivityName", "activityName", "StepName", "stepName", "_current_step"]);
    if (!act || !name) continue;
    out.push({ activityInstanceId: act, name, activityId: pick(o, ["_activity_id", "ActivityId", "activityId", "_current_activity_id", "Id"]) });
  }
  return out;
}

export interface ResolveContext {
  /** Open tasks this user holds on the same _id (after paging and dedupe). */
  openTasksOnItem: number;
  /** The user's (lensed) roles, for block-unique. */
  roles: ReadonlySet<RoleIr>;
  /** The step the row was fetched for (activity filter). */
  activityStep?: StepIr | null;
  /** getProgress activities of the item, when read. */
  progress?: ProgressActivity[] | null;
  /** A getItem read of this task, when the row carried no usable key. */
  itemRead?: Record<string, unknown> | null;
}
export interface Resolution {
  step: StepIr | null;
  stepName: string | null;
  evidence: Evidence;
}

function fromNames(flow: FlowId, names: string[], roles: ReadonlySet<RoleIr>): Resolution | null {
  for (const n of names) {
    const ir = stepOf(flow, n);
    if (ir) return { step: ir, stepName: stepDef(ir).name, evidence: "item" };
  }
  for (const n of names) {
    const block = parallelBlockOf(flow, n);
    if (!block) continue;
    const mine = branchStepsOf(block).filter((s) => s.ownerRole && roles.has(s.ownerRole));
    if (mine.length === 1) return { step: mine[0].irId, stepName: mine[0].name, evidence: "block-unique" };
  }
  return null;
}

/** Pure resolver for one task row (§6.3). */
export function resolveTaskStep(flow: FlowId, row: Record<string, unknown>, ctx: ResolveContext): Resolution {
  if (ctx.activityStep) {
    const k = stepDef(ctx.activityStep).kind;
    if (k !== "Parallel" && k !== "End") return { step: ctx.activityStep, stepName: stepDef(ctx.activityStep).name, evidence: "activity" };
  }
  const act = actOf(row);
  if (act && ctx.progress) {
    const hit = ctx.progress.find((p) => p.activityInstanceId === act);
    const ir = hit ? stepOf(flow, hit.name) : null;
    if (ir) return { step: ir, stepName: stepDef(ir).name, evidence: "activity" };
  }
  if (ctx.openTasksOnItem === 1) {
    const r = fromNames(flow, stepNamesOf(row), ctx.roles) ?? (ctx.itemRead ? fromNames(flow, stepNamesOf(ctx.itemRead), ctx.roles) : null);
    if (r) return r;
  }
  return { step: null, stepName: null, evidence: null };
}

/** The due date shown for a task (§8.1): depends on the step. */
export function dueOf(step: StepIr | null, raw: Record<string, unknown>): string | undefined {
  if (!step) return undefined;
  const v =
    step === "CASE_S1" || step === "OPNT_S1"
      ? str(raw, "Supplier_Due_Date")
      : step === "CASE_S3"
        ? str(raw, "Completeness_Due_Date")
        : step === "CASE_S7"
          ? str(raw, "Final_Release_Due_Date")
          : step.startsWith("OPNT_R_")
            ? str(raw, "Internal_Due_Date")
            : "";
  return v || undefined;
}

export function toTaskVM(flow: FlowId, row: RawItem, r: Resolution): TaskVM {
  const act = actOf(row) ?? "";
  const isCase = flow === "CIQ_Case_A00";
  const caseCode = str(row, "Case_Code") || undefined;
  const title =
    flow === "CIQ_Case_A00"
      ? [str(row, F.Case.Case_Code), str(row, F.Case.Trade_Name)].filter(Boolean).join(" · ")
      : flow === "CIQ_Open_Point_A00"
        ? [str(row, F.Open_Point.OP_Key), str(row, F.Open_Point.Question_Text).slice(0, 80)].filter(Boolean).join(" · ")
        : [str(row, F.Change_Request.CR_Key), str(row, F.Change_Request.Change_Kind)].filter(Boolean).join(" · ");
  return {
    key: `${row._id}|${act}`,
    flow,
    instanceId: row._id,
    activityInstanceId: act,
    step: r.step,
    stepName: r.stepName,
    evidence: r.evidence,
    caseItemId: isCase ? row._id : str(row, "Case_Item_Id") || undefined,
    caseCode,
    cycleNo: num(row, "Cycle_No"),
    title: title || row._id,
    due: dueOf(r.step, row),
    raw: row,
  };
}

export interface LoadTasksOptions {
  roles: ReadonlySet<RoleIr>;
  session: SessionState;
  flows?: FlowId[];
  /** Ask getProgress for task items (pool of 4, one call per _id). Default true unless disabled this session. */
  progress?: boolean;
}
export interface LoadTasksResult {
  tasks: TaskVM[];
  warnings: string[];
  errors: { flow: FlowId; message: string }[];
}

/** Loads every held task of the three processes and resolves its step. */
export async function loadTasks(client: WbClient, o: LoadTasksOptions): Promise<LoadTasksResult> {
  const warnings: string[] = [];
  const errors: LoadTasksResult["errors"] = [];
  const out: TaskVM[] = [];
  for (const flow of o.flows ?? processFlows()) {
    // 1. rows, by activity filter when server activity ids are known
    const known = stepsOf(flow).filter((s) => s.serverActivityId && (s.kind === "UserTask" || s.kind === "Start"));
    const rows: { row: RawItem; activityStep: StepIr | null }[] = [];
    try {
      if (known.length) {
        const owned = known.filter((s) => s.fieldAssigned || (s.ownerRole && o.roles.has(s.ownerRole)));
        const seen = new Set<string>();
        for (const s of owned)
          for (const row of await client.listTasks(flow, s.serverActivityId!)) {
            const k = taskKeyOf(row);
            if (!seen.has(k)) {
              seen.add(k);
              rows.push({ row, activityStep: s.irId });
            }
          }
      } else for (const row of await client.listTasks(flow)) rows.push({ row, activityStep: null });
    } catch (e) {
      errors.push({ flow, message: e instanceof Error ? e.message : String(e) });
      continue;
    }
    // Diagnostics: every _-prefixed key seen on task rows
    const keys = o.session.taskRowKeys.get(flow) ?? new Set<string>();
    for (const { row } of rows) for (const k of Object.keys(row)) if (k.startsWith("_")) keys.add(k);
    o.session.taskRowKeys.set(flow, keys);
    const noAct = rows.filter(({ row }) => !actOf(row));
    // the technical detail (no activity instance on the row) is on Diagnostics; the banner says what to do
    if (noAct.length) warnings.push(`${plural(noAct.length, `${flowNoun(flowName(flow))} task`)} can't be opened here: open ${noAct.length === 1 ? "it" : "them"} from Kissflow's My Tasks.`);

    // 2. getProgress per item (only where the activity filter did not decide)
    const perItem = new Map<string, number>();
    for (const { row } of rows) perItem.set(row._id, (perItem.get(row._id) ?? 0) + 1);
    const progressFor = new Map<string, ProgressActivity[] | null>();
    const wantProgress = (o.progress ?? true) && !o.session.progressDisabled;
    if (wantProgress) {
      const ids = [...new Set(rows.filter((r) => !r.activityStep).map((r) => r.row._id))];
      const res = await pool(ids, 4, (id) => client.getProgress(flow, id));
      res.forEach((r, i) => {
        if (r.status === "fulfilled") progressFor.set(ids[i], progressActivities(r.value));
        else {
          progressFor.set(ids[i], null);
          if (/not available|not[_ ]emulated|unknown command/i.test(String((r.reason as Error)?.message ?? r.reason))) o.session.progressDisabled = true;
        }
      });
    }

    // 3. item reads for single-task items whose row carries no usable step key
    const resolvedFirst = rows.map(({ row, activityStep }) => ({ row, activityStep, r: resolveTaskStep(flow, row, { openTasksOnItem: perItem.get(row._id) ?? 0, roles: o.roles, activityStep, progress: progressFor.get(row._id) }) }));
    const needRead = resolvedFirst.filter((x) => !x.r.step && (perItem.get(x.row._id) ?? 0) === 1 && actOf(x.row) && !STEP_KEYS.some((k) => x.row[k]));
    const reads = await pool(needRead, 4, (x) => client.getItem(flow, x.row._id, actOf(x.row)!));
    reads.forEach((rr, i) => {
      if (rr.status !== "fulfilled") return;
      const x = needRead[i];
      x.r = resolveTaskStep(flow, x.row, { openTasksOnItem: 1, roles: o.roles, progress: progressFor.get(x.row._id), itemRead: rr.value });
      // fill missing case fields from the full read
      for (const k of ["Case_Code", "Cycle_No", "Case_Item_Id", "Trade_Name", "OP_Key", "CR_Key", "Supplier_Due_Date", "Completeness_Due_Date", "Final_Release_Due_Date", "Internal_Due_Date"])
        if (x.row[k] === undefined && rr.value[k] !== undefined) x.row = { ...x.row, [k]: rr.value[k] };
    });

    for (const x of resolvedFirst) {
      const t = toTaskVM(flow, x.row, x.r);
      o.session.evidence.set(t.key, { flow, step: t.step, evidence: t.evidence });
      // session cache (flow, stepName) → activity id, only with activity-level evidence
      if (t.step && t.evidence === "activity") {
        const actId = str(x.row, "_activity_id") || str(x.row, "_current_activity_id") || progressFor.get(x.row._id)?.find((p) => p.activityInstanceId === t.activityInstanceId)?.activityId;
        if (actId) o.session.activityIds.set(activityKey(flow, stepDef(t.step).name), actId);
      }
      // progress answers also teach activity ids of other steps
      for (const p of progressFor.get(x.row._id) ?? []) {
        const ir = stepOf(flow, p.name);
        if (ir && p.activityId) o.session.activityIds.set(activityKey(flow, p.name), p.activityId);
      }
      out.push(t);
    }
    const unresolved = out.filter((t) => t.flow === flow && !t.step).length;
    if (unresolved) warnings.push(`${plural(unresolved, `${flowNoun(flowName(flow))} task`)} can't be opened here: open ${unresolved === 1 ? "it" : "them"} from Kissflow's My Tasks.`);
  }
  return { tasks: out, warnings, errors };
}

/** Tasks visible under the lens: a task at a step none of the lensed roles owns is hidden, except field-assigned
 *  steps (CASE_S1, OPNT_S1: never hidden) and unresolved tasks. */
export function lensTasks(tasks: TaskVM[], roles: ReadonlySet<RoleIr>): TaskVM[] {
  return tasks.filter((t) => {
    if (!t.step) return true;
    const s = stepDef(t.step);
    return !!s.fieldAssigned || !s.ownerRole || roles.has(s.ownerRole);
  });
}

/** The held task for (flow, instanceId[, step]): the ONLY gate for step actions (ground rule 13). */
export function findHeldTask(tasks: TaskVM[], flow: FlowId, instanceId: string, step?: StepIr | null): TaskVM | null {
  return tasks.find((t) => t.flow === flow && t.instanceId === instanceId && (step === undefined || step === null || t.step === step)) ?? null;
}

/** The activity id of a step: generated (read-back), else learned this session. */
export function activityIdOf(session: SessionState, step: StepIr): string | null {
  const s = stepDef(step);
  return s.serverActivityId ?? session.activityIds.get(activityKey(s.flow, s.name)) ?? null;
}

export const taskSteps = (): StepIr[] => allSteps().filter((s) => s.kind === "UserTask").map((s) => s.irId);
