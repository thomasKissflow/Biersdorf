// Global checks after every scenario (WORKBENCH-DESIGN.md §11.2), as a pure function over the host's call record.
// The runner adds "no page or console errors" itself (it sees the browser, the host does not).
import { ADMIN_WRITE_ALLOW, FIELDS, type Dept, type FlowId } from "../schema/generated";
import type { RefusalCategory } from "./commands";

export interface CallRecord {
  seq: number;
  /** epoch ms of receipt */
  at: number;
  user: string;
  command: string;
  flowId?: string;
  instanceId?: string;
  activityInstanceId?: string;
  itemId?: string;
  pageNumber?: number;
  pageSize?: number;
  activityId?: string;
  stepId?: string;
  status?: string;
  comment?: string;
  url?: string;
  method?: string;
  /** The write payload (a clone), or the parsed kf.api body. */
  data?: unknown;
  keys?: { fields: string[]; tables: string[]; computed: string[]; ms: string[]; unknown: string[] };
  /** The activity's step, for task-bound commands that were accepted. */
  step?: string;
  refused?: { code: string; message: string; category: RefusalCategory };
  violations?: string[];
  note?: Record<string, unknown>;
  answeredAt?: number;
  noAnswer?: boolean;
  /** CC_INITIALIZE deliberately left unanswered (ignoreInits). */
  ignored?: boolean;
  /** A native-form operation by __kfHost (not an SDK command). */
  native?: boolean;
}

export interface Overlap {
  key: string;
  first: number;
  second: number;
}
export interface Click {
  testId: string;
  at: number;
  /** Calls recorded before the click. */
  afterSeq: number;
}

export interface CheckResult {
  label: string;
  pass: boolean;
  detail?: unknown;
}

export interface GlobalCheckOptions {
  /** S39 only: one allow-listed lane repair through the admin route. */
  allowAdminWrite?: boolean;
  /** Refusal categories this scenario expects (beyond the always-benign ones). */
  expectRefusals?: RefusalCategory[];
}

/** Refusals that are part of normal operation (§6.2 rung 1 is tried by everyone; Diagnostics probes Participated). */
const BENIGN: RefusalCategory[] = ["mode:participated", "mode:progress", "mode:getRoles", "no-draft", "admin-denied"];

const WRITE_RE = /^(PROCESS_(CREATE|UPDATE|UPDATE_ADMIN|SUBMIT|DISCARD|REJECT|WITHDRAW|SENDBACK|DELETE)_ITEM|DATAFORM_(CREATE|UPDATE|SUBMIT|DISCARD|DELETE)_ITEM)$/;
export const isWriteCommand = (c: CallRecord): boolean => WRITE_RE.test(c.command) || (c.command === "API" && !!c.method && c.method.toUpperCase() !== "GET");

const laneAllow = (): Set<string> => {
  const f = ADMIN_WRITE_ALLOW["lane.repair"].fields as unknown as Record<Dept, readonly string[]>;
  return new Set(Object.values(f).flat());
};

