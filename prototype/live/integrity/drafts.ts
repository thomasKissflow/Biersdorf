// The flows' metadata for S-INTEGRITY, from the read-only snapshot of 21 Oct 02:29 IST (kissflow-build/night-2026-10-21/
// snapshot/: each flow's list row and draft, every role with its members) wherever it is still current, so a live run
// reads a flow's draft again only when the live flow list shows it changed after the snapshot (SPEC §4: prefer the
// files on disk). The draft is what the metadata route gives: the flow's fields (Kind "Field", Model = the flow or one
// of its child tables), child tables (Kind "Model"), steps (Kind "Activity"), formulas (Kind "Expression") and the
// per-step permissions (Kind "Permission" on a layout column, whose "Column::Field" names the fields).
// Offline, offlineAnswer serves the flow lists, role lists and drafts from the same snapshot (the shapes as read live).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** kissflow-build/night-2026-10-21/snapshot/ */
export const SNAPSHOT_DIR = fileURLToPath(new URL("../../../kissflow-build/night-2026-10-21/snapshot/", import.meta.url));
/** The flow types an app lists (SPEC §4 "every flow in both apps"; "dataform" answers 404, snapshot-requests.jsonl). */
export const FLOW_TYPES = ["process", "form", "list", "integration", "case", "dataset"] as const;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);

/** One snapshot file: `<app>.<type>.<flow>.json`. */
export interface SnapshotFlow {
  file: string;
  type: string;
  name: string;
  /** The flow's row of the live flow list (_modified_at, LastPublishedAt, Status, IsActive, …). */
  list: Obj;
  /** The metadata draft (a list's: its values). */
  draft: unknown;
}

export function snapshotFlow(app: string, type: string, flowId: string, dir = SNAPSHOT_DIR): SnapshotFlow | undefined {
  const file = `${app}.${type}.${flowId}.json`;
  if (!existsSync(dir + file)) return undefined;
  const x = JSON.parse(readFileSync(dir + file, "utf8")) as Obj;
  return { file, type: String(x.type ?? type), name: String(x.name ?? ""), list: isObj(x.list) ? x.list : {}, draft: x.draft };
}

/** The snapshot's index (when it was taken; every role with its members). */
export function snapshotIndex(dir = SNAPSHOT_DIR): { at: string; apps: Record<string, { roles: { _id: string; Name: string; UserCount?: number; Members: { _id: string; Name: string }[] }[] }> } {
  return JSON.parse(readFileSync(`${dir}index.json`, "utf8"));
}

// ---------------------------------------------------------------------------------- one flow's metadata

export interface FlowMeta {
  flowId: string;
  /** Field id → its type ("Text", "User", "MultiUser", "DateTime", …), model (the flow's id or a child table's) and
   *  whether the field itself is Required (on every step, whatever the step's permission says). */
  fields: Map<string, { type: string; model: string; required: boolean }>;
  /** Child table id → its parent model. */
  models: Map<string, string>;
  /** Activity id → its name. */
  activities: Map<string, string>;
  /** Fields Kissflow computes (an Expression). */
  formulas: Set<string>;
  /** Activity id → field → its permission there (Mandatory, Editable, ReadOnly, Hidden). */
  permissions: Map<string, Map<string, string>>;
}

/** A metadata draft as the flow's fields, tables, steps, formulas and permissions. */
export function parseDraft(flowId: string, draft: unknown): FlowMeta {
  const meta: FlowMeta = { flowId, fields: new Map(), models: new Map(), activities: new Map(), formulas: new Set(), permissions: new Map() };
  if (!isObj(draft)) return meta;
  const root = typeof draft.Root === "string" ? draft.Root : flowId;
  const parts = Object.values(draft).filter(isObj);
  for (const p of parts) {
    const id = typeof p.Id === "string" ? p.Id : "";
    if (!id) continue;
    if (p.Kind === "Field") meta.fields.set(id, { type: String(p.Type ?? ""), model: String(p.Model ?? root), required: p.Required === true });
    else if (p.Kind === "Model" && id !== root) meta.models.set(id, String(p.Model ?? root));
    else if (p.Kind === "Activity") meta.activities.set(id, String(p.Name ?? ""));
    else if (p.Kind === "Expression" && typeof p.Field === "string") meta.formulas.add(p.Field);
  }
  for (const p of parts) {
    if (p.Kind !== "Permission" || typeof p.Activity !== "string" || typeof p.Column !== "string") continue;
    const col = draft[p.Column];
    const fields = isObj(col) && Array.isArray(col["Column::Field"]) ? (col["Column::Field"] as unknown[]) : [];
    const perms = meta.permissions.get(p.Activity) ?? new Map<string, string>();
    for (const f of fields) if (typeof f === "string") perms.set(f, String(p.Permission ?? ""));
    meta.permissions.set(p.Activity, perms);
  }
  return meta;
}

/** Whether the snapshot's copy of a flow is still current: the live list row was not modified after it. */
export function snapshotCurrent(snapList: Obj, liveRow: Obj | undefined): boolean {
  const snap = Date.parse(String(snapList._modified_at ?? ""));
  const live = Date.parse(String(liveRow?._modified_at ?? ""));
  return Number.isFinite(snap) && Number.isFinite(live) && live <= snap;
}

/** The flow changed more than a minute after its last publish (a publish itself moves `_modified_at` by a second or
 *  so): a draft edit, whose fields may not be live yet, or a change that is no draft edit (members, grants), which the
 *  list row cannot tell apart. A note, never a failure. */
export function draftAfterPublish(row: Obj | undefined): boolean {
  const mod = Date.parse(String(row?._modified_at ?? ""));
  const pub = Date.parse(String(row?.LastPublishedAt ?? ""));
  return Number.isFinite(mod) && Number.isFinite(pub) && mod - pub > 60_000;
}

// ---------------------------------------------------------------------------------- offline answers

/**
 * OFFLINE ONLY: the read-only routes S-INTEGRITY calls, answered from the snapshot in their live shapes: the flow list
 * of an app and type (the list rows; the integrations' with Status and IsActive as at 02:29), the role list
 * (`{_id, Name, UserCount}`), a flow's metadata draft. Anything else is `undefined`: the caller asks the offline client.
 */
export function offlineAnswer(path: string, dir = SNAPSHOT_DIR): unknown {
  const [p = "", q = ""] = path.split("?");
  const app = new URLSearchParams(q).get("_application_id") ?? "";
  const segs = p.split("/").filter(Boolean);
  if (segs[0] === "flow" && segs.length === 4 && (FLOW_TYPES as readonly string[]).includes(segs[3]!)) {
    const prefix = `${app}.${segs[3]}.`;
    return readdirSync(dir)
      .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
      .sort()
      .map((f) => snapshotFlow(app, segs[3]!, f.slice(prefix.length, -".json".length), dir)!.list);
  }
  if (segs[0] === "app_role" && segs[3] === "list") return (snapshotIndex(dir).apps[app]?.roles ?? []).map((r) => ({ _id: r._id, Name: r.Name, UserCount: r.UserCount ?? r.Members.length }));
  if (segs[0] === "metadata" && segs.length === 6 && segs[5] === "draft") {
    const s = snapshotFlow(app, segs[3]!, segs[4]!, dir);
    if (s) return s.draft;
    throw new Error(`KISSFLOW_ERROR_01015 Document not found (${segs[4]})`);
  }
  return undefined;
}
