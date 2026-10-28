// Step traversal of the emulated host (WORKBENCH-DESIGN.md §11.1 workflow.ts), from the generated STEPS order:
// - conditions `A = "x"` / `A != "x"` on the item's fields (after formulas); a blank field is != every value;
// - Parallel blocks: one activity per branch whose condition holds; the join fires when every activity of that fork
//   is closed; a block with no true branch is skipped (SPIKES L132); End → Completed;
// - send-back to an earlier step opens a NEW activity instance there;
// - reject → Rejected, withdraw → Withdrawn; neither completes the item.
// Tasks go to the users whose roles own the step; with K-FA (kfa=on) CASE_S1 is assigned from Owner_RMM and OPNT_S1
// from Responsible_User (spec workflow.meta.after_generate_switches.other_after_generate[2]).
import { STEPS, type FlowId, type RoleIr, type StepIr } from "../schema/generated";
import { nextId, openActs, type Activity, type CloseHow, type HostState, type ProcItem } from "./state";

export interface StepLike {
  flow: FlowId;
  irId: StepIr;
  name: string;
  kind: "Start" | "UserTask" | "Parallel" | "End";
  ownerRole: RoleIr | null;
  fieldAssigned?: string;
  condition?: string;
  parallel?: { block: StepIr; branchIndex: number };
  order: number;
}

export interface WfUser {
  _id: string;
  roles: RoleIr[];
}

export interface WfCtx {
  state: HostState;
  /** The host clock, as `YYYY-MM-DDTHH:MM:SSZ`. */
  now(): string;
  kfa: boolean;
}

export const step = (ir: StepIr): StepLike => STEPS[ir] as unknown as StepLike;
export const stepsOfFlow = (flow: FlowId): StepLike[] => (Object.values(STEPS) as unknown as StepLike[]).filter((s) => s.flow === flow).sort((a, b) => a.order - b.order);
export const topLevel = (flow: FlowId): StepLike[] => stepsOfFlow(flow).filter((s) => !s.parallel);
export const branchesOf = (block: StepIr): StepLike[] => (Object.values(STEPS) as unknown as StepLike[]).filter((s) => s.parallel?.block === block).sort((a, b) => a.parallel!.branchIndex - b.parallel!.branchIndex);
export const startOf = (flow: FlowId): StepLike => {
  const s = stepsOfFlow(flow).find((x) => x.kind === "Start");
  if (!s) throw new Error(`${flow} has no Start step`);
  return s;
};
export const stepByName = (flow: FlowId, name: string): StepLike | undefined => stepsOfFlow(flow).find((s) => s.name === name);

/** The server activity id of a step: the read-back id (STEPS[ir].serverActivityId) when merged, else a fake one
 *  (compiled ids look like `Activity_1feompb`; SPIKES L25). Task-row filters, getProgress and send-back all use it. */
export const activityIdOf = (ir: StepIr): string => {
  const sid: string | null = STEPS[ir].serverActivityId;
  return sid ?? `Activity_${ir.toLowerCase()}`;
};
export const stepOfActivityId = (flow: FlowId, activityId: string): StepLike | undefined => stepsOfFlow(flow).find((s) => activityIdOf(s.irId) === activityId);

const blank = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
const asText = (v: unknown): string => (blank(v) ? "" : typeof v === "object" ? String((v as { _id?: unknown })._id ?? JSON.stringify(v)) : String(v));

/** `A = "x"` / `A != "x"`; no condition = true. Anything else throws (a spec the host does not understand). */
export function evalCondition(cond: string | undefined, fields: Record<string, unknown>): boolean {
  if (!cond || !cond.trim()) return true;
  const m = /^\s*([A-Za-z0-9_]+)\s*(=|!=)\s*"([^"]*)"\s*$/.exec(cond);
  if (!m) throw new Error(`condition not emulated: ${cond}`);
  const v = asText(fields[m[1]]);
  return m[2] === "=" ? v === m[3] : v !== m[3];
}

const userIdOf = (v: unknown): string | null => {
  if (typeof v === "string" && v) return v;
  if (v && typeof v === "object" && typeof (v as { _id?: unknown })._id === "string") return (v as { _id: string })._id || null;
  return null;
};

/** Who gets the task at a step: the creator at Start; K-FA field; else the owner role. */
export function assigneeFor(ctx: WfCtx, it: ProcItem, s: StepLike): Activity["assignee"] {
  if (s.kind === "Start") return { userId: it.createdBy };
  if (ctx.kfa && s.fieldAssigned) {
    const u = userIdOf(it.fields[s.fieldAssigned]);
    if (u) return { userId: u };
  }
  if (!s.ownerRole) throw new Error(`${s.irId} has no owner role`);
  return { role: s.ownerRole };
}

