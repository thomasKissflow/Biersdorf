// Informed cases (#/informed): which cases Customs (K7) and Legal / IP (K8, K8.1) see, from F3 Section rows with the
// newest F4 scope run as the fallback; the view renders read-only with a link to the case. Fictional data only.
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WorkbenchData } from "../../data/hooks";
import { toRunVM, toSectionVM } from "../../data/map";
import type { RawItem } from "../../data/viewModels";
import { fakeClient } from "../../testkit/fakeClient";
import { caseFixture } from "../case/t1.fixtures";
import { InformedCases, InformedView } from "./InformedCases";
import { defaultInformedFilter, filterInformed, INFORMED_DEPTS, informedDeptsOf, informedRows, informedStats } from "./model";

const [CUS, LEG] = INFORMED_DEPTS;
const sec = (id: string, caseId: string, key: string, code: string, lead: string, applic: string) =>
  toSectionVM({ _id: id, Case_Item_Id: caseId, Section_Key: key, Section_Code: code, Section_Title: `${code} title`, Lead_Dept: lead, Applicability_Label: applic } as RawItem);
const run = (id: string, caseId: string, no: number, f: Record<string, unknown>) => toRunVM({ _id: id, Case_Item_Id: caseId, Run_No: no, ...f } as RawItem);
const recorded = (sections: { sectionKey: string; code: string; applicability: string; lead: string }[]) =>
  JSON.stringify({ version: 1, sections: sections.map((s) => ({ ...s, title: s.code, default: s.applicability, justification: "" })), depts: {}, added: [], deptReason: "", na: [] });

function fixture() {
  const cases = [
    caseFixture({ _created_at: "2026-10-01T08:00:00Z" }, "PkA"),
    caseFixture({ _created_at: "2026-10-02T08:00:00Z", Completeness_At: "2026-10-05T09:00:00Z" }, "PkB"),
    caseFixture({ _created_at: "2026-10-03T08:00:00Z", _status: "Completed" }, "PkC"),
    caseFixture({ _created_at: "2026-10-04T08:00:00Z" }, "PkD"),
    caseFixture({ _created_at: "2026-10-05T08:00:00Z" }, "PkE"),
  ];
  const sections = [
    sec("S1", "PkA", "K7", "K7", "CUS", "Mandatory"),
    sec("S2", "PkA", "K8", "K8", "LEG", "Optional"),
    sec("S3", "PkB", "K7", "K7", "", "Optional"), // matched by code even without a lead
    sec("S4", "PkE", "K7", "K7", "CUS", "N.A."), // never in scope
    sec("S5", "PkE", "GEN", "K2", "QM", "Mandatory"),
  ];
  const runs = [
    run("R1", "PkC", 1, { Result_JSON: recorded([{ sectionKey: "K8.1", code: "K8.1", applicability: "N.A.", lead: "LEG" }]) }),
    run("R2", "PkC", 2, { Result_JSON: recorded([{ sectionKey: "K8.1", code: "K8.1", applicability: "Optional", lead: "LEG" }, { sectionKey: "K7", code: "K7", applicability: "N.A.", lead: "CUS" }]) }),
    run("R3", "PkD", 1, { Result_JSON: "not json", Lead_Departments: "REG,CUS" }),
    run("R4", "PkA", 1, { Result_JSON: recorded([{ sectionKey: "K8.1", code: "K8.1", applicability: "Mandatory", lead: "LEG" }]) }), // ignored: PkA has F3 rows
  ];
  return { cases, sections, runs };
}

