// What the data console has read this session (26 Oct, after Thomas's "429 Too Many Requests"): every flow's list, read
// ONCE (the overview's counts and the flow pages share it; Refresh reads again), and the current step of a process item
// (an admin list row has none, CAFM D55), read only when asked ("Show steps", for the rows on the table's current page)
// or taken from the drawer's full read, kept per item id + status. A write changes the list here instead of reading it
// again: a delete removes the row, an edit or a create puts the item as Kissflow read it back. Everything lives as long
// as the console's client (a role switch starts a new session). The CIQ screens' own reads are not seen here, so a page
// says when its list was read and offers Refresh.
import { useEffect, useSyncExternalStore } from "react";
import { errorText } from "@/portal/kf/sdk";
import { str, type RawItem } from "@/portal/data/raw";
import { CONSOLE_IN_FLIGHT, RateLimitError, pool } from "../kf/client";
import type { AppClient, FlowKey, ProcessKey } from "../types";
import { isProcess } from "./common";

export interface ListState {
  /** Being read (or never read yet: the page asks for it). */
  loading: boolean;
  /** The rows as last read (kept when a later read fails). */
  rows?: RawItem[];
  /** Why the last read failed. */
  error?: string;
  /** When the rows were read (ISO). */
  readAt?: string;
}

/** A list never asked for: shown as loading (the page asks for it at once). */
const NOT_READ: ListState = { loading: true };

export interface StepRead {
  /** Steps read now. */
  read: number;
  /** The first failure, if any (a failed read is not kept: Show steps asks again). */
  error?: string;
}

const stepKey = (r: RawItem) => `${r._id}|${str(r, "_status")}`;

