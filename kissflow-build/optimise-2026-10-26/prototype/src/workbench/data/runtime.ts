// The runtime every action runs against: client, queue, session, pending sheets, the signed-in user, the held tasks
// (after the lens) and the read rung per flow. The WorkbenchData provider builds one and binds it (bindRuntime) so the
// §12.2 action signatures need no runtime argument; tests build their own with a fake client.
import { isProcess, type FlowId, type StepIr } from "../schema";
import type { Flags } from "../domain/flags";
import { DEFAULT_FLAGS } from "../domain/flags";
import type { Caps } from "../kf/app";
import { errorText } from "../kf/sdk";
import { pool, type RawItem, type ViewerRoute, type WbClient } from "./client";
import type { PendingStore } from "./pendingSheet";
import type { SessionState } from "./session";
import { findHeldTask } from "./tasks";
import type { CaseVM, ListRead, TaskVM } from "./viewModels";
import type { WriteQueue } from "./writeQueue";

export interface Me {
  _id: string;
  Name: string;
  Email: string;
}

export interface Runtime {
  client: WbClient;
  queue: WriteQueue;
  session: SessionState;
  pending: PendingStore;
  me: Me;
  /** Capabilities after the lens. */
  caps(): Caps;
  /** True while the "View as" lens narrows the roles. */
  lensActive(): boolean;
  /** Held tasks after the lens (the gate for every step action). */
  tasks(): TaskVM[];
  flagsFor(c: CaseVM): Flags;
  now(): Date;
  rnd(): number;
  /** Rung 2 probe; null until Diagnostics proves a viewer route live (K-14). */
  viewerRoute: ViewerRoute | null;
  /** Called after a write that changes server state (reload tasks and bundles). */
  changed(): void;
}

export function heldTaskIn(rt: Runtime, flow: FlowId, instanceId: string, step?: StepIr | null): TaskVM | null {
  return findHeldTask(rt.tasks(), flow, instanceId, step);
}

/** Rung 1 may be tried for this flow (not skipped by the lens, not refused earlier this session). */
export function adminRungAllowed(rt: Runtime, flow: FlowId): boolean {
  if (rt.lensActive() && !rt.caps().hasFlowAdmin(flow)) return false;
  return !rt.session.adminRefused.has(flow);
}

/** A Process list through the ladder (§6.2), or a Form list (quality "form"/"failed"). */
export async function readList(rt: Runtime, flow: FlowId): Promise<ListRead<RawItem>> {
  if (!isProcess(flow)) {
    try {
      const rows = await rt.client.formList(flow);
      return { rows, quality: "form", indexOnly: new Set(), warnings: [] };
    } catch (e) {
      return { rows: [], quality: "failed", indexOnly: new Set(), warnings: [`${flow}: ${errorText(e)}`] };
    }
  }
  const skipAdmin = !adminRungAllowed(rt, flow);
  const r = await rt.client.readLadder(flow, { skipAdmin, viewer: rt.session.viewerRouteProven ? rt.viewerRoute : null });
  const adminTry = r.tried.find((t) => t.rung === "admin");
  if (!skipAdmin && adminTry && !adminTry.ok) rt.session.adminRefused.add(flow);
  rt.session.rungs.set(flow, r.quality);
  return { rows: r.rows, quality: r.quality, indexOnly: new Set(), warnings: r.warnings, viewerProven: r.quality === "viewer" && rt.session.viewerRouteProven };
}

/**
 * Rung-1 rows carry no current step (UI-LOG L43) and may be sparse: read each OPEN row (status In progress or absent)
 * per item with getAdminItem, pool of 4. Rows that fail stay as they were (row quality) and are reported.
 */
export async function fillAdminRows(rt: Runtime, flow: FlowId, rows: RawItem[], need: (r: RawItem) => boolean): Promise<{ rows: RawItem[]; full: Set<string>; warnings: string[] }> {
  const want = rows.filter(need);
  const full = new Set<string>();
  const warnings: string[] = [];
  const got = await pool(want, 4, (r) => rt.client.getAdminItem(flow, r._id));
  const byId = new Map<string, RawItem>();
  got.forEach((g, i) => {
    if (g.status === "fulfilled") {
      byId.set(want[i]._id, g.value);
      full.add(want[i]._id);
    } else warnings.push(`${want[i]._id}: ${errorText(g.reason)}`);
  });
  return { rows: rows.map((r) => byId.get(r._id) ?? r), full, warnings };
}

// ---------------------------------------------------------------- binding for the §12.2 module-level actions

let bound: Runtime | null = null;
export function bindRuntime(rt: Runtime | null): void {
  bound = rt;
}
export function boundRuntime(): Runtime {
  if (!bound) throw new Error("The Workbench is not connected yet.");
  return bound;
}

/** A minimal runtime for tests and the harness: no lens, default flags, fixed clock. */
export function testRuntime(p: Partial<Runtime> & Pick<Runtime, "client" | "queue" | "session" | "pending" | "me">): Runtime {
  return {
    caps: () => ({ roles: new Set(), canInitiate: () => false, canEditForm: () => false, canView: () => true, ownsStep: () => false, reviewerDepts: [], rmesEditorOf: new Set(), isCaseAdmin: false, hasFlowAdmin: () => false }),
    lensActive: () => false,
    tasks: () => [],
    flagsFor: () => DEFAULT_FLAGS,
    now: () => new Date("2026-10-08T10:00:00Z"),
    rnd: Math.random,
    viewerRoute: null,
    changed: () => {},
    ...p,
  };
}
