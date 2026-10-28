// The supplier screens after the matrix v0.6 check (28 Oct), rendered to HTML (the portal renders the same screens):
// the K2.1 editor's Additive Yes/No with no default (L5), its labels (L4, M2) and the origin check (D6); blank values as
// "—"; no "Cannot provide" on a chain controller (D10); the derived Annex 1 country of origin, locked (L6); the
// FLD-A1-104 hint (M8) and the "Pre-filled" attribution (M9). Fictional data only.
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fieldOf } from "@/domain/catalog";
import { Scenario } from "@/domain/testkit";
import type { CiqCase, ComponentRow } from "@/domain/types";
import { StoreContext, type StoreApi } from "@/store/store";
import { ComponentTable as ReviewComponentTable } from "../review/ComponentTable";
import { ComponentTable } from "./ComponentTable";
import { FieldRenderer } from "./FieldRenderer";

const flat = (html: string) => html.replace(/<!-- -->/g, "");
const sc = new Scenario().create().metadata().fillMandatory();
const noop = () => undefined;
const api = { state: sc.s, me: sc.s.users.find((u) => u.id === "u-sup-1")!, setAnswer: noop, setJustification: noop, setComponents: noop, uploadDocument: noop, notify: noop } as unknown as StoreApi;
const render = (node: React.ReactNode) => flat(renderToString(<StoreContext.Provider value={api}>{node}</StoreContext.Provider>));
const withRows = (c: CiqCase, components: ComponentRow[]): CiqCase => ({ ...c, components });
const BLANK: ComponentRow = { id: "c2", inci: "", fn: "", additive: null, origin: "mineral", concMin: null, concMax: null };

describe("K2.1 editor (matrix v0.6)", () => {
  const html = render(<ComponentTable c={withRows(sc.c, [...sc.c.components, BLANK])} editable focusRow="c2" />);

  it("asks Additive as an explicit Yes/No with no default, one per row", () => {
    expect(html).toContain('data-testid="q-component-additive-c1"');
    expect(html).toContain('data-testid="q-component-additive-c2"');
    const c2 = html.slice(html.indexOf('data-testid="q-component-additive-c2"'));
    const group = c2.slice(0, c2.indexOf("</div>"));
    expect(group.match(/aria-pressed="true"/g)).toBeNull();
    expect(group).toContain("Additive?");
    expect(html).not.toContain('type="checkbox"');
  });

  it("labels INCI (European) / IUPAC with its guidance, and EC or the REACH registration number", () => {
    expect(html).toContain("INCI (European) / IUPAC");
    expect(html).toContain("The INCI name. If there is none: the chemical name (IUPAC). For colorants, also the Colour Index number.");
    expect(html).toContain("EC number (EINECS/ELINCS/NLP) or REACH registration no.");
    expect(html).toContain('placeholder="e.g. Tocopherol"');
    expect(html).toContain('placeholder="e.g. antioxidant"');
  });

  it("the row opened from the completeness check shows what is missing, and an origin not selected in SF-01", () => {
    expect(html).toContain("Required");
    expect(html).toContain("Enter a minimum and a maximum concentration");
    expect(html).toContain("Not one of the origins you selected in the metadata questions");
    expect(html).toContain("each selected origin must be used by a component");
  });

  it("read-only: blank values and an unanswered additive as '—'", () => {
    const ro = render(<ComponentTable c={withRows(sc.c, [BLANK])} editable={false} />);
    expect(ro).toContain("INCI / IUPAC");
    expect(ro).toContain("EC / REACH no.");
    expect(ro.match(/<td[^>]*>—<\/td>/g)?.length).toBeGreaterThanOrEqual(4); // INCI, function, additive, concentration
    expect(ro).not.toContain("null");
  });

  it("the reviewers' table: '—' for a blank range, the Additive badge only for Yes", () => {
    const rv = flat(renderToString(<ReviewComponentTable c={withRows(sc.c, [{ ...BLANK, inci: "Mica" }, { ...sc.c.components[0], additive: true }])} state={sc.s} canAsk={false} onAsk={noop} onFocusOp={noop} />));
    expect(rv).toContain(">—</td>");
    expect(rv).toContain("Additive: —");
    expect(rv.match(/>Additive</g)?.length).toBe(1);
  });
});

describe("questions (matrix v0.6)", () => {
  const field = (id: string) => fieldOf(id, sc.c.templateVersion, sc.s.config)!;

  it("no 'Cannot provide' on the chain controllers FLD-A1-201, FLD-A1-204, FLD-A4-102; still on an ordinary question", () => {
    const empty = { ...sc.c, answers: { ...sc.c.answers, "FLD-A1-201": null, "FLD-A1-204": null, "FLD-A4-102": null, "FLD-2.1-102": null } };
    for (const id of ["FLD-A1-201", "FLD-A1-204", "FLD-A4-102"]) expect(render(<FieldRenderer c={empty} f={field(id)} editable />), id).not.toContain(`q-justify-${id}`);
    expect(render(<FieldRenderer c={empty} f={field("FLD-2.1-102")} editable />)).toContain("q-justify-FLD-2.1-102");
  });

  it("the Annex 1 country of origin shows K2.3's answer, locked, even where the section is editable", () => {
    const html = render(<FieldRenderer c={sc.c} f={field("FLD-A1-105")} editable />);
    expect(html).toContain(String(sc.c.answers["FLD-2.3-10"]));
    expect(html).toContain('aria-label="Locked"');
    expect(html).toContain('data-answered="true"');
    expect(html).toContain('data-required="false"');
    expect(html).not.toContain("q-justify-FLD-A1-105");
  });

  it("FLD-A1-104 outside every component's range: a hint that does not block", () => {
    const c = { ...sc.c, answers: { ...sc.c.answers, "FLD-A1-104": 50 } };
    const html = render(<FieldRenderer c={c} f={field("FLD-A1-104")} editable />);
    expect(html).toContain('data-testid="q-hint-FLD-A1-104"');
    expect(html).toContain("This is a hint only and does not block your submission.");
    expect(render(<FieldRenderer c={{ ...c, answers: { ...c.answers, "FLD-A1-104": 95 } }} f={field("FLD-A1-104")} editable />)).not.toContain("q-hint-FLD-A1-104");
  });

  it("FLD-A2-101 filled in when Annex 2 opened reads 'Pre-filled'", () => {
    expect(sc.c.answeredBy["FLD-A2-101"]?.by).toBe("system");
    expect(render(<FieldRenderer c={sc.c} f={field("FLD-A2-101")} editable />)).toContain("Pre-filled ·");
  });
});
