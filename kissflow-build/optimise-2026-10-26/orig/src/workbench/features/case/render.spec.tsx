// Server-side renders (react-dom/server; no jsdom) of the T1 panels and tabs inside the real WorkbenchData provider
// over the fake host: they render without throwing, carry the §8 test ids the harness drives, gate actions on the
// held task, and never claim a hand-off ("sent to supplier", "PDF", "e-mailed").
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { fakeClient, heldTask } from "../../testkit/fakeClient";
import { WorkbenchData, type CaseBundle } from "../../data/hooks";
import type { CaseVM, ListRead, PointVM, CrVM } from "../../data/viewModels";
import { CaseTabBar, CrRows, FactsCards, LanesTab, SectionsTab } from "./CaseTabs";
import { toCrVM } from "../../data/map";
import type { RawItem } from "../../data/viewModels";
import { HoldPanel } from "./panels/HoldPanel";
import { S1Panel, S3Panel, S7Panel } from "./panels/ManualPanels";
import { StepPanel } from "./panels/StepPanel";
import { caseFixture } from "./t1.fixtures";

function render(node: ReactNode): string {
  const client = fakeClient();
  return renderToString(
    <WorkbenchData kf={client.kf} readyMs={0} client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </WorkbenchData>,
  );
}
const list = <T,>(rows: T[]): ListRead<T> => ({ rows, quality: "admin", indexOnly: new Set(), warnings: [] });
function bundle(c: CaseVM, points: PointVM[] = [], crs: CrVM[] = []): CaseBundle {
  return { case: c, points, crs, sections: [], runs: [], notes: [], events: [], quality: { points: "admin", crs: "admin", sections: "form", runs: "form", notes: "form", events: "form" }, lists: { points: list(points), crs: list(crs) } };
}
const noop = () => {};
const testIds = (html: string) => [...html.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]);