export function globalChecks(calls: CallRecord[], overlaps: Overlap[], o: GlobalCheckOptions = {}): CheckResult[] {
  const sdk = calls.filter((c) => !c.native && !c.ignored);
  const out: CheckResult[] = [];
  const add = (label: string, bad: CallRecord[] | unknown[], detail?: (x: never) => unknown) =>
    out.push({ label, pass: bad.length === 0, ...(bad.length ? { detail: (bad as never[]).slice(0, 5).map((x) => (detail ? detail(x) : x)) } : {}) });
  const brief = (c: CallRecord) => `#${c.seq} ${c.command} ${c.flowId ?? ""} ${c.instanceId ?? c.itemId ?? ""}`.trim();

  add("no SWITCH_ROLE", sdk.filter((c) => c.command === "SWITCH_ROLE"), brief);
  add("no *_DELETE_ITEM and no kf.api DELETE", sdk.filter((c) => /_DELETE_ITEM$/.test(c.command) || (c.command === "API" && String(c.method).toUpperCase() === "DELETE")), brief);
  add("no DATAFORM_UPDATE_ITEM on CIQ_Audit_Event_A00 (F8 is create-only)", sdk.filter((c) => c.command === "DATAFORM_UPDATE_ITEM" && c.flowId === "CIQ_Audit_Event_A00"), brief);
  add(
    'no DATAFORM_UPDATE_ITEM on a Published F2 row except exactly { Config_State: "Retired" }',
    sdk.filter((c) => {
      if (c.command !== "DATAFORM_UPDATE_ITEM" || c.flowId !== "CIQ_Config_Version_A00" || c.note?.stateBefore !== "Published") return false;
      const d = (c.data ?? {}) as Record<string, unknown>;
      const keys = Object.keys(d).filter((k) => !k.startsWith("_"));
      return !(keys.length === 1 && d.Config_State === "Retired");
    }),
    brief,
  );
  const admin = sdk.filter((c) => c.command === "PROCESS_UPDATE_ADMIN_ITEM" || (c.command === "API" && /\/admin\//.test(String(c.url)) && String(c.method).toUpperCase() !== "GET"));
  if (!o.allowAdminWrite) add("no UPDATE_ADMIN_ITEM (only S39's lane repair may use the admin route)", admin, brief);
  else {
    const allow = laneAllow();
    add(
      "UPDATE_ADMIN_ITEM carries only allow-listed lane fields (ADMIN_WRITE_ALLOW)",
      admin.filter((c) => c.flowId !== "CIQ_Case_A00" || Object.keys((c.data ?? {}) as object).some((k) => !k.startsWith("_") && !allow.has(k))),
      brief,
    );
  }
  add("no write payload naming a computed field", sdk.filter((c) => isWriteCommand(c) && (c.keys?.computed.length ?? 0) > 0), (c: CallRecord) => `${brief(c)}: ${c.keys!.computed.join(", ")}`);
  add("no write payload holding a DateTime with milliseconds (child rows included)", sdk.filter((c) => isWriteCommand(c) && (c.keys?.ms.length ?? 0) > 0), (c: CallRecord) => `${brief(c)}: ${c.keys!.ms.join(", ")}`);
  add("PROCESS_OPEN_FORM only after a click on wb-kwb-openform", sdk.filter((c) => c.command === "PROCESS_OPEN_FORM" && c.violations?.includes("openForm without a click")), brief);
  add("__kfOverlaps empty (no overlapping writes to one item)", overlaps);
  add("no write in the wrong container", sdk.filter((c) => c.violations?.includes("write in the wrong container")), brief);
  const allowed = new Set<RefusalCategory>([...BENIGN, ...(o.expectRefusals ?? [])]);
  // The re-read after a submit (§6.2, §7.3 step 7) or after a native submit/send-back (§7.4 Re-read) reads the task
  // that just closed: "moved out of your queue" is then the expected answer, not a refusal to report.
  const closed = new Set<string>();
  const postClose = (c: CallRecord) => c.command === "PROCESS_GET_ITEM" && c.refused?.category === "moved-out" && closed.has(`${c.instanceId}|${c.activityInstanceId}`);
  const unexpected: CallRecord[] = [];
  for (const c of calls) {
    if (!c.refused && /^(PROCESS_(SUBMIT|REJECT|SENDBACK)_ITEM|NATIVE_SUBMIT|NATIVE_SENDBACK)$/.test(c.command)) closed.add(`${c.instanceId}|${c.activityInstanceId}`);
    if (c.native || c.ignored || !c.refused) continue;
    if (allowed.has(c.refused.category) || c.refused.category === "forbidden" || c.refused.category === "wrong-container" || postClose(c)) continue;
    unexpected.push(c);
  }
  add(
    "no command refused unless the scenario expects it",
    unexpected,
    (c: CallRecord) => `${brief(c)}: ${c.refused!.category} · ${c.refused!.message}`,
  );
  add("no command the host does not emulate", sdk.filter((c) => c.refused?.category === "not-emulated"), brief);
  return out;
}

/** Creates are serialised (one create lane): a create starts only after the previous one was submitted or discarded. */
export function createLaneOverlaps(calls: CallRecord[]): string[] {
  const bad: string[] = [];
  let open: { seq: number; flow: string; id?: string } | null = null;
  for (const c of calls) {
    if (c.native || c.refused) continue;
    if (c.command === "PROCESS_CREATE_ITEM" || c.command === "DATAFORM_CREATE_ITEM") {
      if (open) bad.push(`#${c.seq} ${c.command} ${c.flowId} while #${open.seq} ${open.flow} was not submitted`);
      open = { seq: c.seq, flow: String(c.flowId), id: typeof c.note?.createdId === "string" ? (c.note.createdId as string) : undefined };
      continue;
    }
    if (open && c.flowId === open.flow && /SUBMIT_ITEM|DISCARD_ITEM/.test(c.command) && (!open.id || c.instanceId === open.id || c.itemId === open.id || c.command === "DATAFORM_DISCARD_ITEM")) open = null;
  }
  return bad;
}

/** Field ids of a flow named in a recorded payload (header keys only). */
export const payloadFields = (c: CallRecord, flow: FlowId): string[] => Object.keys((c.data ?? {}) as object).filter((k) => k in (FIELDS[flow] as object));
