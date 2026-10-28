// Typed helpers over the generated schema (WORKBENCH-DESIGN.md §4.5). Everything that needs a backend id goes through
// generated.ts; this module only adds lookups. None of permsAt / mandatoryAt / editableAt ever returns a computed field.
import {
  ADMIN_WRITE_ALLOW,
  APP_ID,
  CHILD_TABLES,
  CR_DEPT_FIELDS,
  DEPTS,
  DEPT_STEPS,
  FIELDS,
  FLOWS,
  GRANTS,
  LANE_FIELDS,
  LISTS,
  POST_CREATE_KEYS,
  ROLES,
  SPEC,
  STEPS,
  STEP_BY_NAME,
  SWITCHES,
  type ChildTableId,
  type Dept,
  type FlowId,
  type RoleIr,
  type StepIr,
} from "./generated";

export { APP_ID, DEPTS, SPEC };
export type { ChildTableId, Dept, FlowId, RoleIr, StepIr };

export type FieldType = "Text" | "Number" | "User" | "Select" | "Email" | "Date" | "Textarea" | "DateTime" | "Attachment" | "Reference";
export interface FieldDef {
  id: string;
  name: string;
  type: FieldType;
  list?: string;
  formula?: string;
  computed?: boolean;
  required?: boolean;
  ref?: string;
}
export type StepKind = "Start" | "UserTask" | "Parallel" | "End";
export type Perm = "Mandatory" | "Editable";
export interface StepDef {
  flow: FlowId;
  irId: StepIr;
  name: string;
  kind: StepKind;
  ownerRole: RoleIr | null;
  fieldAssigned?: string;
  condition?: string;
  parallel?: { block: StepIr; branchIndex: number };
  order: number;
  serverActivityId: string | null;
  perms: Readonly<Record<string, Perm>>;
  gates: readonly string[];
}
export interface ChildTableDef {
  flow: FlowId;
  id: ChildTableId;
  name: string;
  serverModelId: string | null;
  fields: Readonly<Record<string, FieldDef>>;
}
export type GrantCell = "I" | "M" | "E" | "V" | "A" | "—";
export interface Grant {
  cell: GrantCell;
  capability: string;
  steps?: Readonly<Record<string, string>>;
}
export interface RoleDef {
  irId: RoleIr;
  /** The prototype's persona name, shown to users. */
  name: string;
  /** The live role name before the rename (matched until the rename is applied). */
  legacyName: string | null;
  /** The prototype persona id; null for the platform defaults and the technical roles. */
  persona: string | null;
  /** Case administrator, Integration service: not personas. */
  technical: boolean;
  journeys: readonly string[];
  landing: string;
  serverId: string | null;
}

// Widened views of the `as const` data (string keys, nullable server ids).
const FIELDS_W = FIELDS as unknown as Record<FlowId, Record<string, FieldDef>>;
const STEPS_W = STEPS as unknown as Record<StepIr, StepDef>;
const TABLES_W = CHILD_TABLES as unknown as Record<ChildTableId, ChildTableDef>;
const GRANTS_W = GRANTS as unknown as Record<RoleIr, Record<FlowId, Grant>>;
const ROLES_W = ROLES as unknown as Record<RoleIr, RoleDef>;
const STEP_BY_NAME_W = STEP_BY_NAME as unknown as Record<FlowId, Record<string, StepIr>>;
const LISTS_W = LISTS as unknown as Record<string, readonly string[]>;

export class LocalGuardError extends Error {
  constructor(message: string) {
    super(`Workbench guard: ${message}`);
    this.name = "LocalGuardError";
  }
}

export const flowIds = (): FlowId[] => Object.keys(FLOWS) as FlowId[];
export const processFlows = (): FlowId[] => flowIds().filter((f) => FLOWS[f].kind === "Process");
export const formFlows = (): FlowId[] => flowIds().filter((f) => FLOWS[f].kind === "Form");
export const isProcess = (flow: FlowId): boolean => FLOWS[flow].kind === "Process";
export const flowName = (flow: FlowId): string => FLOWS[flow].name;
export const isFlowId = (x: unknown): x is FlowId => typeof x === "string" && x in FLOWS;

