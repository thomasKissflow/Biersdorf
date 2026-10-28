// Host parameters (WORKBENCH-DESIGN.md §11.2): identity, list shapes, the task engine and every deliberately unkind
// mode. Defaults come first in each list. An unknown parameter value throws, so a typo in a scenario fails loudly
// instead of silently running the kind default.
import { FLOWS, type FlowId } from "../schema/generated";

export const APP_ID_DIGITAL = "CIQ_Digital_A00";

export interface RaceMode {
  /** A flow id (header keys are dropped) or "child" (child-row adds are dropped). */
  target: FlowId | "child";
  /** How many updates are affected; "always" = every one. */
  n: number | "always";
}

export interface HostParams {
  /** Fixture user id (fixtures.ts USERS). */
  user: string;
  /** The container the handshake answers. Any write with CIQ_Supplier_Portal_A00 fails the scenario (S38). */
  appId: string;
  /** GET_ROLES answers {roles, currentRoles} (a Development account may answer anyone, sdk.d.ts L1297). */
  dev: boolean;
  envelope: "live" | "items" | "Data";
  rows: "full" | "sparse";
  participated: "error" | "ok";
  adminList: "ok" | "refuse";
  caseAdminFlowAdmin: boolean;
  /** A user id granted flow Admin on the 3 processes for this run. */
  flowAdmin: string | null;
  /** Admin list rows carry no _current_step (live, UI-LOG L43) unless "row". */
  adminStep: "omit" | "row";
  /** Extra generated cases (paging). */
  extra: number;
  /** The dev user's task list puts C4's 3 Part 2 activities across the 50-row page boundary. */
  multiAct: boolean;
  stepkey: "_current_step" | "none" | "block" | "first";
  /** PROCESS_GET_PROGRESS answers (activity ids and names) [harness assumption]. */
  progress: boolean;
  /** K-FA: CASE_S1 assigned from Owner_RMM, OPNT_S1 from Responsible_User. */
  kfa: boolean;
  kwb: "ok" | "refuse";
  sendback: "ok" | "500";
  reject: "ok" | "refuse";
  openForm: "ok" | "hang" | "refuse";
  race: RaceMode | null;
  writeDelay: number;
  writeDelayOnce: boolean;
  /** Harness addition: delays read answers, so the number of reads in flight can be observed (S33). */
  readDelay: number;
  drafts: "strict" | "sticky";
  formSubmit: "ok" | "fail";
  formSubmitId: "same" | "new";
  formDrop: { flow: FlowId; field: string } | null;
  childIds: "client" | "server";
  childFormula: boolean;
  countsPolicy: "fail-closed" | "attest" | null;
  delayInit: number;
  ignoreInits: number;
  /** Harness addition [unverified live]: Dataform discard without a draft answers an error ("error") or {}. */
  noDraft: "error" | "ok";
  /** Harness addition (fixture variant): C4's SAF RMES sheet partly filled (§11.3, default) or complete (gaps 0, so
   *  a lane run such as S12a/S12b can reach gate OK without first driving the RMES screen). */
  c4Rmes: "partial" | "complete";
  /** Harness addition: role names in AppRoles and GET_ROLES, the prototype names (default) or the names before the
   *  live rename ("CIQ RMM", …), to prove the legacy-name match. */
  roleNames: "prototype" | "legacy";
  /** Harness addition (fixture variant): the Rule set is a Draft (default) or a Published v1 with fictional rules and no
   *  draft (never in the release manifest, so S2 still records "none (manual-wb-1)"). */
  ruleSet: "draft" | "published";
}

export const DEFAULT_PARAMS: HostParams = {
  user: "dev",
  appId: APP_ID_DIGITAL,
  dev: true,
  envelope: "live",
  rows: "full",
  participated: "error",
  adminList: "ok",
  caseAdminFlowAdmin: false,
  flowAdmin: null,
  adminStep: "omit",
  extra: 0,
  multiAct: false,
  stepkey: "_current_step",
  progress: true,
  kfa: false,
  kwb: "ok",
  sendback: "ok",
  reject: "ok",
  openForm: "ok",
  race: null,
  writeDelay: 0,
  writeDelayOnce: false,
  readDelay: 0,
  drafts: "strict",
  formSubmit: "ok",
  formSubmitId: "same",
  formDrop: null,
  childIds: "client",
  childFormula: true,
  countsPolicy: null,
  delayInit: 0,
  ignoreInits: 0,
  noDraft: "error",
  c4Rmes: "partial",
  roleNames: "prototype",
  ruleSet: "draft",
};

/** Query keys the host reads that are not host modes (the runner's reload counter, the UI url). */
const IGNORED = new Set(["n", "ui", "bar"]);