export class ConsoleSession {
  private readonly lists = new Map<FlowKey, ListState>();
  private readonly inflight = new Map<FlowKey, Promise<void>>();
  private readonly steps = new Map<FlowKey, Map<string, string>>();
  private readonly pendingSteps = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(
    readonly client: AppClient,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  // ---- subscription (useSyncExternalStore)
  readonly subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  readonly getVersion = (): number => this.version;
  private emit() {
    this.version++;
    for (const l of this.listeners) l();
  }
  private setList(flow: FlowKey, s: ListState) {
    this.lists.set(flow, s);
    this.emit();
  }

  // ---- lists
  /** The flow's list as read this session (NOT_READ when never asked for). */
  list(flow: FlowKey): ListState {
    return this.lists.get(flow) ?? NOT_READ;
  }
  /** Reads the list once a session: nothing when it was read (or failed: Refresh reads again) or is being read. */
  ensure(flow: FlowKey): void {
    if (!this.lists.has(flow)) void this.refresh(flow);
  }
  /** Reads the list (again). A process's kept steps are dropped: the user asked for what Kissflow holds now. */
  refresh(flow: FlowKey): Promise<void> {
    const running = this.inflight.get(flow);
    if (running) return running;
    const prev = this.lists.get(flow);
    this.setList(flow, { loading: true, ...(prev?.rows ? { rows: prev.rows, readAt: prev.readAt } : {}) });
    const job = (async () => {
      try {
        const rows = await (isProcess(flow) ? this.client.adminList(flow) : this.client.formList(flow));
        this.steps.delete(flow);
        this.setList(flow, { loading: false, rows, readAt: this.now() });
      } catch (e) {
        const was = this.lists.get(flow);
        this.setList(flow, { loading: false, error: errorText(e), ...(was?.rows ? { rows: was.rows, readAt: was.readAt } : {}) });
      } finally {
        this.inflight.delete(flow);
      }
    })();
    this.inflight.set(flow, job);
    return job;
  }
  /** Rows read elsewhere (the import's fresh read before its first create): kept as the flow's list. */
  setRows(flow: FlowKey, rows: RawItem[]): void {
    this.setList(flow, { loading: false, rows, readAt: this.now() });
  }
  /** A deleted item leaves the list (no read). */
  removeRow(flow: FlowKey, id: string): void {
    const s = this.lists.get(flow);
    if (!s?.rows?.some((r) => r._id === id)) return;
    this.setList(flow, { ...s, rows: s.rows.filter((r) => r._id !== id) });
  }
  /** An item as Kissflow read it back after a write: replaces its row, or joins the list (no read). */
  putRow(flow: FlowKey, item: RawItem): void {
    if (isProcess(flow)) this.noteStep(flow, item);
    const s = this.lists.get(flow);
    if (!s?.rows) return; // never read: the first read will have it
    const i = s.rows.findIndex((r) => r._id === item._id);
    const rows = i < 0 ? [item, ...s.rows] : s.rows.map((r, k) => (k === i ? item : r));
    this.setList(flow, { ...s, rows });
  }

  // ---- current steps of process items
  /** The step kept for this row (by its id and status), if any. */
  stepOf(flow: ProcessKey, r: RawItem): string | undefined {
    return this.steps.get(flow)?.get(stepKey(r));
  }
  /** Whether this row's step is being read now. */
  readingStep(r: RawItem): boolean {
    return this.pendingSteps.has(r._id);
  }
  /** A full read (the drawer's, a write's read-back) gives the step for free. */
  noteStep(flow: ProcessKey, item: RawItem): void {
    const step = str(item, "_current_step");
    if (!step) return;
    let m = this.steps.get(flow);
    if (!m) this.steps.set(flow, (m = new Map()));
    if (m.get(stepKey(item)) === step) return;
    m.set(stepKey(item), step);
    this.emit();
  }
  /** Reads the step of each row that has none kept, CONSOLE_IN_FLIGHT at a time (the client's limiter holds the console
   *  to that anyway). A rate-limited read stops the rest. */
  async readSteps(flow: ProcessKey, rows: RawItem[]): Promise<StepRead> {
    const todo = rows.filter((r) => !str(r, "_current_step") && this.stepOf(flow, r) === undefined && !this.pendingSteps.has(r._id));
    if (!todo.length) return { read: 0 };
    for (const r of todo) this.pendingSteps.add(r._id);
    this.emit();
    let read = 0;
    let error: string | undefined;
    let limited = false;
    await pool(todo, CONSOLE_IN_FLIGHT, async (r) => {
      try {
        if (limited) return;
        const it = await this.client.adminGet(flow, r._id);
        let m = this.steps.get(flow);
        if (!m) this.steps.set(flow, (m = new Map()));
        // kept under the LIST row's status: the row that shows it
        m.set(stepKey(r), str(it, "_current_step") || "—");
        read++;
      } catch (e) {
        if (e instanceof RateLimitError) limited = true;
        error ??= errorText(e);
      } finally {
        this.pendingSteps.delete(r._id);
        this.emit();
      }
    });
    return { read, ...(error ? { error } : {}) };
  }
}

/** "Read at 10:42" for a list's header ("Reading…" while it is read). */
export function readAtText(s: ListState): string {
  if (s.loading) return s.rows ? "Reading again…" : "Reading…";
  if (!s.readAt) return "";
  const d = new Date(s.readAt);
  return `Read at ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The flow's list, read once a session (useSyncExternalStore over the session); `refresh` reads it again. */
export function useFlowList(session: ConsoleSession, flow: FlowKey): ListState & { refresh: () => Promise<void> } {
  const state = useSyncExternalStore(
    session.subscribe,
    () => session.list(flow),
    () => session.list(flow),
  );
  useEffect(() => session.ensure(flow), [session, flow]);
  return { ...state, refresh: () => session.refresh(flow) };
}

/** Re-renders on every change of the session (kept steps, lists). */
export function useSessionVersion(session: ConsoleSession): number {
  return useSyncExternalStore(session.subscribe, session.getVersion, session.getVersion);
}