export const stepDef = (ir: StepIr): StepDef => STEPS_W[ir];
export const isStepIr = (x: unknown): x is StepIr => typeof x === "string" && x in STEPS;
export const allSteps = (): StepDef[] => Object.values(STEPS_W);
export const stepsOf = (flow: FlowId): StepDef[] => allSteps().filter((s) => s.flow === flow).sort((a, b) => a.order - b.order);
export const startStep = (flow: FlowId): StepDef => {
  const s = stepsOf(flow).find((x) => x.kind === "Start");
  if (!s) throw new LocalGuardError(`${flow} has no Start step`);
  return s;
};

/** The IR id of a task step by (flow, exact name). Null for unknown names and for Parallel and End steps: a task
 *  never resolves to them (§4.5; WB-6). */
export function stepOf(flow: FlowId, name: string | null | undefined): StepIr | null {
  if (!name) return null;
  const ir = STEP_BY_NAME_W[flow]?.[name];
  if (!ir) return null;
  const k = STEPS_W[ir].kind;
  return k === "Parallel" || k === "End" ? null : ir;
}
/** Any step (Parallel included) by exact name: for item positions, never for tasks. */
export const anyStepOf = (flow: FlowId, name: string | null | undefined): StepIr | null => (name ? (STEP_BY_NAME_W[flow]?.[name] ?? null) : null);
export const parallelBlockOf = (flow: FlowId, name: string | null | undefined): StepIr | null => {
  const ir = anyStepOf(flow, name);
  return ir && STEPS_W[ir].kind === "Parallel" ? ir : null;
};
export const branchStepsOf = (block: StepIr): StepDef[] => allSteps().filter((s) => s.parallel?.block === block);

export const permsAt = (ir: StepIr): string[] => Object.keys(STEPS_W[ir].perms);
export const mandatoryAt = (ir: StepIr): string[] => Object.entries(STEPS_W[ir].perms).filter(([, p]) => p === "Mandatory").map(([k]) => k);
export const editableAt = (ir: StepIr): string[] => Object.entries(STEPS_W[ir].perms).filter(([, p]) => p === "Editable").map(([k]) => k);
export const gateFieldsAt = (ir: StepIr): string[] => [...STEPS_W[ir].gates];

export function fieldDef(flow: FlowId, id: string): FieldDef | undefined {
  const h = FIELDS_W[flow]?.[id];
  if (h) return h;
  for (const t of tablesOf(flow)) if (t.fields[id]) return t.fields[id];
  return undefined;
}
export const headerFields = (flow: FlowId): FieldDef[] => Object.values(FIELDS_W[flow]);
export const isHeaderField = (flow: FlowId, id: string): boolean => !!FIELDS_W[flow]?.[id];
export const isComputed = (flow: FlowId, id: string): boolean => !!fieldDef(flow, id)?.computed;
export const fieldType = (flow: FlowId, id: string): FieldType | undefined => fieldDef(flow, id)?.type;
export const fieldLabel = (flow: FlowId, id: string): string => fieldDef(flow, id)?.name ?? TABLES_W[id as ChildTableId]?.name ?? id;
export const requiredFormFields = (flow: FlowId): string[] => headerFields(flow).filter((f) => f.required).map((f) => f.id);
export const listValues = (listId: string): string[] => [...(LISTS_W[listId] ?? [])];
export const listOf = (flow: FlowId, id: string): string[] => {
  const l = fieldDef(flow, id)?.list;
  return l ? listValues(l) : [];
};

export const tablesOf = (flow: FlowId): ChildTableDef[] => Object.values(TABLES_W).filter((t) => t.flow === flow);
export const isChildTable = (flow: FlowId, id: string): id is ChildTableId => TABLES_W[id as ChildTableId]?.flow === flow;
export const childTableDef = (id: ChildTableId): ChildTableDef => TABLES_W[id];
/** The write/read key of a child table: Table::<server child model id, else the spec id> (§4.4; unverified until read-back). */
export function childTableOf(flow: FlowId, id: ChildTableId): { key: string; modelId: string; def: ChildTableDef } {
  const def = TABLES_W[id];
  if (!def || def.flow !== flow) throw new LocalGuardError(`${id} is not a child table of ${flow}`);
  const modelId = def.serverModelId ?? def.id;
  return { key: `Table::${modelId}`, modelId, def };
}