const bool = (k: string, v: string): boolean => {
  if (["1", "on", "true", "yes"].includes(v)) return true;
  if (["0", "off", "false", "no"].includes(v)) return false;
  throw new Error(`host param ${k}=${v}: expected 1/0 or on/off`);
};
const oneOf = <T extends string>(k: string, v: string, allowed: readonly T[]): T => {
  if ((allowed as readonly string[]).includes(v)) return v as T;
  throw new Error(`host param ${k}=${v}: expected one of ${allowed.join(", ")}`);
};
const int = (k: string, v: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) throw new Error(`host param ${k}=${v}: expected a whole number ≥ 0`);
  return n;
};
const flow = (k: string, v: string): FlowId => {
  if (v in FLOWS) return v as FlowId;
  throw new Error(`host param ${k}: unknown flow ${v}`);
};

/** Parses URL query parameters into host parameters. `dev` defaults to on for the "dev" user only (§11.2). */
export function parseParams(q: URLSearchParams | Record<string, string>): HostParams {
  const entries: [string, string][] = q instanceof URLSearchParams ? [...q.entries()] : Object.entries(q);
  const p: HostParams = { ...DEFAULT_PARAMS };
  let devSet = false;
  for (const [k, v] of entries) {
    switch (k) {
      case "user":
        p.user = v;
        break;
      case "appId":
        p.appId = v;
        break;
      case "dev":
        p.dev = bool(k, v);
        devSet = true;
        break;
      case "envelope":
        p.envelope = oneOf(k, v, ["live", "items", "Data"] as const);
        break;
      case "rows":
        p.rows = oneOf(k, v, ["full", "sparse"] as const);
        break;
      case "participated":
        p.participated = oneOf(k, v, ["error", "ok"] as const);
        break;
      case "adminList":
        p.adminList = oneOf(k, v, ["ok", "refuse"] as const);
        break;
      case "caseAdminFlowAdmin":
        p.caseAdminFlowAdmin = bool(k, v);
        break;
      case "flowAdmin":
        p.flowAdmin = v || null;
        break;
      case "adminStep":
        p.adminStep = oneOf(k, v, ["omit", "row"] as const);
        break;
      case "extra":
        p.extra = int(k, v);
        break;
      case "multiAct":
        p.multiAct = bool(k, v);
        break;
      case "stepkey":
        p.stepkey = oneOf(k, v, ["_current_step", "none", "block", "first"] as const);
        break;
      case "progress":
        p.progress = bool(k, v);
        break;
      case "kfa":
        p.kfa = bool(k, v);
        break;
      case "kwb":
        p.kwb = oneOf(k, v, ["ok", "refuse"] as const);
        break;
      case "sendback":
        p.sendback = oneOf(k, v, ["ok", "500"] as const);
        break;
      case "reject":
        p.reject = oneOf(k, v, ["ok", "refuse"] as const);
        break;
      case "openForm":
        p.openForm = oneOf(k, v, ["ok", "hang", "refuse"] as const);
        break;
      case "race": {
        const m = /^([A-Za-z0-9_]+):(\d+|always)$/.exec(v);
        if (!m) throw new Error(`host param race=${v}: expected <flow>:<n>, <flow>:always or child:<n>`);
        p.race = { target: m[1] === "child" ? "child" : flow(k, m[1]), n: m[2] === "always" ? "always" : Number(m[2]) };
        break;
      }
      case "writeDelay":
        p.writeDelay = int(k, v);
        break;
      case "writeDelayOnce":
        p.writeDelayOnce = bool(k, v);
        break;
      case "readDelay":
        p.readDelay = int(k, v);
        break;
      case "drafts":
        p.drafts = oneOf(k, v, ["strict", "sticky"] as const);
        break;
      case "formSubmit":
        p.formSubmit = oneOf(k, v, ["ok", "fail"] as const);
        break;
      case "formSubmitId":
        p.formSubmitId = oneOf(k, v, ["same", "new"] as const);
        break;
      case "formDrop": {
        const m = /^([A-Za-z0-9_]+):([A-Za-z0-9_]+)$/.exec(v);
        if (!m) throw new Error(`host param formDrop=${v}: expected <flow>:<field>`);
        p.formDrop = { flow: flow(k, m[1]), field: m[2] };
        break;
      }
      case "childIds":
        p.childIds = oneOf(k, v, ["client", "server"] as const);
        break;
      case "childFormula":
        p.childFormula = bool(k, v);
        break;
      case "countsPolicy":
        p.countsPolicy = oneOf(k, v, ["fail-closed", "attest"] as const);
        break;
      case "delayInit":
        p.delayInit = int(k, v);
        break;
      case "ignoreInits":
        p.ignoreInits = int(k, v);
        break;
      case "noDraft":
        p.noDraft = oneOf(k, v, ["error", "ok"] as const);
        break;
      case "c4Rmes":
        p.c4Rmes = oneOf(k, v, ["partial", "complete"] as const);
        break;
      case "roleNames":
        p.roleNames = oneOf(k, v, ["prototype", "legacy"] as const);
        break;
      case "ruleSet":
        p.ruleSet = oneOf(k, v, ["draft", "published"] as const);
        break;
      default:
        if (!IGNORED.has(k)) throw new Error(`unknown host param ${k}`);
    }
  }
  if (!devSet) p.dev = p.user === "dev";
  return p;
}
