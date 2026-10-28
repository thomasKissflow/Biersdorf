import { describe, expect, it } from "vitest";
import { capsFor } from "../kf/app";
import type { RoleIr } from "../schema";
import { navRegistry } from "./routes";
import { activeNavPath, buildNav } from "./nav";

const groups = (...roles: RoleIr[]) => buildNav(capsFor(roles), navRegistry());
const nav = (...roles: RoleIr[]) => groups(...roles).map((g) => `${g.label}: ${g.items.map((i) => i.label).join(", ")}`);

describe("navigation by persona, like the prototype (§5.5; src/domain/catalog.ts PERSONAS)", () => {
  it("Raw Material Manager (RMM)", () =>
    expect(nav("ciq_rmm")).toEqual(["Raw Material Manager (RMM): Dashboard, My work, All cases, New case, Change requests, Suppliers, Reports"]));
  it("Product Safety and Regulatory Affairs reviewers: My reviews, RMES sheet, All cases", () => {
    expect(nav("ciq_safety_reviewer")).toEqual(["Product Safety reviewer: My reviews, RMES sheet, All cases"]);
    expect(nav("ciq_regulatory_reviewer")).toEqual(["Regulatory Affairs reviewer: My reviews, RMES sheet, All cases"]);
  });
  it("QM, Microbiology, Sustainability reviewers: no RMES link (ground rule 7)", () => {
    expect(nav("ciq_qm_reviewer")).toEqual(["Quality Management reviewer: My reviews, All cases"]);
    expect(nav("ciq_microbiology_reviewer")).toEqual(["Microbiology reviewer: My reviews, All cases"]);
    expect(nav("ciq_sustainability_reviewer")).toEqual(["Sustainability reviewer: My reviews, All cases"]);
  });
  it("Customs & Trade Compliance and Legal / IP: Informed cases, All cases", () => {
    expect(nav("ciq_customs")).toEqual(["Customs & Trade Compliance: Informed cases, All cases"]);
    expect(nav("ciq_legal")).toEqual(["Legal / IP: Informed cases, All cases"]);
  });
  it("Overall approver: Approvals, All cases, Reports", () => expect(nav("ciq_overall_approver")).toEqual(["Overall approver: Approvals, All cases, Reports"]));
  it("Business administrator", () =>
    expect(nav("ciq_business_admin")).toEqual(["Business administrator: Rule table, Questionnaire, Section owners, Reminders, Suppliers, Configuration"]));
  it("Auditor: Audit trail, All cases, Rule table", () => expect(nav("ciq_reader")).toEqual(["Auditor: Audit trail, All cases, Rule table"]));
  it("Business owner (reports): Reports, Operations (#/rmm), All cases", () => {
    expect(nav("ciq_business_owner")).toEqual(["Business owner (reports): Reports, Operations, All cases"]);
    expect(groups("ciq_business_owner")[0].items.find((i) => i.label === "Operations")?.path).toBe("/rmm");
  });
  it("routes behind the items: the prototype's paths, mapped to the Workbench", () => {
    const path = (id: string) => navRegistry().find((i) => i.id === id)?.path;
    expect([path("dashboard"), path("new-case"), path("reports"), path("informed"), path("rules"), path("ownership"), path("reminders"), path("templates")]).toEqual([
      "/rmm",
      "/cases/new",
      "/reports",
      "/informed",
      "/admin/rules",
      "/admin/ownership",
      "/admin/reminders",
      "/templates",
    ]);
  });
  it("Case administrator is not a persona: with RMM it adds no group; Integration service alone gives no nav", () => {
    expect(nav("ciq_rmm", "ciq_case_admin")).toEqual(nav("ciq_rmm"));
    expect(nav("ciq_integration_service")).toEqual([]);
    expect(nav("ciq_case_admin")).toEqual([]);
  });
  it("several roles: the union grouped by persona in the prototype's order; each item (id or path) once, in its first group", () => {
    const all: RoleIr[] = ["ciq_reader", "ciq_business_owner", "ciq_rmm", "ciq_safety_reviewer", "ciq_regulatory_reviewer", "ciq_customs", "ciq_overall_approver", "ciq_business_admin", "ciq_case_admin"];
    const g = groups(...all);
    expect(g.map((x) => x.id)).toEqual(["rmm", "reg", "cus", "approver", "admin", "auditor"]);
    const items = g.flatMap((x) => x.items);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(new Set(items.map((i) => i.path)).size).toBe(items.length);
    expect(items.map((i) => i.id)).toEqual(["dashboard", "my-work", "cases", "new-case", "change-requests", "suppliers", "reports", "review", "rmes", "informed", "approvals", "rules", "templates", "ownership", "reminders", "config", "audit"]);
  });
  it("the lit entry: the longest matching path wins", () => {
    const paths = ["/rmm", "/cases", "/cases/new", "/review"];
    expect(activeNavPath(paths, "/cases/new")).toBe("/cases/new");
    expect(activeNavPath(paths, "/cases/abc")).toBe("/cases");
    expect(activeNavPath(paths, "/review/lane/x/y")).toBe("/review");
    expect(activeNavPath(paths, "/rmes")).toBeUndefined();
  });
});
