// The screens of Thomas's 29 Oct decision, rendered to HTML (the portal renders the supplier's screens too): a
// documents-only section whose upload the version requires ("Documents · mandatory upload", the Cannot provide path, the
// navigator and the reviewers' status) and an optional requested document (no asterisk, no "Cannot provide", never a red
// "Missing"; RMM's evidence chips neutral). A case on the earlier version keeps today's wording. Fictional data only.
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { RequestedDocsList, SectionUploadRow } from "@/components/RequestedDocs";
import * as A from "@/domain/actions";
import { draftPair } from "@/domain/configActions";
import { syncRegistry } from "@/domain/rules";
import { PLAIN_CONFIG, Scenario } from "@/domain/testkit";
import type { CiqCase } from "@/domain/types";
import { StoreContext, type StoreApi } from "@/store/store";
import { SectionContent } from "../review/SectionContent";
import { buildOutline } from "../rmm/tabs/questionnaireOutline";
import { ScopeCard, SectionPanel as RmmSectionPanel } from "../rmm/tabs/QuestionnaireSections";
import { Questionnaire } from "./Questionnaire";
import { RequestedDocuments } from "./RequestedDocuments";
import { SectionPanel } from "./SectionPanel";

const ADMIN = "u-admin";
const COC = "Supplier code of conduct";
const SITE = "Additional site certificate";
const K_COC = "EV:supplier-code-of-conduct";
const K_SITE = "EV:additional-site-certificate";
const flat = (html: string) => html.replace(/<!-- -->/g, "");
const noop = () => undefined;
const none = { fields: new Set<string>(), sections: new Set<string>(), wholeSections: new Set<string>(), rows: new Set<string>() };

/** v2 published with a case on it (`old`), then v3: K3 "Upload required? Mandatory" and R-122 (every case: the code of
 *  conduct, optional; the site certificate, mandatory); a case on v3 (`fresh`), both with the plain metadata answers. */
function world() {
  const sc = new Scenario();
  sc.step("publish v2", (s, at) => A.publishDraft(s, ADMIN, "Turkey REACH.", at));
  sc.create({ materialNo: "RM-510001" }).metadata(PLAIN_CONFIG);
  const old = sc.id;
  sc.step("create v3", (s, at) => A.createDraft(s, ADMIN, "Document requiredness", at));
  const k3 = draftPair(sc.s)!.template.sections.find((x) => x.id === "K3")!;
  sc.step("K3 upload mandatory", (s, at) => A.upsertSection(s, ADMIN, { id: "K3", code: k3.code, title: k3.title, kind: k3.kind, meaning: k3.meaning, lead: k3.lead, co: k3.co, documentsOnly: true, uploads: "mandatory" }, at).state);
  sc.step("R-122", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "always" }, activates: [], outcome: "mandatory", evidence: [COC, SITE], optionalEvidence: [COC], departments: ["QM"], basis: "agreed" }, at).state);
  sc.step("publish v3", (s, at) => A.publishDraft(s, ADMIN, "K3 upload mandatory; optional code of conduct.", at));
  sc.create({ materialNo: "RM-510002" }).metadata(PLAIN_CONFIG);
  syncRegistry(sc.s.config);
  const caseOf = (id: string) => sc.s.cases.find((x) => x.id === id)!;
  return { sc, old: caseOf(old), fresh: caseOf(sc.id) };
}

const renderWith = (sc: Scenario, node: React.ReactNode) => {
  const api = { state: sc.s, me: sc.s.users.find((u) => u.id === "u-sup-1")!, setJustification: noop, uploadDocument: noop, notify: noop, setAnswer: noop } as unknown as StoreApi;
  return flat(renderToString(<StoreContext.Provider value={api}>{node}</StoreContext.Provider>));
};
const supplierSection = (sc: Scenario, c: CiqCase, sectionId: string) => renderWith(sc, <SectionPanel c={c} sec={{ sectionId, applicability: "mandatory" }} locked={false} requested={none} focusField={null} focusRow={null} onSelect={noop} />);

afterEach(() => syncRegistry(undefined));

