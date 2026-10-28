import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { roleDef } from "../schema";
import { LENS_NOTE } from "../domain/labels";
import { actorDeptOf, byPersonaOrder, capsFor, heldRolesOf, landingOf, lensRoles, skipAdminRung, uiRoles } from "./app";
import { ViewAsDock, probeBuilder, readLens, writeLens } from "./viewAs";
import type { Kf } from "./sdk";

const roles = (...names: string[]) => ({ AppRoles: names.map((n, i) => ({ _id: `Ro${i}`, Name: n })) });

describe("roles by live id, display name, then legacy name (§5.2)", () => {
  it("the display names are the prototype's persona names; legacy names and live ids come from the role alignment", () => {
    expect(roleDef("ciq_rmm")).toMatchObject({ name: "Raw Material Manager (RMM)", legacyName: "CIQ RMM", persona: "rmm", technical: false, serverId: "RoEKl83f9jPF" });
    expect(roleDef("ciq_reader")).toMatchObject({ name: "Auditor", legacyName: "CIQ Reader", persona: "auditor" });
    expect(roleDef("ciq_case_admin")).toMatchObject({ name: "Case administrator", persona: null, technical: true });
    expect(roleDef("ciq_integration_service")).toMatchObject({ name: "Integration service", persona: null, technical: true });
    expect(roleDef("ciq_customs")).toMatchObject({ name: "Customs & Trade Compliance", legacyName: null, persona: "cus", serverId: "RoEKwv6pxX3g" });
    expect(roleDef("ciq_legal").name).toBe("Legal / IP");
    expect(roleDef("ciq_business_owner").name).toBe("Business owner (reports)");
  });
  it("matches the display names after the live rename", () => {
    expect(heldRolesOf(roles("Raw Material Manager (RMM)", "Product Safety reviewer", "Auditor")).held).toEqual(["ciq_rmm", "ciq_safety_reviewer", "ciq_reader"]);
  });
  it("matches by live role id first, whatever the name (a renamed or relabelled role still matches)", () => {
    const h = heldRolesOf({ AppRoles: [{ _id: "RoEKl84xAFRW", Name: "Some new label" }, { _id: "RoEKwvH8qaxG", Name: "" }] });
    expect(h.held).toEqual(["ciq_safety_reviewer", "ciq_legal"]);
    expect(h.unknown).toEqual([]);
  });
  it("the three new roles get a read-only UI like the Auditor", () => {
    for (const r of ["ciq_customs", "ciq_legal", "ciq_business_owner"] as const) {
      expect(uiRoles([r])).toEqual([r]);
      const c = capsFor([r]);
      const reader = capsFor(["ciq_reader"]);
      for (const f of ["CIQ_Case_A00", "CIQ_Open_Point_A00", "CIQ_Change_Request_A00", "CIQ_Supplier_A00", "CIQ_Audit_Event_A00"] as const) {
        expect(c.canView(f)).toBe(reader.canView(f));
        expect(c.canInitiate(f)).toBe(false);
        expect(c.canEditForm(f)).toBe(false);
        expect(c.hasFlowAdmin(f)).toBe(false);
      }
      expect(c.reviewerDepts).toEqual([]);
      expect(c.rmesEditorOf.size).toBe(0);
    }
  });
  it("matches exact legacy CIQ role names (before the rename); lists unknown names; platform defaults are not CIQ roles", () => {
    const h = heldRolesOf(roles("CIQ RMM", "CIQ Safety Reviewer", "Admin", "Some Other Role", "CIQ rmm"));
    expect(h.held).toEqual(["ciq_rmm", "ciq_safety_reviewer"]);
    expect(h.platform).toEqual(["admin"]);
    expect(h.unknown).toEqual(["Some Other Role", "CIQ rmm"]);
  });
  it("SEC-HR2: Case Admin counts only with RMM", () => {
    const h = heldRolesOf(roles("CIQ Case Admin"));
    // plain words in the banner (F-03): the rule id stays in code and on Diagnostics
    expect(h.warnings[0]).toBe(
      "Your Case administrator role only works together with the Raw Material Manager (RMM) role, so Case administrator actions are not shown. Ask the Business administrator to check your roles.",
    );
    expect(h.warnings[0]).not.toMatch(/SEC-HR/);
    expect(uiRoles(h.held)).toEqual([]);
    expect(capsFor(heldRolesOf(roles("CIQ Case Admin", "CIQ RMM")).held).isCaseAdmin).toBe(true);
  });
  it("integration service and User only → no UI role (the no-access screen), by legacy or display name", () => {
    expect(uiRoles(heldRolesOf(roles("CIQ Integration Service", "User")).held)).toEqual([]);
    expect(uiRoles(heldRolesOf(roles("Integration service")).held)).toEqual([]);
    expect(heldRolesOf(roles("Integration service")).held).toEqual(["ciq_integration_service"]);
  });
});

