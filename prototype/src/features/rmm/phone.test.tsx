// RMM's screens on a phone (Thomas, 30 Oct; phone.tsx): the Cases register, the case page, the final document, New
// case, the suppliers and the audit trail render their phone layout below 768 px (cards with the rows' test ids, the
// filters behind "Filters", the main action in the bar above the tab bar) and their table layout at 768 px and up.
// Rendered on the server under LayoutModeContext (the sheets are portals: the harness opens them). Fictional data only.
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PERSONA_BY_ID } from "@/domain/catalog";
import { Scenario } from "@/domain/testkit";
import type { AppState, InternalPersonaId } from "@/domain/types";
import { AuditTrail } from "@/features/reports";
import { SupplierDetail, SupplierList } from "@/features/suppliers";
import { LayoutModeContext, type LayoutMode } from "@/shell/useLayoutMode";
import { StoreContext, type StoreApi } from "@/store/store";
import { CaseDetail, CaseList, NewCase, RmmDashboard } from "./index";
import { PhoneFacts, PhoneFilters } from "./phone";

const flat = (html: string) => html.replace(/<!-- -->/g, "");

function storeFor(state: AppState, personaId: InternalPersonaId): StoreApi {
  const persona = PERSONA_BY_ID[personaId];
  const me = state.users.find((u) => u.id === persona.userId)!;
  const base = { state, persona, me } as Record<string, unknown>;
  return new Proxy(base, { get: (t, k: string) => (k in t ? t[k] : () => undefined) }) as unknown as StoreApi;
}
function page(mode: LayoutMode, state: AppState, personaId: InternalPersonaId, path: string) {
  return flat(
    renderToString(
      <LayoutModeContext.Provider value={mode}>
        <StoreContext.Provider value={storeFor(state, personaId)}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/rmm" element={<RmmDashboard />} />
              <Route path="/cases" element={<CaseList />} />
              <Route path="/cases/new" element={<NewCase />} />
              <Route path="/cases/:id" element={<CaseDetail />} />
              <Route path="/suppliers" element={<SupplierList />} />
              <Route path="/suppliers/:id" element={<SupplierDetail />} />
              <Route path="/audit" element={<AuditTrail />} />
            </Routes>
          </MemoryRouter>
        </StoreContext.Provider>
      </LayoutModeContext.Provider>,
    ),
  );
}
const at = (mode: LayoutMode, node: ReactNode) => flat(renderToString(<LayoutModeContext.Provider value={mode}>{node}</LayoutModeContext.Provider>));

/** One case in review (RMM's own review open, a point raised) and one completed with its final document. */
function world() {
  const sc = new Scenario();
  sc.toReview();
  const review = sc.id;
  sc.raise("RMM", "u-rmm", "GEN", "Please confirm the manufacturer address.");
  const op = sc.op().id;
  sc.toReview({ materialName: "Second material", materialNo: "RM-500124" });
  const done = sc.id;
  sc.completeAll();
  sc.release();
  return { s: sc.s, review, done, op };
}

describe("PhoneFilters and PhoneFacts", () => {
  it("Filters is a 44 px button with the number set; the sheet stays closed until it is tapped", () => {
    const html = at("phone", <PhoneFilters data-testid="x-filters" active={2} results="Show 3 cases"><p>inside</p></PhoneFilters>);
    expect(html).toContain('data-testid="x-filters-open"');
    expect(html).toContain('aria-haspopup="dialog" aria-expanded="false"');
    expect(html).toMatch(/h-11/);
    expect(html).toContain('aria-label="2 set">2</span>');
    expect(html).not.toContain("inside");
    expect(at("phone", <PhoneFilters data-testid="x-filters" active={0} results="Show 3 cases">x</PhoneFilters>)).not.toContain("set</span>");
  });

  it("facts in two columns, a wide one across both", () => {
    const html = at("phone", <PhoneFacts items={[{ k: "A", v: "1" }, { k: "B", v: "2", wide: true }]} />);
    expect(html).toContain('class="grid grid-cols-2 gap-x-4 gap-y-3"');
    expect(html).toContain('class="min-w-0 col-span-2"><dt class="text-xs text-ink-3">B</dt>');
  });
});

describe("the Cases register", () => {
  it("a phone: cards with the rows' test ids, the search on the page, the other filters behind Filters; no table", () => {
    const { s, review } = world();
    const html = page("phone", s, "rmm", "/cases");
    expect(html).toMatch(new RegExp(`<li data-testid="case-row-${review}"`));
    expect(html).not.toContain("<table");
    expect(html).toContain('data-testid="cases-search"');
    expect(html).toContain('data-testid="cases-filters-open"');
    expect(html).not.toContain('data-testid="cases-overdue"');
    expect(html).toContain('data-testid="cases-count"');
  });

  it("a tablet or desktop: the table rows and the filter card, as before", () => {
    const { s, review } = world();
    for (const mode of ["tablet", "desktop"] as const) {
      const html = page(mode, s, "rmm", "/cases");
      expect(html).toMatch(new RegExp(`<tr class="[^"]*" data-testid="case-row-${review}"`));
      expect(html).toContain('data-testid="cases-overdue"');
      expect(html).not.toContain("cases-filters-open");
    }
  });
});

