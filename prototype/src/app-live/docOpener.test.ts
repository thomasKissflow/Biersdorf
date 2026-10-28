// Opening the supplier's files (27 Oct): the opener picks the entry's own `file`, else the case's portal request's
// Supplier_Files by attachmentId (read once per case), else the quiet note; Kissflow's preview gets every openable file
// of the case's list, on the clicked one. Against the fake client (kf/fakeClient.ts previewFiles, portalGet).
import { describe, expect, it } from "vitest";
import type { RawItem } from "@/portal/data/raw";
import { createDocOpener, docEntriesOf, docIndexOf, previewPlan, previewable, requestKeyOf, type CaseDocs, type DocOpenerDeps } from "./docOpener";
import { createFakeClient, type FakeOptions } from "./kf/fakeClient";
import { toAppState } from "./map/toAppState";
import { fixtureInput, fixtureSnapshot } from "./testing/rawFixtures";

const file = (id: string, name: string) => ({ id, key: `upload/2/AcTEST/${id}/${name}`, name, size: 1200, fileExtension: "pdf" });
const stored = (id: string, name: string) => ({ uploaded: 100, ...file(id, name), _created_at: "2026-10-20T10:00:00Z", _modified_at: "2026-10-20T10:00:00Z" });
const entry = (n: number, withFile: boolean) => ({ uploadId: `UP-${n}`, attachmentId: `Attach_${n}`, fileName: `doc-${n}.pdf`, docKind: "SDS", sectionKey: "K1", uploadedByEmail: "elena.marquez@solvaro.example", uploadedAt: `2026-10-2${n}T10:00:00Z`, ...(withFile ? { file: file(`Attach_${n}`, `doc-${n}.pdf`) } : {}) });
const caseItem = (entries: unknown[], requestId: string | null = "PkReqX"): RawItem => ({ _id: "AppZZT-0009", Case_Code: "ZZT-0009", Documents_JSON: JSON.stringify(entries), ...(requestId ? { Portal_Request_Item_Id: requestId } : {}) });
const docsOf = (it: RawItem): CaseDocs => ({ caseId: String(it.Case_Code), caseItemId: it._id, ...(it.Portal_Request_Item_Id ? { requestItemId: String(it.Portal_Request_Item_Id) } : {}), entries: docEntriesOf(it) });
const request = (files: unknown[], over: Record<string, unknown> = {}): RawItem => ({ _id: "PkReqX", App_Case_Item_Id: "AppZZT-0009", Supplier_Files: files, ...over });