/** True when the user holds this OPEN activity (assigned to them, or to a role they hold). */
export function holds(u: WfUser, a: Activity): boolean {
  if (!a.open) return false;
  return "userId" in a.assignee ? a.assignee.userId === u._id : u.roles.includes(a.assignee.role);
}

export function openAt(ctx: WfCtx, it: ProcItem, s: StepLike, round?: number): Activity {
  const a: Activity = { act: nextId(ctx.state, "Ai"), step: s.irId, open: true, assignee: assigneeFor(ctx, it, s), openedAt: ctx.now(), ...(round !== undefined ? { round } : {}) };
  it.acts.push(a);
  return a;
}

function close(ctx: WfCtx, a: Activity, by: string, how: CloseHow): void {
  a.open = false;
  a.closedAt = ctx.now();
  a.closedBy = by;
  a.how = how;
}

/** Opens whatever follows `from` (a top-level step, or the block after a join). Completes the item at End. */
export function continueAfter(ctx: WfCtx, it: ProcItem, from: StepLike): void {
  for (const s of topLevel(it.flow)) {
    if (s.order <= from.order) continue;
    if (s.kind === "End") {
      it.status = "Completed";
      return;
    }
    if (s.kind === "Parallel") {
      const live = branchesOf(s.irId).filter((b) => evalCondition(b.condition, it.fields));
      if (!live.length) continue; // an all-false block is skipped (SPIKES L132)
      const round = ++ctx.state.seq;
      for (const b of live) openAt(ctx, it, b, round);
      return;
    }
    if (s.kind === "UserTask" && evalCondition(s.condition, it.fields)) {
      openAt(ctx, it, s);
      return;
    }
  }
  it.status = "Completed";
}

/** Closes the activity and moves on: a branch waits for its fork's join; Start turns a draft into In progress. */
export function submitAct(ctx: WfCtx, it: ProcItem, a: Activity, by: string, how: CloseHow = "submitted"): void {
  close(ctx, a, by, how);
  if (!it.actors.includes(by)) it.actors.push(by);
  const s = step(a.step);
  if (s.kind === "Start") it.status = "InProgress";
  if (s.parallel) {
    const sameFork = it.acts.filter((x) => x.round === a.round && step(x.step).parallel?.block === s.parallel!.block);
    if (sameFork.some((x) => x.open)) return; // the join waits
    continueAfter(ctx, it, step(s.parallel.block));
    return;
  }
  continueAfter(ctx, it, s);
}

/** Send-back from the activity to an earlier top-level step: a new activity instance there. */
export function sendBackAct(ctx: WfCtx, it: ProcItem, a: Activity, target: StepLike, by: string, how: CloseHow = "sent-back"): Activity {
  const from = step(a.step);
  if (target.flow !== it.flow || target.parallel || target.kind !== "UserTask" || target.order >= from.order) throw new Error(`cannot send back from ${from.irId} to ${target.irId}`);
  close(ctx, a, by, how);
  if (!it.actors.includes(by)) it.actors.push(by);
  return openAt(ctx, it, target);
}

export function rejectItem(ctx: WfCtx, it: ProcItem, by: string): void {
  for (const a of openActs(it)) close(ctx, a, by, "rejected");
  if (!it.actors.includes(by)) it.actors.push(by);
  it.status = "Rejected";
}

export function withdrawItem(ctx: WfCtx, it: ProcItem, by: string): void {
  for (const a of openActs(it)) close(ctx, a, by, "withdrawn");
  if (!it.actors.includes(by)) it.actors.push(by);
  it.status = "Withdrawn";
}

/** A new process item in Draft, with its Start activity assigned to the creator. */
export function startItem(ctx: WfCtx, flow: FlowId, createdBy: string, fields: Record<string, unknown>): ProcItem {
  const at = ctx.now();
  const it: ProcItem = { flow, id: nextId(ctx.state, "Pk"), status: "Draft", fields, acts: [], createdBy, createdAt: at, modifiedAt: at, modifiedBy: createdBy, actors: [createdBy] };
  ctx.state.items.push(it);
  openAt(ctx, it, startOf(flow));
  return it;
}

/** The step name a row/read shows for the item: the open activity's step, the block name when several branches are
 *  open, the last step for an ended item. */
export function currentStepName(it: ProcItem): string {
  const open = openActs(it);
  if (open.length === 1) return step(open[0].step).name;
  if (open.length > 1) {
    const blocks = new Set(open.map((a) => step(a.step).parallel?.block).filter(Boolean));
    if (blocks.size === 1) return step([...blocks][0] as StepIr).name;
    return open.map((a) => step(a.step).name).join(", ");
  }
  if (it.status === "Completed") return "End";
  const last = [...it.acts].sort((x, y) => String(y.closedAt).localeCompare(String(x.closedAt)))[0];
  return last ? step(last.step).name : "";
}