describe("the case page", () => {
  it("a phone: no Cases link (the header has the back arrow), the facts one per line, Open my review in the bar, Cancel case in the page", () => {
    const { s, review } = world();
    const html = page("phone", s, "rmm", `/cases/${review}`);
    expect(html).not.toContain('href="/cases"');
    expect(html).toContain('data-testid="case-meta"');
    const bar = html.slice(html.indexOf('data-testid="sticky-actions"'));
    expect(html).toContain('data-testid="sticky-actions"');
    expect(bar).toContain('data-testid="case-open-review"');
    expect(bar).not.toContain('data-testid="case-cancel"');
    expect(html.indexOf('data-testid="case-cancel"')).toBeLessThan(html.indexOf('data-testid="sticky-actions"'));
    // the tabs run edge to edge with 44 px tabs
    expect(html).toContain("-mx-4 px-4 [&amp;&gt;[role=tab]]:min-h-11");
  });

  it("a phone: open points as cards; a reader without a review of its own gets no bar", () => {
    const { s, review, op } = world();
    expect(page("phone", s, "rmm", `/cases/${review}?tab=points`)).toMatch(new RegExp(`<li data-testid="op-row-${op}"`));
    expect(page("phone", s, "auditor", `/cases/${review}`)).not.toContain("sticky-actions");
  });

  it("a phone: the final document's Download PDF is in the bar, alone, not in the document's header", () => {
    const { s, done } = world();
    const html = page("phone", s, "rmm", `/cases/${done}?tab=final-document`);
    expect(html.match(/data-testid="fd-download-pdf"/g)?.length).toBe(1);
    const bar = html.slice(html.indexOf('data-testid="sticky-actions"'));
    expect(bar).toContain('data-testid="fd-download-pdf"');
    expect(bar).not.toContain("case-open-review");
  });

  it("a desktop: the Cases link, the action row in the header, no bar", () => {
    const { s, review, done } = world();
    const html = page("desktop", s, "rmm", `/cases/${review}`);
    expect(html).toContain('href="/cases"');
    expect(html).not.toContain("sticky-actions");
    expect(html).not.toContain('data-testid="case-meta"');
    expect(page("desktop", s, "rmm", `/cases/${done}?tab=final-document`)).toContain('data-testid="fd-download-pdf"');
  });
});

describe("New case, the dashboard, the suppliers and the audit trail", () => {
  it("New case: Create in the bar on a phone (submitting the form by its id), in the form's own row on a desktop", () => {
    const { s } = world();
    const phone = page("phone", s, "rmm", "/cases/new");
    const id = phone.match(/<form id="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(phone.slice(phone.indexOf('data-testid="sticky-actions"'))).toContain(`form="${id}"`);
    const desktop = page("desktop", s, "rmm", "/cases/new");
    expect(desktop).not.toContain("sticky-actions");
    expect(desktop).toContain('<form noValidate="" class="space-y-6 xl:col-span-2"');
  });

  it("the dashboard's My cases are cards on a phone", () => {
    const { s, review } = world();
    expect(page("phone", s, "rmm", "/rmm")).toMatch(new RegExp(`<li data-testid="dashboard-case-${review}"`));
    expect(page("desktop", s, "rmm", "/rmm")).toMatch(new RegExp(`<tr class="[^"]*" data-testid="dashboard-case-${review}"`));
  });

  it("the administrator reads the supplier master on a phone, with the larger-screen note and no editing", () => {
    const { s } = world();
    const sup = s.suppliers[0]!.id;
    const list = page("phone", s, "admin", "/suppliers");
    expect(list).toContain('data-testid="larger-screen-note"');
    expect(list).not.toContain("supplier-add");
    expect(list).toMatch(new RegExp(`<li data-testid="supplier-row-${sup}"`));
    const detail = page("phone", s, "admin", `/suppliers/${sup}`);
    expect(detail).toContain('data-testid="larger-screen-note"');
    expect(detail).not.toMatch(/supplier-edit|supplier-deactivate|contact-add|contact-edit-|contact-deactivate-/);
    // a desktop: the administrator edits, no note; RMM reads with its own note
    expect(page("desktop", s, "admin", "/suppliers")).toContain('data-testid="supplier-add"');
    expect(page("desktop", s, "admin", `/suppliers/${sup}`)).toContain('data-testid="supplier-edit"');
    expect(page("phone", s, "rmm", "/suppliers")).toContain('data-testid="suppliers-read-only"');
    expect(page("phone", s, "rmm", "/suppliers")).not.toContain("larger-screen-note");
  });

  it("the audit trail: event cards and Filters on a phone; the table and the filter card on a desktop", () => {
    const { s } = world();
    const phone = page("phone", s, "auditor", "/audit");
    expect(phone).toMatch(/<li data-testid="audit-row-/);
    expect(phone).toContain('data-testid="audit-filters-open"');
    expect(phone).not.toContain('data-testid="audit-filter-case"');
    const desktop = page("desktop", s, "auditor", "/audit");
    expect(desktop).toMatch(/<tr class="[^"]*" data-testid="audit-row-/);
    expect(desktop).toContain('data-testid="audit-filter-case"');
  });
});