/** False for every computed field, whatever the step (WB-13), and for anything ReadOnly at the step. */
export function isWritableAt(ir: StepIr, key: string): boolean {
  const s = STEPS_W[ir];
  if (isComputed(s.flow, key)) return false;
  return !!s.perms[key];
}
/** Throws LocalGuardError when any key is not writable at the step: a code bug, loud (§7.2). */
export function assertWritable(ir: StepIr, keys: string[]): void {
  const s = STEPS_W[ir];
  const computed = keys.filter((k) => isComputed(s.flow, k));
  if (computed.length) throw new LocalGuardError(`computed field(s) ${computed.join(", ")} can never be written (${ir})`);
  const bad = keys.filter((k) => !s.perms[k]);
  if (bad.length) throw new LocalGuardError(`${bad.join(", ")} not writable at ${ir} (${s.name})`);
}

export const ownerRole = (ir: StepIr): RoleIr | null => STEPS_W[ir].ownerRole;
/** Steps a role owns. NAVIGATION ONLY: actions are gated on task possession (ground rule 13). */
export const stepsOwnedBy = (role: RoleIr): StepIr[] => allSteps().filter((s) => s.ownerRole === role && (s.kind === "UserTask" || s.kind === "Start")).map((s) => s.irId);
export const switchesAt = (ir: StepIr): { reject: boolean; sendBack: boolean } => (SWITCHES as Record<string, { reject: boolean; sendBack: boolean }>)[ir] ?? { reject: false, sendBack: false };

export const roleDef = (ir: RoleIr): RoleDef => ROLES_W[ir];
export const allRoles = (): RoleDef[] => Object.values(ROLES_W);
/** By display name, then by the name before the live rename. */
export const roleByName = (name: string): RoleDef | undefined => (name ? (allRoles().find((r) => r.name === name) ?? allRoles().find((r) => r.legacyName === name)) : undefined);
/** An AppRoles / getRoles entry → its role: by live role id first, then display name, then legacyName (works before
 *  and after the live rename). */
export function roleOf(r: { _id?: unknown; Name?: unknown } | null | undefined): RoleDef | undefined {
  const id = typeof r?._id === "string" ? r._id : "";
  return (id ? allRoles().find((x) => x.serverId === id) : undefined) ?? roleByName(typeof r?.Name === "string" ? r.Name : "");
}
export const grantOf = (role: RoleIr, flow: FlowId): Grant => GRANTS_W[role]?.[flow] ?? { cell: "—", capability: "" };

export interface DeptSteps {
  reviewerRole: RoleIr;
  caseLaneStep: StepIr;
  opReviewStep: StepIr;
  crAssessStep: StepIr | null;
}
export const deptSteps = (d: Dept): DeptSteps => (DEPT_STEPS as unknown as Record<Dept, DeptSteps>)[d];
export const isDept = (x: unknown): x is Dept => typeof x === "string" && (DEPTS as readonly string[]).includes(x);
export const deptOfLaneStep = (ir: StepIr): Dept | null => DEPTS.find((d) => deptSteps(d).caseLaneStep === ir) ?? null;
export const deptOfOpReviewStep = (ir: StepIr): Dept | null => DEPTS.find((d) => deptSteps(d).opReviewStep === ir) ?? null;
export const deptOfCrAssessStep = (ir: StepIr): Dept | null => DEPTS.find((d) => deptSteps(d).crAssessStep === ir) ?? null;

export interface CrDeptFields {
  impact: string;
  assessment: string;
  note: string;
  by: string;
  at: string;
}
export const crDeptFields = (d: Dept): CrDeptFields | null => (CR_DEPT_FIELDS as unknown as Partial<Record<Dept, CrDeptFields>>)[d] ?? null;
export const laneFields = (d: Dept): string[] => [...(LANE_FIELDS as unknown as Record<Dept, readonly string[]>)[d]];
export const postCreateKeys = (flow: FlowId): string[] => [...((POST_CREATE_KEYS as unknown as Partial<Record<FlowId, readonly string[]>>)[flow] ?? [])];
export const adminRepairFields = (d: Dept): string[] => [...ADMIN_WRITE_ALLOW["lane.repair"].fields[d]];
export const ADMIN_REPAIR_FLOW: FlowId = ADMIN_WRITE_ALLOW["lane.repair"].flow;
