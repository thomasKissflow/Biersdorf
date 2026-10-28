// State of the emulated Kissflow app (WORKBENCH-DESIGN.md §11.1 state.ts): process items with their activities,
// Form rows, per-user Form drafts, an id sequence and the host clock. Plain data, so __kfState() can snapshot it.
import type { FlowId, RoleIr, StepIr } from "../schema/generated";

export type ProcStatus = "Draft" | "InProgress" | "Completed" | "Rejected" | "Withdrawn";
export type CloseHow = "submitted" | "rejected" | "sent-back" | "withdrawn" | "native-submit" | "native-send-back";

export interface Activity {
  /** _activity_instance_id */
  act: string;
  step: StepIr;
  open: boolean;
  /** A user id (Start, or K-FA field assignment) or the owner role (everyone holding it gets the task). */
  assignee: { userId: string } | { role: RoleIr };
  openedAt: string;
  closedAt?: string;
  closedBy?: string;
  how?: CloseHow;
  /** Parallel round: branch activities opened by one fork share it (the join waits for all of them). */
  round?: number;
}

export interface ProcItem {
  flow: FlowId;
  id: string;
  status: ProcStatus;
  /** Header fields and `Table::<id>` child rows. */
  fields: Record<string, unknown>;
  acts: Activity[];
  createdBy: string;
  createdAt: string;
  modifiedAt: string;
  modifiedBy: string;
  /** Users who acted on the item (Participated list, when participated=ok). */
  actors: string[];
}

export interface FormRow {
  flow: FlowId;
  id: string;
  fields: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  modifiedAt: string;
  modifiedBy: string;
  /** An open draft of its creator (one per user per Form; SPIKES L158). Drafts are not listed. */
  draft: boolean;
}

export interface HostState {
  items: ProcItem[];
  rows: FormRow[];
  seq: number;
  /** Fixture name → item id (C1…C10, P1…P7, CR1…CR4, suppliers, config). */
  fixtures: Record<string, string>;
}

export const createState = (): HostState => ({ items: [], rows: [], seq: 0, fixtures: {} });

const B36 = (n: number, w: number) => n.toString(36).toUpperCase().padStart(w, "0");
/** Deterministic ids: `Pk…` items, `Ai…` activity instances, `Fr…` form rows. */
export const nextId = (s: HostState, prefix: string): string => `${prefix}${B36(++s.seq, 6)}`;

export const findItem = (s: HostState, flow: FlowId, id: string): ProcItem | undefined => s.items.find((x) => x.flow === flow && x.id === id);
export const findItemAnyFlow = (s: HostState, id: string): ProcItem | undefined => s.items.find((x) => x.id === id);
export const findRow = (s: HostState, flow: FlowId, id: string): FormRow | undefined => s.rows.find((x) => x.flow === flow && x.id === id);
export const openActs = (it: ProcItem): Activity[] => it.acts.filter((a) => a.open);
export const itemsOf = (s: HostState, flow: FlowId): ProcItem[] => s.items.filter((x) => x.flow === flow);
export const rowsOfFlow = (s: HostState, flow: FlowId, o: { drafts?: boolean } = {}): FormRow[] => s.rows.filter((x) => x.flow === flow && (o.drafts || !x.draft));
export const draftOf = (s: HostState, flow: FlowId, userId: string): FormRow | undefined => s.rows.find((x) => x.flow === flow && x.draft && x.createdBy === userId);

export const clone = <T>(x: T): T => (x === undefined ? x : (JSON.parse(JSON.stringify(x)) as T));

/** A JSON snapshot of the whole state (window.__kfState()). */
export function snapshot(s: HostState): HostState {
  return clone(s);
}
