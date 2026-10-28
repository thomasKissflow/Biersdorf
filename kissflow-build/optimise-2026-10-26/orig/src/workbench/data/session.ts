// Per-session runtime facts (memory only; a reload clears them): K-WB marks per step (WB-9), the (flow, step name) →
// activity id cache (§6.3), what Diagnostics has proven live, and write-path counters (§9 "Write path this session").
import type { FlowId, StepIr } from "../schema";
import type { ListQuality } from "./client";
import type { Evidence } from "./viewModels";

export type KwbState = "untested" | "ok" | "refused";
export type SendBackState = "untested" | "ok" | "refused" | "no-step-id";

export interface SessionState {
  kwb: Map<StepIr, KwbState>;
  sendBack: SendBackState;
  openForm: { presses: number; answered: number; timedOut: number; refused: number };
  notKept: number;
  retries: number;
  /** (flow|stepName) → activity id, learned from rows that carry one with activity-level evidence. */
  activityIds: Map<string, string>;
  /** Task key → evidence level (Diagnostics). */
  evidence: Map<string, { flow: FlowId; step: StepIr | null; evidence: Evidence }>;
  /** Every `_`-prefixed key seen on task rows, per flow (Diagnostics). */
  taskRowKeys: Map<FlowId, Set<string>>;
  /** True only after Diagnostics proved a viewer route live this session (WB-5). Never set otherwise. */
  viewerRouteProven: boolean;
  /** getProgress failed once with "not available"/unknown command: stop asking this session. */
  progressDisabled: boolean;
  /** Flows whose admin list (rung 1) was refused this session: later reads go straight to the next rung. */
  adminRefused: Set<FlowId>;
  /** The rung that last answered per flow (Diagnostics "Read ladder"). */
  rungs: Map<FlowId, ListQuality>;
  /** `flow|_id|act` of activities this session submitted, rejected or sent back (or found moved out): hooks never read
   *  an item with such an activity again (CR-T2-review-1, T5). */
  closedActs: Set<string>;
}

export function createSession(): SessionState {
  return {
    kwb: new Map(),
    sendBack: "untested",
    openForm: { presses: 0, answered: 0, timedOut: 0, refused: 0 },
    notKept: 0,
    retries: 0,
    activityIds: new Map(),
    evidence: new Map(),
    taskRowKeys: new Map(),
    viewerRouteProven: false,
    progressDisabled: false,
    adminRefused: new Set(),
    rungs: new Map(),
    closedActs: new Set(),
  };
}

export const isKwbRefused = (s: SessionState, step: StepIr): boolean => s.kwb.get(step) === "refused";
export const markKwbRefused = (s: SessionState, step: StepIr): void => void s.kwb.set(step, "refused");
export const markKwbOk = (s: SessionState, step: StepIr): void => {
  if (s.kwb.get(step) !== "refused") s.kwb.set(step, "ok");
};
export const activityKey = (flow: FlowId, stepName: string): string => `${flow}|${stepName}`;
const closedKey = (flow: FlowId, id: string, act: string) => `${flow}|${id}|${act}`;
export const markClosedAct = (s: SessionState, flow: FlowId, id: string, act: string): void => void s.closedActs.add(closedKey(flow, id, act));
export const isClosedAct = (s: SessionState, flow: FlowId, id: string, act: string): boolean => s.closedActs.has(closedKey(flow, id, act));