/** The opener over one case, with the fake client; what it told and how often it asked for a re-render. */
function setup(it: RawItem, portal: RawItem[] = [], opts: FakeOptions = { portalRead: true }) {
  const client = createFakeClient({ items: {}, portal: { request: portal }, me: { _id: "UsRmm", Name: "Ruth Brandt" } }, opts);
  const docs = docsOf(it);
  const index = new Map(docs.entries.map((e) => [e.uploadId, docs]));
  const told: { why: string; docId: string; opening: boolean }[] = [];
  let changed = 0;
  const deps: DocOpenerDeps = { client, docs: () => index, changed: () => void changed++, problem: (why, d) => void told.push({ why, docId: d.docId, opening: d.opening }) };
  return { client, opener: createDocOpener(deps), told, changed: () => changed, portalReads: () => client.calls.filter((c) => c.m === "portalGet") };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("Documents_JSON entries", () => {
  it("reads the entries in stored order, skips ones without an uploadId and repeats, keeps `file` as stored", () => {
    const it = caseItem([entry(1, true), { fileName: "x.pdf" }, entry(2, false), entry(1, false)]);
    expect(docEntriesOf(it)).toEqual([
      { uploadId: "UP-1", attachmentId: "Attach_1", fileName: "doc-1.pdf", file: file("Attach_1", "doc-1.pdf") },
      { uploadId: "UP-2", attachmentId: "Attach_2", fileName: "doc-2.pdf" },
    ]);
    expect(docEntriesOf({ _id: "x", Documents_JSON: "not json" })).toEqual([]);
  });

  it("a previewable file has an id and a key", () => {
    expect(previewable(file("A", "a.pdf"))).toBe(true);
    expect(previewable({ id: "A" })).toBe(false);
    expect(previewable({ key: "k" })).toBe(false);
    expect(previewable(null)).toBe(false);
  });

  it("indexes the mapped cases' files by upload id, from the case items this load read (the fixtures carry `file`)", () => {
    const input = fixtureInput("rmm");
    const { index, state } = toAppState(input);
    const docs = docIndexOf(fixtureSnapshot("rmm").items.case, index);
    const c3 = state.cases.find((c) => c.id === "ZZT-0003")!;
    expect(c3.documents.length).toBeGreaterThan(0);
    for (const d of c3.documents) {
      const hit = docs.get(d.id)!;
      expect(hit).toMatchObject({ caseId: "ZZT-0003", caseItemId: "AppZZT-0003", requestItemId: "PkReq3" });
      expect(previewable(hit.entries.find((e) => e.uploadId === d.id)!.file)).toBe(true);
    }
  });
});

describe("the plan", () => {
  it("entry with `file`: every openable file of the list, on the clicked one (older entries are left out until read)", () => {
    const docs = docsOf(caseItem([entry(1, true), entry(2, false), entry(3, true)]));
    expect(previewPlan(docs, "UP-3")).toEqual({ files: [file("Attach_1", "doc-1.pdf"), file("Attach_3", "doc-3.pdf")], index: 1 });
    expect(requestKeyOf(docs)).toBe("PkReqX|Attach_2");
  });

  it("older entry: the request first; then its Supplier_Files value by attachmentId, with the others in list order", () => {
    const docs = docsOf(caseItem([entry(1, true), entry(2, false), entry(3, false)]));
    expect(previewPlan(docs, "UP-2")).toEqual({ need: "request" });
    expect(previewPlan(docs, "UP-2", { state: "pending" })).toEqual({ need: "request" });
    const read = { state: "ok" as const, files: [stored("Attach_3", "doc-3.pdf"), stored("Attach_2", "doc-2.pdf")] };
    expect(previewPlan(docs, "UP-2", read)).toEqual({ files: [file("Attach_1", "doc-1.pdf"), stored("Attach_2", "doc-2.pdf"), stored("Attach_3", "doc-3.pdf")], index: 1 });
  });

  it("why it can't: no request id, no attachment id, a failed read, not among the stored files, not listed", () => {
    expect(previewPlan(docsOf(caseItem([entry(1, false)], null)), "UP-1")).toEqual({ none: expect.stringMatching(/Portal_Request_Item_Id/) });
    expect(previewPlan(docsOf(caseItem([{ ...entry(1, false), attachmentId: "" }])), "UP-1")).toEqual({ none: expect.stringMatching(/attachmentId/) });
    const docs = docsOf(caseItem([entry(1, false)]));
    expect(previewPlan(docs, "UP-1", { state: "failed", why: "050302 No permission" })).toEqual({ none: "the portal request could not be read (050302 No permission)" });
    expect(previewPlan(docs, "UP-1", { state: "ok", files: [stored("Attach_9", "x.pdf"), { id: "Attach_1" }] })).toEqual({ none: expect.stringMatching(/not among .*Supplier_Files/) });
    expect(previewPlan(docs, "UP-7")).toEqual({ none: expect.stringMatching(/not in the case's file list/) });
  });
});

describe("the opener", () => {
  it("an entry with `file` is ready and opens Kissflow's preview with the list's files on it; no portal read", async () => {
    const s = setup(caseItem([entry(1, true), entry(2, true)]));
    expect(s.opener.status("UP-2")).toBe("ready");
    s.opener.prepare("UP-2");
    await s.opener.open("UP-2");
    expect(s.client.previews).toEqual([{ files: [file("Attach_1", "doc-1.pdf"), file("Attach_2", "doc-2.pdf")], index: 1 }]);
    expect(s.portalReads()).toEqual([]);
    expect(s.told).toEqual([]);
    expect(s.opener.status("UP-9")).toBeUndefined(); // not a file it knows: DocName's own behaviour
  });

  it("an older entry: checking, the portal request read ONCE (prepare from every name, then clicks), then ready", async () => {
    const it = caseItem([entry(1, true), entry(2, false)]);
    const s = setup(it, [request([stored("Attach_1", "doc-1.pdf"), stored("Attach_2", "doc-2.pdf")])]);
    expect(s.opener.status("UP-2")).toBe("checking");
    s.opener.prepare("UP-2");
    s.opener.prepare("UP-2");
    await settle();
    expect(s.opener.status("UP-2")).toBe("ready");
    expect(s.changed()).toBe(1);
    await s.opener.open("UP-2");
    await s.opener.open("UP-1");
    expect(s.portalReads().map((c) => [c.id, (c.data as { flow: string }).flow])).toEqual([["PkReqX", "request"]]);
    expect(s.client.previews).toEqual([
      { files: [file("Attach_1", "doc-1.pdf"), stored("Attach_2", "doc-2.pdf")], index: 1 },
      { files: [file("Attach_1", "doc-1.pdf"), stored("Attach_2", "doc-2.pdf")], index: 0 },
    ]);
  });

  it("a click on an older entry before any prepare waits for the read, then opens", async () => {
    const s = setup(caseItem([entry(2, false)]), [request([stored("Attach_2", "doc-2.pdf")])]);
    await s.opener.open("UP-2");
    expect(s.client.previews).toEqual([{ files: [stored("Attach_2", "doc-2.pdf")], index: 0 }]);
    expect(s.portalReads()).toHaveLength(1);
  });

  it("the read refused (no grant on the portal's container): the quiet note, the reason told once, no preview", async () => {
    const s = setup(caseItem([entry(1, false)]), [request([stored("Attach_1", "doc-1.pdf")])], {});
    s.opener.prepare("UP-1");
    await settle();
    await settle();
    expect(s.opener.status("UP-1")).toBe("portal");
    s.opener.prepare("UP-1");
    await s.opener.open("UP-1");
    expect(s.portalReads()).toHaveLength(1);
    expect(s.client.previews).toEqual([]);
    expect(s.told.map((t) => [t.opening, t.why])).toEqual([
      [false, expect.stringMatching(/^the portal request could not be read \(.+\)$/)],
      [true, expect.stringMatching(/^the portal request could not be read/)],
    ]);
  });

  it("the file is not among the request's stored files, or the request is another case's: the note", async () => {
    const a = setup(caseItem([entry(1, false)]), [request([stored("Attach_8", "x.pdf")])]);
    await a.opener.open("UP-1");
    expect(a.opener.status("UP-1")).toBe("portal");
    expect(a.told.at(-1)).toMatchObject({ opening: true, why: expect.stringMatching(/not among the portal request's stored files/) });
    const b = setup(caseItem([entry(1, false)]), [request([stored("Attach_1", "doc-1.pdf")], { App_Case_Item_Id: "AppZZT-0001" })]);
    await b.opener.open("UP-1");
    expect(b.client.previews).toEqual([]);
    expect(b.told.at(-1)?.why).toMatch(/belongs to another case/);
  });

  it("a new older-format upload reads the request again (the cache key names the files it is read for)", async () => {
    const s = setup(caseItem([entry(1, false)]), [request([stored("Attach_1", "doc-1.pdf"), stored("Attach_2", "doc-2.pdf")])]);
    await s.opener.open("UP-1");
    const docs = docsOf(caseItem([entry(1, false), entry(2, false)]));
    const index = new Map(docs.entries.map((e) => [e.uploadId, docs]));
    const again = createDocOpener({ client: s.client, docs: () => index, changed: () => {}, problem: () => {} });
    for (const [k, v] of s.opener.reads) again.reads.set(k, v);
    expect(again.status("UP-2")).toBe("checking");
    await again.open("UP-2");
    expect(s.portalReads()).toHaveLength(2);
    expect(s.client.previews.at(-1)).toEqual({ files: [stored("Attach_1", "doc-1.pdf"), stored("Attach_2", "doc-2.pdf")], index: 1 });
  });

  it("Kissflow refuses the preview: told on the click; without the routes nothing is offered", async () => {
    const s = setup(caseItem([entry(1, true)]), [], { refuse: { previewFiles: "KISSFLOW_ERROR_050302 No permission" } });
    await s.opener.open("UP-1");
    expect(s.told).toEqual([{ docId: "UP-1", opening: true, why: "Kissflow's file preview did not open (KISSFLOW_ERROR_050302 No permission)" }]);
    const docs = docsOf(caseItem([entry(1, true), entry(2, false)]));
    const index = new Map(docs.entries.map((e) => [e.uploadId, docs]));
    const bare = createDocOpener({ client: {}, docs: () => index, changed: () => {}, problem: () => {} });
    expect([bare.status("UP-1"), bare.status("UP-2")]).toEqual(["portal", "portal"]);
  });
});