describe("supplier: a documents-only section whose upload is mandatory", () => {
  it("says so in the badge and the upload area, with an asterisk and the Cannot provide path", () => {
    const { sc, fresh } = world();
    const html = supplierSection(sc, fresh, "K3");
    expect(html).toContain("Documents · mandatory upload");
    expect(html).toContain('data-testid="q-documents-K3" data-required="true" data-status="missing"');
    expect(html).toContain("Beiersdorf needs at least one document here");
    expect(html).not.toContain("It does not block your completeness confirmation");
    expect(html).toContain("Required: at least one document.");
    expect(html).toContain('aria-label="required"');
    expect(html).toContain('data-testid="q-justify-DOC:K3"');
    expect(html).toContain("0 of 1 answered");
  });

  it("with a justification: counted as answered, shown with the reason", () => {
    const { sc, fresh } = world();
    sc.id = fresh.id;
    sc.step("justify", (s, at) => A.setJustification(s, "u-sup-1", fresh.id, "DOC:K3", "No storage statement per raw material.", at));
    const html = supplierSection(sc, sc.c, "K3");
    expect(html).toContain('data-status="justified"');
    expect(html).toContain("No storage statement per raw material.");
    expect(html).toContain("Complete");
  });

  it("a case on the earlier version keeps today's optional upload", () => {
    const { sc, old } = world();
    const html = supplierSection(sc, old, "K3");
    expect(html).toContain(">Documents only<");
    expect(html).not.toContain("mandatory upload");
    expect(html).toContain("It does not block your completeness confirmation.");
    expect(html).toContain("Optional. Each file is listed with its upload date.");
    expect(html).not.toContain("q-justify-DOC:K3");
  });

  it("the navigator: “Documents · mandatory upload”, then the documents added", () => {
    const { sc, fresh } = world();
    const nav = (c: CiqCase) => {
      const html = renderWith(sc, <MemoryRouter initialEntries={[`/portal/case/${c.id}?s=K3`]}><Questionnaire c={c} locked={false} /></MemoryRouter>);
      const at = html.indexOf('data-testid="q-nav-K3"');
      return html.slice(at, html.indexOf("</button>", at));
    };
    expect(nav(fresh)).toContain("Documents · mandatory upload");
    sc.id = fresh.id;
    sc.step("upload", (s, at) => A.uploadDocument(s, "u-sup-1", fresh.id, { name: "Storage.pdf", kind: "Statement", sectionId: "K3" }, at).state);
    expect(nav(sc.c)).toContain("Documents · 1 document added");
    expect(nav(world().old)).toContain("Documents only · optional upload");
  });
});

describe("a documents-only section with an optional upload and a mandatory requested document", () => {
  /** v3: a rule for every case makes K8.1 (documents only, upload Optional) optional and asks for a document no question
   *  collects, left Mandatory: its slot sits in K8.1 and blocks. */
  function slotWorld() {
    const sc = new Scenario();
    sc.step("publish v2", (s, at) => A.publishDraft(s, ADMIN, "Turkey REACH.", at));
    sc.step("create v3", (s, at) => A.createDraft(s, ADMIN, "Microplastics", at));
    sc.step("R-122", (s, at) => A.upsertRule(s, ADMIN, { condition: { kind: "always" }, activates: ["K8.1"], outcome: "optional", evidence: ["Microplastics test report"], departments: ["SAF"], basis: "agreed" }, at).state);
    sc.step("publish v3", (s, at) => A.publishDraft(s, ADMIN, "Microplastics test report.", at));
    sc.create({ materialNo: "RM-510004" }).metadata(PLAIN_CONFIG);
    syncRegistry(sc.s.config);
    return sc;
  }

  it("the supplier: no “does not block”, a requested-documents badge", () => {
    const sc = slotWorld();
    const html = supplierSection(sc, sc.c, "K8.1");
    expect(html).toContain("Documents · requested documents");
    expect(html).not.toContain(">Documents only<");
    expect(html).not.toContain("does not block");
    expect(html).toContain("This upload is optional. Beiersdorf also needs the requested documents below");
    expect(html).toContain('data-testid="q-reqdoc-EV:microplastics-test-report"');
    expect(html).toContain("0 of 1 answered");
  });

  it("the reviewer: no “Documents only · optional” badge, no “does not block”", () => {
    const sc = slotWorld();
    const html = renderWith(sc, <SectionContent c={sc.c} state={sc.s} sectionId="K8.1" mine canAsk={false} onAsk={noop} onFocusOp={noop} />);
    expect(html).toContain("Documents · requested documents");
    expect(html).not.toContain("Documents only · optional");
    expect(html).not.toContain("does not block");
    expect(html).toContain("The requested documents below block completeness until each is uploaded or justified.");
  });
});

describe("supplier: an optional requested document", () => {
  it("has no asterisk and no Cannot provide; the mandatory one keeps both", () => {
    const { sc, fresh } = world();
    const html = renderWith(sc, <RequestedDocuments c={fresh} sectionId="K1" locked={false} requested={none} focusField={null} />);
    expect(html).toContain("Beiersdorf needs the documents marked * for this raw material");
    const coc = html.slice(html.indexOf(`data-testid="q-reqdoc-${K_COC}"`), html.indexOf(`data-testid="q-reqdoc-${K_SITE}"`));
    const site = html.slice(html.indexOf(`data-testid="q-reqdoc-${K_SITE}"`));
    expect(coc).toContain('data-optional="true"');
    expect(coc).toContain(">Optional<");
    expect(coc).not.toContain('aria-label="required"');
    expect(coc).not.toContain(`q-justify-${K_COC}`);
    expect(site).toContain('data-optional="false"');
    expect(site).toContain('aria-label="required"');
    expect(site).toContain(`q-justify-${K_SITE}`);
  });
});

