// Roles → capabilities (WORKBENCH-DESIGN.md §5.2–§5.3). Capabilities come only from GRANTS and STEPS.
// Owner roles drive NAVIGATION only; step actions are gated on task possession (data/tasks.ts findHeldTask; ground
// rule 13). Roles match by live role id first, then by the prototype display name, then by the name before the live
// rename (schema roleOf), so the Workbench works before and after the rename.
import { APP_ID, DEPTS, allRoles, deptSteps, grantOf, ownerRole, roleOf, type Dept, type FlowId, type RoleIr, type StepIr } from "../schema";
import { PERSONA_NAV } from "../shell/nav";
import type { KfUser } from "./sdk";

export { APP_ID };

/** CIQ roles that get a UI. ciq_integration_service gets none; the platform defaults are not CIQ roles. Customs, Legal
 *  and Business owner are read-only (their grants copy the Auditor's). */
export const UI_ROLES: RoleIr[] = [
  "ciq_rmm",
  "ciq_regulatory_reviewer",
  "ciq_safety_reviewer",
  "ciq_qm_reviewer",
  "ciq_microbiology_reviewer",
  "ciq_sustainability_reviewer",
  "ciq_overall_approver",
  "ciq_business_admin",
  "ciq_reader",
  "ciq_case_admin",
  "ciq_customs",
  "ciq_legal",
  "ciq_business_owner",
];
const NOT_CIQ: RoleIr[] = ["admin", "user"];

export interface HeldRoles {
  /** CIQ roles the user holds, matched by role id, name or legacy name (integration service included, no UI for it). */
  held: RoleIr[];
  /** AppRoles names that match no role (Diagnostics). */
  unknown: string[];
  /** Platform default roles held (Admin, User). */
  platform: RoleIr[];
  /** SEC-HR2: Case Admin counts only with RMM. */
  warnings: string[];
}

/** Plain wording for a Case administrator role held without the RMM role. */
export const CASE_ADMIN_WITHOUT_RMM =
  "Your Case administrator role only works together with the Raw Material Manager (RMM) role, so Case administrator actions are not shown. Ask the Business administrator to check your roles.";

export function heldRolesOf(user: Pick<KfUser, "AppRoles"> | null | undefined): HeldRoles {
  const held: RoleIr[] = [];
  const platform: RoleIr[] = [];
  const unknown: string[] = [];
  for (const r of user?.AppRoles ?? []) {
    const def = roleOf(r);
    if (!def) {
      if (r?.Name) unknown.push(r.Name);
      continue;
    }
    if (NOT_CIQ.includes(def.irId)) platform.push(def.irId);
    else if (!held.includes(def.irId)) held.push(def.irId);
  }
  const warnings: string[] = [];
  // SEC-HR2: Case Admin counts only with RMM (the rule id stays here and on Diagnostics, never in user text)
  if (held.includes("ciq_case_admin") && !held.includes("ciq_rmm")) warnings.push(CASE_ADMIN_WITHOUT_RMM);
  return { held, unknown, platform, warnings };
}

/** Roles that give the Workbench UI (SEC-HR2 applied: Case Admin only with RMM). */
export function uiRoles(held: RoleIr[]): RoleIr[] {
  return held.filter((r) => UI_ROLES.includes(r) && (r !== "ciq_case_admin" || held.includes("ciq_rmm")));
}

export interface Caps {
  /** After the lens. */
  roles: Set<RoleIr>;
  /** GRANTS cell "I" (Case: RMM; OP: RMM + 5 Reviewers; CR: RMM). */
  canInitiate(flow: FlowId): boolean;
  /** GRANTS cell "E" (Forms). */
  canEditForm(flow: FlowId): boolean;
  /** Anything but "—". */
  canView(flow: FlowId): boolean;
  /** ownerRole(irStep) ∈ roles. NAVIGATION ONLY. */
  ownsStep(ir: StepIr): boolean;
  /** Reviewer departments, plus "RMM" when ciq_rmm is held (for B_RMM / R_RMM). */
  reviewerDepts: Dept[];
  /** Safety → SAF, Regulatory → REG (editing the RMES sheet only; ground rule 7). */
  rmesEditorOf: Set<"SAF" | "REG">;
  /** ciq_case_admin && ciq_rmm. */
  isCaseAdmin: boolean;
  /** GRANTS cell "A" (Case Admin on the 3 Processes), after the lens. */
  hasFlowAdmin(flow: FlowId): boolean;
}

export function capsFor(rolesIn: Iterable<RoleIr>): Caps {
  const roles = new Set(uiRoles([...rolesIn]));
  const cells = (flow: FlowId) => [...roles].map((r) => grantOf(r, flow).cell);
  const reviewerDepts = DEPTS.filter((d) => roles.has(deptSteps(d).reviewerRole));
  const rmesEditorOf = new Set<"SAF" | "REG">();
  if (roles.has("ciq_safety_reviewer")) rmesEditorOf.add("SAF");
  if (roles.has("ciq_regulatory_reviewer")) rmesEditorOf.add("REG");
  return {
    roles,
    canInitiate: (flow) => cells(flow).includes("I"),
    canEditForm: (flow) => cells(flow).includes("E"),
    canView: (flow) => cells(flow).some((c) => c !== "—"),
    ownsStep: (ir) => {
      const o = ownerRole(ir);
      return !!o && roles.has(o);
    },
    reviewerDepts,
    rmesEditorOf,
    isCaseAdmin: roles.has("ciq_case_admin") && roles.has("ciq_rmm"),
    hasFlowAdmin: (flow) => cells(flow).includes("A"),
  };
}

/**
 * The lens (§5.4): a UI-only narrowing to ONE held role. It can only narrow, never widen: a role the user does not
 * hold is ignored. Case Admin keeps RMM with it (SEC-HR2), since Case Admin acts inside the RMM landing.
 */
export function lensRoles(held: RoleIr[], lens: RoleIr | null): RoleIr[] {
  const ui = uiRoles(held);
  if (!lens || !ui.includes(lens)) return ui;
  return lens === "ciq_case_admin" ? ["ciq_case_admin", "ciq_rmm"] : [lens];
}

/** Read rung 1 (admin list) is skipped when the lens is on and the chosen role has no flow Admin (§5.4). */
export const skipAdminRung = (lensActive: boolean, caps: Caps, flow: FlowId): boolean => lensActive && !caps.hasFlowAdmin(flow);

/** The department the user acts for in F8 rows (Actor_Dept, CIQ_Department list). */
export function actorDeptOf(roles: Iterable<RoleIr>): string {
  const set = new Set(roles);
  if (set.has("ciq_rmm")) return "RMM";
  for (const d of DEPTS) if (set.has(deptSteps(d).reviewerRole)) return d;
  return "";
}

/** Landing route (§5.5): the first held persona's landing, in the prototype's persona order. Null = no access. */
export function landingOf(caps: Caps): string | null {
  return PERSONA_NAV.find((p) => caps.roles.has(p.role))?.landing ?? null;
}

/** Roles in the prototype's persona order, Case administrator after RMM (the View as options). */
export const byPersonaOrder = (roles: RoleIr[]): RoleIr[] => {
  const order: RoleIr[] = PERSONA_NAV.map((p) => p.role);
  order.splice(1, 0, "ciq_case_admin");
  const rank = (r: RoleIr) => (order.includes(r) ? order.indexOf(r) : order.length);
  return [...roles].sort((a, b) => rank(a) - rank(b));
};

export const roleName = (r: RoleIr): string => allRoles().find((x) => x.irId === r)?.name ?? r;