describe("capabilities from GRANTS and STEPS (§5.3)", () => {
  it("RMM initiates cases, points and CRs; edits suppliers; owns S1", () => {
    const c = capsFor(["ciq_rmm"]);
    expect(c.canInitiate("CIQ_Case_A00")).toBe(true);
    expect(c.canInitiate("CIQ_Change_Request_A00")).toBe(true);
    expect(c.canEditForm("CIQ_Supplier_A00")).toBe(true);
    expect(c.canEditForm("CIQ_Config_Version_A00")).toBe(false);
    expect(c.ownsStep("CASE_S1")).toBe(true);
    expect(c.reviewerDepts).toEqual(["RMM"]);
    expect(c.hasFlowAdmin("CIQ_Case_A00")).toBe(false);
  });
  it("a Safety reviewer initiates points only, edits the SAF RMES sheet, never REG", () => {
    const c = capsFor(["ciq_safety_reviewer"]);
    expect(c.canInitiate("CIQ_Open_Point_A00")).toBe(true);
    expect(c.canInitiate("CIQ_Case_A00")).toBe(false);
    expect([...c.rmesEditorOf]).toEqual(["SAF"]);
    expect(c.reviewerDepts).toEqual(["SAF"]);
    expect(c.ownsStep("OPNT_S1")).toBe(false); // navigation only: actions follow the held task
  });
  it("Case Admin has flow Admin on the three processes", () => {
    const c = capsFor(["ciq_rmm", "ciq_case_admin"]);
    expect(c.hasFlowAdmin("CIQ_Case_A00") && c.hasFlowAdmin("CIQ_Open_Point_A00") && c.hasFlowAdmin("CIQ_Change_Request_A00")).toBe(true);
    expect(c.hasFlowAdmin("CIQ_Supplier_A00")).toBe(false);
  });
  it("landing: the prototype's persona landings, first held persona in the prototype's order", () => {
    expect(landingOf(capsFor(["ciq_reader", "ciq_rmm"]))).toBe("/rmm");
    expect(landingOf(capsFor(["ciq_reader", "ciq_qm_reviewer"]))).toBe("/review");
    expect(landingOf(capsFor(["ciq_customs"]))).toBe("/informed");
    expect(landingOf(capsFor(["ciq_legal", "ciq_reader"]))).toBe("/informed");
    expect(landingOf(capsFor(["ciq_overall_approver", "ciq_reader"]))).toBe("/approvals");
    expect(landingOf(capsFor(["ciq_business_admin"]))).toBe("/admin/rules");
    expect(landingOf(capsFor(["ciq_reader"]))).toBe("/audit");
    expect(landingOf(capsFor(["ciq_business_owner"]))).toBe("/reports");
    expect(landingOf(capsFor(["ciq_rmm", "ciq_case_admin"]))).toBe("/rmm");
    expect(landingOf(capsFor([]))).toBeNull();
  });
  it("actor department for F8 rows", () => {
    expect(actorDeptOf(["ciq_safety_reviewer"])).toBe("SAF");
    expect(actorDeptOf(["ciq_reader"])).toBe("");
  });
});