describe("informed departments", () => {
  it("come from the Customs and Legal roles only", () => {
    expect(informedDeptsOf(new Set(["ciq_customs"]))).toEqual([CUS]);
    expect(informedDeptsOf(new Set(["ciq_legal", "ciq_customs"])).map((d) => d.dept)).toEqual(["CUS", "LEG"]);
    expect(informedDeptsOf(new Set(["ciq_reader", "ciq_rmm"]))).toEqual([]);
  });

  it("Customs: K7 from Section rows (by lead or code, never N.A.), else the newest run's lead departments; newest first", () => {
    const { cases, sections, runs } = fixture();
    const rows = informedRows(cases, sections, runs, CUS);
    expect(rows.map((r) => r.c._id)).toEqual(["PkD", "PkB", "PkA"]);
    expect(rows.find((r) => r.c._id === "PkA")!.sections).toEqual([{ key: "K7", code: "K7", title: "K7 title", applicability: "Mandatory", source: "section" }]);
    expect(rows.find((r) => r.c._id === "PkD")!.sections[0]).toMatchObject({ code: "K7", applicability: "", source: "scope run" });
  });

  it("Legal: K8 from Section rows; K8.1 from the newest recorded scope run when a case has no Section rows", () => {
    const { cases, sections, runs } = fixture();
    const rows = informedRows(cases, sections, runs, LEG);
    expect(rows.map((r) => r.c._id)).toEqual(["PkC", "PkA"]);
    expect(rows[0].sections).toEqual([{ key: "K8.1", code: "K8.1", title: "K8.1", applicability: "Optional", source: "scope run" }]);
    expect(rows[1].sections.map((s) => s.code)).toEqual(["K8"]);
  });

  it("filters active and closed, and counts submitted (completeness confirmed) and completed", () => {
    const { cases, sections, runs } = fixture();
    const rows = informedRows(cases, sections, runs, LEG);
    expect(filterInformed(rows, "active").map((r) => r.c._id)).toEqual(["PkA"]);
    expect(filterInformed(rows, "closed").map((r) => r.c._id)).toEqual(["PkC"]);
    expect(informedStats(informedRows(cases, sections, runs, CUS))).toEqual({ active: 3, submitted: 1, completed: 0, unknown: 0 });
    expect(informedStats(rows)).toEqual({ active: 1, submitted: 0, completed: 1, unknown: 0 });
  });

  it("a case whose status is not readable (known only from the audit log) is neither active nor closed, only in All", () => {
    const { cases, sections, runs } = fixture();
    const idx = cases.map((c) => (c._id === "PkC" ? { ...c, status: "unknown" as const } : c));
    const rows = informedRows(idx, sections, runs, LEG);
    expect(filterInformed(rows, "active").map((r) => r.c._id)).toEqual(["PkA"]);
    expect(filterInformed(rows, "closed")).toEqual([]);
    expect(filterInformed(rows, "all").map((r) => r.c._id)).toEqual(["PkC", "PkA"]);
    expect(informedStats(rows)).toMatchObject({ active: 1, completed: 0, unknown: 1 });
    expect(defaultInformedFilter(rows)).toBe("active");
    const unread = informedRows(idx.map((c) => ({ ...c, status: "unknown" as const })), sections, runs, LEG);
    expect(defaultInformedFilter(unread)).toBe("all");
    const out = renderToString(
      <MemoryRouter>
        <InformedView dept={LEG} rows={unread} filter="active" onFilter={() => {}} />
      </MemoryRouter>,
    );
    expect(out).toContain('data-testid="wb-informed-unknown"');
    expect(out).toContain("known only from the audit log");
  });
});

describe("informed cases page", () => {
  const html = (node: ReactNode) => renderToString(<MemoryRouter>{node}</MemoryRouter>);

  it("lists the cases read-only with their sections and a link to the case view; no write control", () => {
    const { cases, sections, runs } = fixture();
    const out = html(<InformedView dept={CUS} rows={informedRows(cases, sections, runs, CUS)} filter="all" onFilter={() => {}} />);
    expect(out).toContain("Customs &amp; Trade Compliance — informed cases");
    expect(out).toContain('data-testid="wb-informed-open-PkA"');
    expect(out).toContain('href="/cases/PkA"');
    expect(out).toContain("Submitted");
    expect(out).not.toMatch(/Save|Submit<|Approve|Reject/);
  });

  it("an empty view explains when cases appear", () => {
    expect(html(<InformedView dept={LEG} rows={[]} filter="active" onFilter={() => {}} />)).toContain("No cases in this view");
  });

  it("a user without Customs or Legal gets the explanation, not a list", () => {
    const client = fakeClient();
    const out = renderToString(
      <WorkbenchData kf={client.kf} readyMs={0} client={client}>
        <MemoryRouter>
          <InformedCases />
        </MemoryRouter>
      </WorkbenchData>,
    );
    expect(out).toContain('data-testid="wb-informed"');
    expect(out).toContain("This list is for informed departments");
  });
});
