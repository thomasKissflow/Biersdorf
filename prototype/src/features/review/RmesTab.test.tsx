// The RMES tab (BDF's e-mail of 28 Oct): the read-only sheet of exactly 8 fields from rmesSheet(), each with its CIQ
// source, the record line, the two origin columns with the shared free-text footnote, and one notice instead of the
// fields when the live app could not read the case. No input, no criteria, findings or decision on it.
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppExtrasContext, type LiveAppExtras } from "@/app-live/extras";
import { NOT_ANSWERED, RMES_FREE_TEXT_NOTE, RMES_RECORD_NO_TIME, RMES_UNREADABLE } from "@/domain/rmesSheet";
import { Scenario } from "@/domain/testkit";
import type { CiqCase, ComponentRow } from "@/domain/types";
import { RmesTab } from "./RmesTab";

const flat = (node: ReactNode) => renderToString(node).replace(/<!-- -->/g, "");
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sc = new Scenario().toReview();
const tab = (c: CiqCase) => flat(<RmesTab c={c} state={sc.s} onJump={() => {}} />);
const row = (id: string, origin: ComponentRow["origin"], extra: Partial<ComponentRow> = {}): ComponentRow => ({ id, inci: `INCI ${id}`, fn: "emollient", additive: false, origin, concMin: 1, concMax: 2, ...extra });

describe("the RMES tab", () => {
  const html = tab(sc.c);

  it("shows the record line, the 3 header fields and the composition with its 6 columns, each with its CIQ source", () => {
    expect(html).toContain(esc(`RMES · ${sc.id} · internal: never visible to the supplier · filled automatically from the CIQ`));
    expect(html).toContain("Record created ");
    for (const key of ["material", "supplier", "manufacturer"]) expect(html).toContain(`data-testid="rmes-header-${key}"`);
    for (const t of ["Raw material / tradename", "Supplier", "Manufacturer", "OLIVIA Pure 100", "Solvaro Oleochemicals S.A."]) expect(html).toContain(esc(t));
    for (const id of ["FLD-GEN-001", "FLD-GEN-002", "FLD-GEN-004", "FLD-2.1-101", "FLD-2.3-10"]) expect(html).toContain(`data-testid="rmes-source-${id}"`);
    const heads = [...html.matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    expect(heads).toEqual(["#", "INCI FLD-2.1-001", "% FLD-2.1-007", "CAS # FLD-2.1-002", "EC # FLD-2.1-003", "Source of origin FLD-2.3-01", "Free text per origin type (K2.3)"]);
    for (const t of ["Olea Europaea Fruit Oil", "90–99 %", "8001-25-0", "Vegetable (bio mass)", "Bark"]) expect(html).toContain(esc(t));
    expect(html).toContain(esc(RMES_FREE_TEXT_NOTE));
  });

  it("is read-only and holds nothing of the retired criteria RMES, the decision or the not-yellow fields", () => {
    expect(html).not.toMatch(/<(input|textarea|select)\b/);
    expect(html).not.toMatch(/Process ID|RMT ID|IRMA|Declaration|criteri|finding|Part A|limit|AI suggestion|Approved|Rejected|Record approval/i);
    expect(html).not.toContain('data-testid="decision-card"');
  });

  it("shows a supplier's justification as such, an empty answer as not answered, and stars rows of a shared origin", () => {
    const c: CiqCase = {
      ...sc.c,
      answers: { ...sc.c.answers, "FLD-GEN-004": "", "FLD-2.3-11": "" },
      justifications: { ...sc.c.justifications, "FLD-GEN-004": "Toll manufacturer under NDA" },
      components: [row("a", "petrochemical", { concMin: 5, concMax: 5, cas: "", ec: "" }), row("b", "petrochemical")],
    };
    const h = tab(c);
    expect(h).toContain(esc("Cannot provide: Toll manufacturer under NDA"));
    expect(h).toContain(NOT_ANSWERED);
    expect(h).toContain(">5 %<");
    expect(h).toContain(`* ${esc(RMES_FREE_TEXT_NOTE)}`);
    expect(h.match(/<sup[^>]*>\*<\/sup>/g)).toHaveLength(2);
  });

  it("stars a vegetable and an animal row: they show the one Part(s) and Country the CIQ asks for both", () => {
    const h = tab({ ...sc.c, components: [row("v", "vegetable"), row("a", "animal"), row("p", "petrochemical")] });
    const stars = (id: string) => (h.split(`data-testid="rmes-row-${id}"`)[1]!.split("</tr>")[0]!.match(/<sup[^>]*>\*<\/sup>/g) ?? []).length;
    expect([stars("v"), stars("a"), stars("p")]).toEqual([2, 2, 0]); // Part(s) and Country in both, none on the petrochemical row
    expect(h).toContain(`* ${esc(RMES_FREE_TEXT_NOTE)}`);
  });

  it("says so when the supplier has not entered any component yet", () => {
    expect(tab({ ...sc.c, components: [] })).toContain("The supplier has not entered any component yet.");
  });

  it("names the record's state: created with its time, created without a known time, not created yet", () => {
    const at = (c: CiqCase) => /data-testid="rmes-record-at"[^>]*>([^<]*)</.exec(tab(c))?.[1] ?? "";
    expect(at(sc.c)).toMatch(/^Record created \S/);
    // live: the record's list row has no _created_at and its creation history row is missing (trackMap.rmesOf)
    expect(at({ ...sc.c, rmes: { ...sc.c.rmes!, createdAt: "" } })).toBe(esc(RMES_RECORD_NO_TIME));
    const none: CiqCase = { ...sc.c };
    delete none.rmes;
    expect(at(none)).toMatch(/^The internal RMES record is created/);
  });

  it("live, for a case the role could not read: one notice instead of the 8 fields", () => {
    const extras = { caseBanner: (id: string) => (id === sc.id ? "no read route for this role" : undefined) } as unknown as LiveAppExtras;
    const h = flat(
      <AppExtrasContext.Provider value={extras}>
        <RmesTab c={sc.c} state={sc.s} onJump={() => {}} />
      </AppExtrasContext.Provider>,
    );
    expect(h).toContain('data-testid="rmes-unreadable"');
    expect(h).toContain(esc(RMES_UNREADABLE));
    expect(h).not.toContain("rmes-header-");
    expect(h).not.toContain("rmes-composition");
    expect(h).not.toContain(sc.c.materialName);
  });
});
