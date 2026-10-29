// The review screens on a phone (Thomas, 30 Oct: below 768 px): My reviews as stacked cards, the workspace's section
// picker and jumps instead of the left column, the composition (K2.1 and the RMES) as stacked rows, 44 px actions and
// the completion bar as the page's sticky action bar. Rendered on the server with the phone mode forced
// (LayoutModeContext); without it the same screens render their desktop markup (tables, the section list).
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PERSONA_BY_ID } from "@/domain/catalog";
import { Scenario } from "@/domain/testkit";
import type { AppState, InternalPersonaId } from "@/domain/types";
import { LayoutModeContext, type LayoutMode } from "@/shell/useLayoutMode";
import { StoreContext, type StoreApi } from "@/store/store";
import { ReviewQueue, ReviewWorkspace } from "./index";
import { RmesTab } from "./RmesTab";

const flat = (node: ReactNode) => renderToString(node).replace(/<!-- -->/g, "");

function storeFor(state: AppState, personaId: InternalPersonaId): StoreApi {
  const persona = PERSONA_BY_ID[personaId];
  const me = state.users.find((u) => u.id === persona.userId)!;
  const base = { state, persona, me } as Record<string, unknown>;
  return new Proxy(base, { get: (t, k: string) => (k in t ? t[k] : () => undefined) }) as unknown as StoreApi;
}
function render(state: AppState, personaId: InternalPersonaId, path: string, mode: LayoutMode | null = "phone") {
  return flat(
    <LayoutModeContext.Provider value={mode}>
      <StoreContext.Provider value={storeFor(state, personaId)}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/review" element={<ReviewQueue />} />
            <Route path="/review/:caseId" element={<ReviewWorkspace />} />
          </Routes>
        </MemoryRouter>
      </StoreContext.Provider>
    </LayoutModeContext.Provider>,
  );
}

// a case in review: Safety asked on K2.1 and the supplier answered, Microbiology asked on K1
const sc = new Scenario().toReview();
sc.raise("SAF", "u-saf", "K2.1", "Please confirm the CAS number.");
const safOp = sc.op().id;
sc.answer(safOp);
sc.raise("MIC", "u-mic", "K1", "Please confirm the shelf life.");
const id = sc.id;

describe("the review screens on a phone", () => {
  it("My reviews: stacked cards (the row test id on each card, its whole card a button), no table", () => {
    const html = render(sc.s, "saf", "/review");
    expect(html).toContain('data-testid="review-cards"');
    expect(html).toMatch(new RegExp(`<li data-testid="review-row-${id}"[^>]*><button type="button"`));
    expect(html).not.toContain("<table");
    // the phone header names the page: the page's own h1 is for screen readers only, the search fills the width
    expect(html).toContain('<h1 class="sr-only">My reviews</h1>');
    expect(html).toContain('data-testid="review-search"');
    // the tabs fit: "Waiting", with "for supplier" for screen readers
    expect(html).toContain('Waiting<span class="sr-only"> for supplier</span>');
  });

  it("the workspace: the section picker (previous, the section, next) and the jumps instead of the left column", () => {
    const html = render(sc.s, "saf", `/review/${id}?s=K1`);
    for (const t of ["section-picker", "section-prev", "section-picker-open", "section-next", "workspace-jumps", "jump-decision-card", "jump-my-open-points", "jump-internal-notes", "section-next-end"]) expect(html).toContain(`data-testid="${t}"`);
    expect(html).not.toContain('data-testid="section-nav"');
    // no back link of its own (the phone header's arrow) and the other reviews as short lines of text
    expect(html).not.toContain("My reviews</a>");
    expect(html).toContain('data-testid="workspace-other-reviews"');
    // "Ask" beside each answer, a 44 px target that keeps its full label for screen readers
    expect(html).toMatch(/<button aria-label="Ask supplier about [^"]+" data-testid="ask-field-[^"]+" class="[^"]*min-h-11[^"]*min-w-11/);
  });

  it("the composition of K2.1 and of the RMES: one stacked row per component, no table", () => {
    const k21 = render(sc.s, "saf", `/review/${id}?s=K2.1`);
    expect(k21).toContain('data-testid="component-table"');
    expect(k21).toMatch(/data-testid="component-row-[^"]+"/);
    expect(k21).toMatch(/data-testid="ask-row-[^"]+"/);
    expect(k21).not.toContain("<table");
    const rmes = flat(
      <LayoutModeContext.Provider value="phone">
        <RmesTab c={sc.c} state={sc.s} onJump={() => {}} />
      </LayoutModeContext.Provider>,
    );
    expect(rmes).toMatch(/data-testid="rmes-row-[^"]+"/);
    expect(rmes).not.toContain("<table");
    for (const f of ["FLD-2.1-001", "FLD-2.1-007", "FLD-2.1-002", "FLD-2.1-003", "FLD-2.3-01"]) expect(rmes).toContain(f);
  });

  it("the raiser's decision on an answer: Accept and Return side by side, every action 44 px", () => {
    const html = render(sc.s, "saf", `/review/${id}?s=K2.1`);
    const decide = html.split(`data-testid="op-decide-${safOp}"`)[1]!.split('data-testid="op-history-')[0]!;
    expect(decide).toContain('class="grid grid-cols-2 gap-2"');
    for (const t of [`op-accept-${safOp}`, `op-return-${safOp}`, `op-not-accepted-${safOp}`, `op-edit-${safOp}`, `op-close-${safOp}`]) expect(decide).toMatch(new RegExp(`class="[^"]*min-h-11[^"]*" data-testid="${t}"`));
  });

  it("the completion bar is the page's sticky action bar above the tab bar, with the blockers' toggle and the button", () => {
    const html = render(sc.s, "saf", `/review/${id}`);
    const bar = /<div data-testid="complete-bar"[^>]* class="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(bar).toContain("sticky bottom-[var(--app-tabbar-h,0px)]");
    for (const t of ["blockers-toggle", "complete-review"]) expect(html).toContain(`data-testid="${t}"`);
    // one row while folded: the blockers and the decision line show when the toggle opens them
    expect(html).not.toContain('data-testid="blocker-list"');
    expect(html).not.toContain('data-testid="complete-decision"');
  });

  it("without a forced mode (a big screen) the same screens keep their tables and the section list", () => {
    expect(render(sc.s, "saf", "/review", null)).toContain("<table");
    const ws = render(sc.s, "saf", `/review/${id}?s=K2.1`, null);
    expect(ws).toContain('data-testid="section-nav"');
    expect(ws).toContain("<table");
    expect(ws).not.toContain('data-testid="section-picker"');
    expect(ws).not.toContain("sticky-actions");
  });
});