describe("Beiersdorf's views", () => {
  it("review workspace: the badge, the wording and the upload's status; the earlier version stays optional", () => {
    const { sc, fresh, old } = world();
    const view = (c: CiqCase) => renderWith(sc, <SectionContent c={c} state={sc.s} sectionId="K3" mine canAsk={false} onAsk={noop} onFocusOp={noop} />);
    const html = view(fresh);
    expect(html).toContain("Documents · mandatory upload");
    expect(html).toContain("the upload is mandatory");
    expect(html).toContain('data-testid="section-upload-K3" data-status="missing"');
    expect(html).toContain("It blocks the completeness confirmation and the final release.");
    const before = view(old);
    expect(before).toContain("Documents only · optional");
    expect(before).not.toContain("section-upload-K3");
  });

  it("requested documents: an optional one left out is “Not provided (optional)”, never a red Missing", () => {
    const { sc, fresh } = world();
    const html = renderWith(sc, <RequestedDocsList c={fresh} state={sc.s} sectionId="K1" />);
    const coc = html.slice(html.indexOf(`data-testid="reqdoc-${K_COC}"`), html.indexOf(`data-testid="reqdoc-${K_SITE}"`));
    const site = html.slice(html.indexOf(`data-testid="reqdoc-${K_SITE}"`));
    expect(coc).toContain('data-optional="true"');
    expect(coc).toContain("Not provided (optional)");
    expect(coc).not.toContain(">Missing<");
    expect(coc).not.toContain("It blocks");
    expect(site).toContain(">Missing<");
    expect(site).toContain("It blocks the completeness confirmation and the final release.");
  });

  it("an upload row only where the case requires the upload", () => {
    const { sc, fresh, old } = world();
    expect(renderWith(sc, <SectionUploadRow c={fresh} state={sc.s} sectionId="K3" />)).toContain("Mandatory upload: at least one document");
    expect(renderWith(sc, <SectionUploadRow c={old} state={sc.s} sectionId="K3" />)).toBe("");
    expect(renderWith(sc, <SectionUploadRow c={fresh} state={sc.s} sectionId="K8.1" />)).toBe("");
  });

  it("RMM's Questionnaire tab: K3 counts the upload; the optional document's chip is neutral", () => {
    const { sc, fresh } = world();
    const outline = buildOutline(fresh);
    const k3 = outline.items.find((i) => i.id === "K3")!;
    expect(k3).toMatchObject({ status: "missing", done: 0, total: 1 });
    expect(outline.items.find((i) => i.id === "K8.1")?.status).toBe("docs");
    const panel = renderWith(sc, <RmmSectionPanel c={fresh} item={k3} onOpenPoints={noop} />);
    expect(panel).toContain('data-testid="section-upload-K3" data-status="missing"');
    const card = renderWith(sc, <ScopeCard c={fresh} />);
    expect(card).toContain(`data-testid="q-evidence-R-122-Supplier-code-of-conduct" data-state="optional"`);
    expect(card).toContain("· optional, not provided");
    expect(card).toContain(`data-testid="q-evidence-R-122-Additional-site-certificate" data-state="missing"`);
  });

  it("RMM's evidence chips: evidence an optional question collects is not “missing” either", () => {
    const sc = new Scenario();
    sc.step("publish v2", (s, at) => A.publishDraft(s, ADMIN, "Turkey REACH.", at));
    sc.step("create v3", (s, at) => A.createDraft(s, ADMIN, "Sustainability certificates optional", at));
    const f = draftPair(sc.s)!.template.sections.find((x) => x.id === "K1")!.fields.find((x) => x.id === "FLD-K1-005")!;
    sc.step("K1-005 optional", (s, at) => A.upsertField(s, ADMIN, "K1", { id: f.id, label: f.label, type: f.type, required: "optional", owner: f.owner, ...(f.help ? { help: f.help } : {}) }, at).state);
    sc.step("publish v3", (s, at) => A.publishDraft(s, ADMIN, "Sustainability certificates optional.", at));
    sc.create({ materialNo: "RM-510003" }).metadata(PLAIN_CONFIG);
    syncRegistry(sc.s.config);
    const card = renderWith(sc, <ScopeCard c={sc.c} />);
    expect(card).toContain(`data-testid="q-evidence-R-10-Sustainability-certificates" data-state="optional"`);
    // the mandatory question's evidence still shows as missing
    expect(card).toContain(`data-testid="q-evidence-R-00-SDS" data-state="missing"`);
  });
});
