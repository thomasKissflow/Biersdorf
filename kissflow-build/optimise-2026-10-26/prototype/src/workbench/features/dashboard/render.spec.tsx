// Server-side renders (no jsdom) of the dashboard and report pages and cards: they render without throwing, carry
// their test ids, label partial reads, and name what is not measured yet instead of showing a number.
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { fakeClient } from "../../testkit/fakeClient";
import { WorkbenchData } from "../../data/hooks";
import { LeadTimeCard, SupplierCard } from "../reports/cards";
import { leadTimeView, supplierPerformance } from "../reports/metrics";
import { Reports } from "../reports/Reports";
import { BottleneckCard, DeptCard, NeedsAttention } from "./cards";
import { Dashboard } from "./Dashboard";
import { attentionItems, bottleneckByStep, byDepartment, scopeOps } from "./metrics";
import { NOW, opsFixture } from "./ops.fixtures";

// React separates text parts with <!-- --> on the server; the tests read the text as a user sees it.
const inRouter = (node: ReactNode) => renderToString(<MemoryRouter>{node}</MemoryRouter>).replace(/<!-- -->/g, "");
function inApp(node: ReactNode): string {
  const client = fakeClient();
  return renderToString(
    <WorkbenchData kf={client.kf} readyMs={0} client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </WorkbenchData>,
  );
}
const ops = () => scopeOps(opsFixture());
const FULL = { cases: true, points: true, crs: true, events: true, runs: true };

describe("dashboard and reports render", () => {
  it("the pages render their frame and a loading state before the first read", () => {
    expect(inApp(<Dashboard />)).toContain('data-testid="wb-dashboard"');
    expect(inApp(<Reports />)).toContain('data-testid="wb-reports"');
  });

  it("needs attention lists the items with links to the case; a partial read is labelled", () => {
    const o = ops();
    const html = inRouter(<NeedsAttention items={attentionItems(o, o.cases, NOW, FULL)} title="Needs your action" partial="cases and open points" />);
    expect(html).toContain('data-testid="wb-dash-attention"');
    expect(html).toContain('data-testid="wb-dash-item-rejected"');
    expect(html).toContain('href="/cases/C3"');
    expect(html).toContain("Partial: counts only the cases and open points you can see with your access.");
  });

  it("bottleneck and department cards carry their test ids and takeaways", () => {
    const o = ops();
    const html = inRouter(
      <>
        <BottleneckCard v={bottleneckByStep(o.cases, NOW)} />
        <DeptCard rows={byDepartment(o, NOW)} />
      </>,
    );
    expect(html).toContain('data-testid="wb-dash-bottleneck"');
    expect(html).toContain('data-testid="wb-dash-depts"');
    expect(html).toContain("1 open case at a step not readable with your access.");
    expect(html).toContain("Most overdue open points: Safety (1).");
    expect(html).not.toContain("wb-dash-partial");
  });

  it("lead time and suppliers: unrecorded times are named as not available, never filled in", () => {
    const o = ops();
    const sup = supplierPerformance(o, NOW);
    const html = inRouter(
      <>
        <LeadTimeCard v={leadTimeView(o)} />
        <SupplierCard rows={sup.rows} takeaway={sup.takeaway} />
      </>,
    );
    expect(html).toContain('data-testid="wb-rep-leadtime"');
    expect(html).toContain('data-testid="wb-rep-suppliers"');
    expect(html).toContain("not available yet");
    expect(html).toContain("The close check is not measured");
    expect(html).toContain("Northwind Botanicals GmbH");
  });
});