describe("case step panels render (§8.5)", () => {
  it("S1: manual record note, Basic data received select, save and submit; never 'sent to supplier'", () => {
    const c = caseFixture({}, "PkC1");
    const html = render(<S1Panel task={heldTask("CIQ_Case_A00", "PkC1", "a1", "CASE_S1")} c={c} onChanged={noop} />);
    const ids = testIds(html);
    for (const id of ["wb-panel-CASE_S1", "wb-step-CASE_S1", "wb-manual-note", "wb-field-Basic_Data_Received", "wb-step-save", "wb-step-submit"]) expect(ids).toContain(id);
    expect(ids.filter((x) => x === "wb-step-CASE_S1")).toHaveLength(1);
    expect(html).not.toMatch(/sent to supplier/i);
  });

  it("S3: 'Supplier confirmed at' is a datetime input inside its test id, labelled manual", () => {
    const html = render(<S3Panel task={heldTask("CIQ_Case_A00", "PkC3", "a3", "CASE_S3")} c={caseFixture({}, "PkC3")} onChanged={noop} />);
    expect(html).toMatch(/data-testid="wb-s3-confirmed-at"[^>]*><input[^>]*type="datetime-local"/);
    expect(html).toContain("not when you type it");
    expect(testIds(html)).toContain("wb-step-CASE_S3");
  });

  it("S3 (F4): no free Yes/No/blank input for a department flag; only 'Add' for departments not yet in review", () => {
    const c = caseFixture({ Dept_SAF_Active: "Yes", Dept_REG_Active: "Yes" }, "PkC3");
    const ids = testIds(render(<S3Panel task={heldTask("CIQ_Case_A00", "PkC3", "a3", "CASE_S3")} c={c} onChanged={noop} />));
    expect(ids.filter((x) => /^wb-field-Dept_/.test(x))).toEqual([]);
    expect(ids).toContain("wb-s3-depts");
    expect(ids).not.toContain("wb-s3-add-SAF");
    expect(ids).not.toContain("wb-s3-add-REG");
    expect(ids).toContain("wb-s3-add-QM");
  });

  it("S5: counts, override (a textarea inside wb-override), lane check with the Department-review alternative; no repair for a non-admin", () => {
    const c = caseFixture({ Dept_QM_Active: "Yes", Dept_REG_Active: "Yes", REG_Review_Confirm: "Confirmed", REG_Completed_At: "2026-10-05T09:00:00Z", _current_step: "Open items check – before release request" }, "PkC5");
    const html = render(<HoldPanel task={{ ...heldTask("CIQ_Case_A00", "PkC5", "a5", "CASE_S5"), step: "CASE_S5" }} b={bundle(c)} onChanged={noop} />);
    const ids = testIds(html);
    for (const id of ["wb-step-CASE_S5", "wb-counts-refresh", "wb-override", "wb-s5-lanes", "wb-s5-lane-QM", "wb-s5-raise-deptreview-QM", "wb-gate-Open_Items_Gate_Release", "wb-field-Hold_Note"]) expect(ids).toContain(id);
    expect(html).toMatch(/data-testid="wb-override"[\s\S]*?<textarea/);
    expect(ids).not.toContain("wb-s5-raise-deptreview-REG"); // REG passes by (a)
    expect(ids.some((x) => x.startsWith("wb-lane-repair-"))).toBe(false);
    expect(ids).not.toContain("wb-field-Open_Items_Count"); // counts are written only by Refresh counts
  });

  it("S5 (UX-06): only the hold note up front; raw contacts and late completions never as inputs; plain override label", () => {
    const c = caseFixture({ Dept_QM_Active: "Yes", _current_step: "Open items check – before release request" }, "PkC5");
    const html = render(<HoldPanel task={{ ...heldTask("CIQ_Case_A00", "PkC5", "a5", "CASE_S5"), step: "CASE_S5" }} b={bundle(c)} onChanged={noop} />);
    const ids = testIds(html);
    for (const f of ["Case_Contacts_JSON", "Portal_Contact_Ids", "Confirm_Contact_Ids", "Late_Completions_Text", "Hold_Override_Reason_Release"]) expect(ids).not.toContain(`wb-field-${f}`);
    expect(ids).toContain("wb-hold-other-details"); // the other optional values, collapsed
    expect(html).toContain("Reason to continue with open items");
    expect(html).not.toContain("Hold Override Reason Release");
  });

  it("UX-07: a change request key is a real link (keyboard reachable)", () => {
    const cr = toCrVM({ _id: "PkCr1", CR_Key: "CIQ-2026-PkC4-C1-CRab", Change_Kind: "Answer change" } as RawItem);
    const html = renderToString(
      <MemoryRouter>
        <CrRows crs={[cr]} onOpen={noop} />
      </MemoryRouter>,
    );
    expect(html).toMatch(/<a [^>]*href="\/change-requests\/PkCr1"/);
  });

  it("S7: 'Supplier released at' input, counts block; never 'PDF' or 'e-mailed'", () => {
    const html = render(<S7Panel task={heldTask("CIQ_Case_A00", "PkC7", "a7", "CASE_S7")} c={caseFixture({}, "PkC7")} onChanged={noop} />);
    expect(html).toMatch(/data-testid="wb-s7-released-at"[^>]*><input[^>]*type="datetime-local"/);
    expect(testIds(html)).toContain("wb-counts-refresh");
    expect(html).not.toMatch(/PDF|e-mailed/);
    expect(testIds(html)).not.toContain("wb-field-Final_Release_At");
  });

  it("S8: its own set (no Origin_Types, no Final_Release_Due_Date) and the close gate", () => {
    const c = caseFixture({}, "PkC8");
    const html = render(<HoldPanel task={{ ...heldTask("CIQ_Case_A00", "PkC8", "a8", "CASE_S8"), step: "CASE_S8" }} b={bundle(c)} onChanged={noop} />);
    const ids = testIds(html);
    expect(ids).toContain("wb-gate-Open_Items_Gate_Close");
    expect(ids).not.toContain("wb-field-Origin_Types");
    expect(ids).not.toContain("wb-field-Final_Release_Due_Date");
    expect(ids).not.toContain("wb-s5-lanes");
  });

  it("B_RMM goes to the lane workspace; an unidentified step offers only 'Open task form'", () => {
    const c = caseFixture({}, "PkC4");
    expect(render(<StepPanel task={heldTask("CIQ_Case_A00", "PkC4", "x", "CASE_B_RMM")} b={bundle(c)} onChanged={noop} />)).toContain("wb-case-lane-task-RMM");
    const un = { ...heldTask("CIQ_Case_A00", "PkC4", "y", "CASE_S2"), step: null, stepName: null, evidence: null };
    const html = render(<StepPanel task={un} b={bundle(c)} onChanged={noop} />);
    expect(testIds(html)).toEqual(expect.arrayContaining(["wb-case-task-unresolved", "wb-kwb-openform"]));
    expect(testIds(html)).not.toContain("wb-step-submit");
  });
});

describe("case tabs render (§8.4)", () => {
  it("tab bar carries wb-case-tab-<name>", () => {
    const ids = testIds(render(<CaseTabBar value="overview" onChange={noop} counts={{}} />));
    expect(ids).toEqual(["wb-case-tab-overview", "wb-case-tab-lanes", "wb-case-tab-sections", "wb-case-tab-points", "wb-case-tab-change-requests", "wb-case-tab-notes", "wb-case-tab-audit"]);
  });
  it("Departments & lanes: six rows; SAF/REG show the effective decision", () => {
    const c = caseFixture({ Dept_SAF_Active: "Yes", SAF_RMES_Decision: "Approved" }, "PkC6");
    const html = render(<LanesTab b={bundle(c)} />);
    const ids = testIds(html);
    for (const d of ["REG", "SAF", "QM", "MIC", "SUS", "RMM"]) expect(ids).toContain(`wb-case-lane-${d}`);
    expect(ids).toContain("wb-case-effective-SAF");
    expect(html.replace(/<!-- -->/g, "")).toContain("effective Approved (RMES decision)");
  });
  it("Overview facts and Sections render read-only", () => {
    const c = caseFixture({ Completeness_At: "2026-10-02T09:30:00Z", Completeness_Request_Key: "CIQ-2026-PkC6-C1-PS05" }, "PkC6");
    expect(render(<FactsCards c={c} />)).toContain("CIQ-2026-PkC6-C1-PS05");
    expect(render(<SectionsTab b={bundle(c)} />)).toContain("No sections yet");
  });
});