describe('"View as" lens (§5.4): only narrows', () => {
  const all = ["ciq_rmm", "ciq_safety_reviewer", "ciq_case_admin", "ciq_reader"] as const;
  it("narrows to one held role; a role not held is ignored (never widens)", () => {
    expect(lensRoles([...all], "ciq_safety_reviewer")).toEqual(["ciq_safety_reviewer"]);
    expect(lensRoles(["ciq_safety_reviewer"], "ciq_rmm")).toEqual(["ciq_safety_reviewer"]);
    expect(lensRoles([...all], null)).toEqual([...all]);
    expect(lensRoles([...all], "ciq_case_admin")).toEqual(["ciq_case_admin", "ciq_rmm"]);
  });
  it("skips read rung 1 when the lensed role has no flow Admin", () => {
    const saf = capsFor(lensRoles([...all], "ciq_safety_reviewer"));
    expect(skipAdminRung(true, saf, "CIQ_Case_A00")).toBe(true);
    expect(skipAdminRung(false, saf, "CIQ_Case_A00")).toBe(false);
    expect(skipAdminRung(true, capsFor(lensRoles([...all], "ciq_case_admin")), "CIQ_Case_A00")).toBe(false);
  });
  it("probeBuilder: getRoles answering → builder; refusing, missing or hanging → null (never throws)", async () => {
    const kf = (getRoles?: () => Promise<unknown>) => ({ app: { getRoles } }) as unknown as Kf;
    expect(await probeBuilder(kf(async () => ({ roles: [{ _id: "Ro1", Name: "CIQ RMM" }], currentRoles: [] })))).toMatchObject({ roles: [{ Name: "CIQ RMM" }] });
    expect(await probeBuilder(kf(() => Promise.reject({ isError: true, errorMessage: "Only in development" })))).toBeNull();
    expect(await probeBuilder(kf())).toBeNull();
    expect(await probeBuilder(kf(() => new Promise(() => {})), 20)).toBeNull();
  });
  it("the View as options follow the prototype's persona order (Case administrator after RMM)", () => {
    expect(byPersonaOrder(["ciq_reader", "ciq_case_admin", "ciq_safety_reviewer", "ciq_rmm", "ciq_business_owner"])).toEqual(["ciq_rmm", "ciq_case_admin", "ciq_safety_reviewer", "ciq_reader", "ciq_business_owner"]);
  });
  it("the dock: collapsed eye tab; the active lens as a badge with the plain explanation; no full-width banner", () => {
    const dock = (lens: "ciq_safety_reviewer" | null) => renderToString(<ViewAsDock held={["ciq_rmm", "ciq_safety_reviewer"]} lens={lens} onChange={() => {}} />);
    const off = dock(null);
    expect(off).toContain('data-testid="wb-viewas"');
    expect(off).toMatch(/class="fixed top-0 right-3/);
    expect(off).not.toContain("wb-lens-badge");
    expect(off).toContain('class="sr-only" data-testid="wb-viewas-panel"'); // collapsed, still in the tab order
    const on = dock("ciq_safety_reviewer");
    expect(on).toContain('data-testid="wb-lens-badge"');
    expect(on).toMatch(/Viewing as <strong[^>]*>Product Safety reviewer<\/strong>/);
    expect(LENS_NOTE).toBe("Preview only: shows the screens of this role. Your real Kissflow access doesn't change.");
    expect(on).toContain("Preview only: shows the screens of this role.");
    expect(on).not.toMatch(/UI lens only|permissions are unchanged|wb-lens-banner/);
  });
  it("the stored lens is only ever a held role; storage errors are swallowed", () => {
    expect(readLens(["ciq_rmm"])).toBeNull(); // no sessionStorage in node
    expect(() => writeLens("ciq_rmm")).not.toThrow();
  });
});
