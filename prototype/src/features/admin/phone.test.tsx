// The configuration pages on a phone (Thomas, 30 Oct): Rules, Questionnaire, Section owners and Reminders are read as
// cards by every internal role; for the business administrator the edit controls (and Test rules, Run reminders now)
// give way to "Use a larger screen to edit". Rendered on the server with the phone layout forced (LayoutModeContext);
// the journeys at 390 and 360 px are the harness's (phone-config, phone-config-ba). At 768 px and up nothing changes.
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LIVE_FEATURES, LiveFeaturesContext } from "@/components/liveFeatures";
import { PERSONA_BY_ID } from "@/domain/catalog";
import { buildSeed } from "@/domain/seed";
import type { AppState, InternalPersonaId } from "@/domain/types";
import { LayoutModeContext, type LayoutMode } from "@/shell/useLayoutMode";
import { StoreContext, type StoreApi } from "@/store/store";
import { OwnershipMatrix, ReminderSettings, RuleTable, TemplateManager } from "./index";

const flat = (html: string) => html.replace(/<!-- -->/g, "");
const seed = buildSeed();

function storeFor(state: AppState, personaId: InternalPersonaId): StoreApi {
  const persona = PERSONA_BY_ID[personaId];
  const me = state.users.find((u) => u.id === persona.userId)!;
  const base = { state, persona, me } as Record<string, unknown>;
  return new Proxy(base, { get: (t, k: string) => (k in t ? t[k] : () => undefined) }) as unknown as StoreApi;
}

function page(personaId: InternalPersonaId, path: string, layout: LayoutMode = "phone"): string {
  return flat(
    renderToString(
      <LayoutModeContext.Provider value={layout}>
        <LiveFeaturesContext.Provider value={LIVE_FEATURES}>
          <StoreContext.Provider value={storeFor(seed, personaId)}>
            <MemoryRouter initialEntries={[path]}>
              <Routes>
                <Route path="/admin/rules" element={<RuleTable />} />
                <Route path="/admin/templates" element={<TemplateManager />} />
                <Route path="/admin/ownership" element={<OwnershipMatrix />} />
                <Route path="/admin/notifications" element={<ReminderSettings />} />
              </Routes>
            </MemoryRouter>
          </StoreContext.Provider>
        </LiveFeaturesContext.Provider>
      </LayoutModeContext.Provider>,
    ),
  );
}

/** Every edit control of the four pages (the harness's ba-config-access list). */
const EDIT = [/data-testid="config-(discard-draft|check-publish|create-version)"/, /data-testid="rule-(add|edit-|delete-)/, /data-testid="view-draft"/, /data-testid="section-(add|edit-|retire-|restore-)/, /data-testid="owner-restore-/, /<button[^>]*data-testid="owner-cell-/, /data-testid="reminder-toggle-/, /data-testid="run-reminders"/];
const editControls = (html: string) => EDIT.filter((re) => re.test(html)).map(String);
const PAGES = ["/admin/rules", "/admin/templates", "/admin/ownership", "/admin/notifications"];

describe("the configuration pages on a phone", () => {
  it("business administrator: the note to use a larger screen instead of every edit control; viewing still works", () => {
    for (const p of PAGES) {
      const html = page("admin", p);
      expect(html, p).toContain('data-testid="larger-screen-note"');
      expect(html, p).toContain("Use a larger screen to edit.");
      expect(editControls(html), p).toEqual([]);
      expect(html, p).not.toContain("<table");
      expect(html, p).not.toContain('data-testid="admin-read-only"');
    }
    // on a big screen the same pages keep their edit controls and show no note
    for (const p of PAGES) {
      const html = page("admin", p, "desktop");
      expect(html, p).not.toContain('data-testid="larger-screen-note"');
      expect(editControls(html).length, p).toBeGreaterThan(0);
    }
  });

  it("other roles: the read-only note as before, no larger-screen note", () => {
    for (const persona of ["rmm", "saf", "auditor"] as InternalPersonaId[])
      for (const p of PAGES.slice(0, 3)) {
        const html = page(persona, p);
        expect(html, `${persona} ${p}`).toContain('data-testid="admin-read-only"');
        expect(html, `${persona} ${p}`).not.toContain('data-testid="larger-screen-note"');
        expect(editControls(html), `${persona} ${p}`).toEqual([]);
      }
  });

  it("Rules: each rule a card with its row's test id, grouped by question; the version history folded; no Test rules", () => {
    const html = page("admin", "/admin/rules");
    expect(html).toContain('data-testid="rule-list-phone"');
    expect(html).toMatch(/<li[^>]*data-testid="rule-row-R-12"/);
    expect(html).toContain("Origin includes Animal");
    // folded: one line that says how many versions and which one is shown (it opens as a list in the harness)
    expect(html).toMatch(/<button[^>]*data-testid="config-history-toggle"[^>]*aria-expanded="false"/);
    expect(html).toContain("2 versions · viewing RS-2026.2 + v2");
    expect(html).not.toContain('data-testid="ruleset-card-');
    expect(html).not.toContain('data-testid="rules-tab"');
    // an old Test rules link shows the rules on a phone
    const test = page("admin", "/admin/rules?tab=test&view=try");
    expect(test).not.toContain('data-testid="test-rules"');
    expect(test).toContain('data-testid="rule-list-phone"');
  });

  it("Questionnaire: each section a card that opens its read-only view; the filter stays", () => {
    const html = page("rmm", "/admin/templates");
    expect(html).toContain('data-testid="sections-phone"');
    expect(html).toMatch(/<li[^>]*data-testid="section-row-K1"[^>]*><button/);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('data-testid="config-history-toggle"');
  });

  it("Section owners: every department of a section keeps its cell (status, label); the totals per department", () => {
    const html = page("saf", "/admin/ownership");
    expect(html).toContain('data-testid="owners-phone"');
    expect(html).toMatch(/<span[^>]*data-testid="owner-cell-K1-SUS"[^>]*data-status="none"/);
    expect(html).toMatch(/<span[^>]*data-testid="owner-cell-GEN-RMM"[^>]*data-status="lead"/);
    expect(html).toContain('data-testid="owner-totals"');
    expect(html).toContain("Not involved");
  });

  it("Reminders: the rules as read-only cards, no Run reminders now", () => {
    const html = page("admin", "/admin/notifications");
    expect(html).toMatch(/<li[^>]*data-testid="reminder-row-rem-1"/);
    expect(html).not.toMatch(/<input[^>]*data-testid="reminder-after-/);
    expect(html).not.toContain('data-testid="run-reminders-as-of"');
  });
});
