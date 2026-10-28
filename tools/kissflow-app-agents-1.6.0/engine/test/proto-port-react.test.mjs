// proto-port-react.test.mjs — #3: one canonical React source for preview AND deploy.
// A React prototype page is already real React on `@/components/kit` (the SAME components the deploy
// build compiles), reading data through `useFlow(TYPE, FLOW_ID)`. So the deploy source IS the prototype
// source; the only thing that differs live is the flow id, which carries the deterministic gen id
// (`idify(name)_A00`) — exactly the key `id-map.json`'s `genToServer` is indexed by. These tests pin the
// deterministic remap and the React-vs-HTML dispatch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync as mkdtemp, readdirSync, readFileSync as rf } from "node:fs";
import { reactPrototype, portReactSource, portReactRun, buildReactBrief, deployReactPages } from "../proto-port.mjs";

const PAGE = `import { useFlow } from "@/components/kit/useFlow.js";
const FLOW_TYPE = "Process";
const FLOW_ID = "Expense_Claim_A00";
export default function MyClaims() {
  const { rows } = useFlow(FLOW_TYPE, FLOW_ID);
  return rows.map((r) => r.Category);
}`;

function mkReactRun({ withPages = true, idMap = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "kf-port-"));
  mkdirSync(join(dir, "prototype", "pages"), { recursive: true });
  writeFileSync(join(dir, "prototype", "proto.json"), JSON.stringify({
    nav: [{ name: "Workspace", items: [{ page: "my-claims", label: "My Claims", roles: ["Employee"] }] }],
    seed: { "Expense Claim": [{ Category: "Travel", Amount: 100 }] },
  }));
  writeFileSync(join(dir, "app-spec.json"), JSON.stringify({
    forms: [{ name: "Expense Claim", flowType: "Process", fields: [{ name: "Category" }, { name: "Amount" }] }],
  }));
  if (withPages) writeFileSync(join(dir, "prototype", "pages", "my-claims.jsx"), PAGE);
  if (idMap) writeFileSync(join(dir, "id-map.json"), JSON.stringify(idMap));
  return dir;
}

test("portReactSource rewrites the gen flow id to the live id, and reports unresolved", () => {
  const idMap = { app: "A", genToServer: { "Expense_Claim_A00": "Expense_Claim_A07", "Other_A00": "Other_A02" } };
  const r = portReactSource(PAGE, idMap);
  assert.ok(!r.source.includes('"Expense_Claim_A00"'), "the old gen id is gone");
  assert.ok(r.source.includes('"Expense_Claim_A07"'), "the live id is written in");
  assert.deepEqual(r.remaps, [{ from: "Expense_Claim_A00", to: "Expense_Claim_A07" }], "only the id the page used is reported remapped");
  assert.deepEqual(r.unresolved, [], "every referenced gen id resolved");

  // no id-map → gen id stays (it already equals the live id); it is listed as unresolved, not an error
  const bare = portReactSource(PAGE, {});
  assert.equal(bare.source, PAGE, "with no map the source is byte-for-byte unchanged");
  assert.deepEqual(bare.unresolved, ["Expense_Claim_A00"]);
});

test("longest-key-first: a gen id that is a prefix of another is not partially rewritten", () => {
  const src = 'const A = "Claim_A00"; const B = "Claim_A00_Extra_A01";';
  const r = portReactSource(src, { genToServer: { "Claim_A00": "Srv_A05", "Claim_A00_Extra_A01": "Srv_A09" } });
  assert.ok(r.source.includes('"Srv_A05"') && r.source.includes('"Srv_A09"'));
  assert.ok(!r.source.includes("Claim_A00_Extra"), "the longer id was replaced whole, not left as a Srv_A05 fragment");
});

test("portReactRun ports every page and carries the nav; reads id-map.json off disk", () => {
  const dir = mkReactRun({ idMap: { app: "Exp_A03", genToServer: { "Expense_Claim_A00": "Expense_Claim_A07" } } });
  const run = portReactRun(dir);
  assert.equal(run.app, "Exp_A03");
  assert.equal(run.nav[0].name, "Workspace");
  assert.equal(run.pages.length, 1);
  assert.ok(run.pages[0].source.includes('"Expense_Claim_A07"'));
});

test("reactPrototype detects a React run and declines an HTML-only run (dispatch)", () => {
  assert.ok(reactPrototype(mkReactRun()) != null, "a run with proto.json + pages/*.jsx is React");
  const html = mkdtempSync(join(tmpdir(), "kf-html-"));
  mkdirSync(join(html, "prototype"), { recursive: true });
  writeFileSync(join(html, "prototype", "index.html"), "<html>old</html>");
  assert.equal(reactPrototype(html), null, "an HTML-only run is NOT taken over by the React path");
  assert.equal(reactPrototype(mkReactRun({ withPages: false })), null, "proto.json without any page is not portable");
});

test("buildReactBrief names the page source + nav owner + field bindings", () => {
  const dir = mkReactRun();
  const b = buildReactBrief(dir, "my-claims");
  assert.equal(b.pageId, "my-claims");
  assert.equal(b.owner.label, "My Claims");
  assert.deepEqual(b.owner.roles, ["Employee"]);
  assert.ok(b.ported.source.includes("useFlow"), "the brief carries the real page source (the deploy source)");
  const claim = b.bindings.find((x) => x.collection === "Expense Claim");
  assert.ok(claim && claim.flow, "the seed collection matched a spec flow");
  assert.ok(claim.keys.every((k) => k.field), "Category/Amount resolved to real fields (exact name match)");
});

test("#6 deployReactPages is fail-closed: requires an id-map and refuses any unresolved flow id", () => {
  const dir = mkReactRun();                       // no id-map.json on disk
  const dest = mkdtemp(join(tmpdir(), "kf-dep-"));
  // no map → cannot prove live ids → refuse
  assert.throws(() => deployReactPages(dir, dest, {}), /no id-map/i, "without a map, deploy is refused (no guessing)");
  // a map that does not cover the page's flow → refuse (this is the /add-page-fallback drift Codex flagged)
  assert.throws(() => deployReactPages(dir, dest, { idMap: { app: "x", genToServer: { "Nope_A00": "y_A01" } } }),
    /unresolved flow id/i, "an unresolved gen id fails closed, it does not silently fall through");
});

test("#6 deployReactPages writes id-only-remapped pages and hash-guards against any other change", () => {
  const dir = mkReactRun({ idMap: { app: "Exp_A03", genToServer: { "Expense_Claim_A00": "Expense_Claim_A07" } } });
  const dest = mkdtemp(join(tmpdir(), "kf-dep-"));
  const out = deployReactPages(dir, dest);        // reads id-map.json off disk
  assert.equal(out.app, "Exp_A03");
  assert.deepEqual(out.written, readdirSync(dest), "every ported page was written to the deploy dir");
  const src = rf(join(dest, out.written[0]), "utf8");
  assert.ok(src.includes('"Expense_Claim_A07"') && !src.includes('"Expense_Claim_A00"'), "the deploy page carries the live id, not the gen id");
  // the ONLY change vs the prototype page is the id — neutralizing ids makes them identical
  const orig = rf(join(dir, "prototype", "pages", out.written[0]), "utf8");
  const neutralize = (s) => s.replace(/["']([A-Za-z0-9_]+_A\d{2})["']/g, '"__ID__"');
  assert.equal(neutralize(src), neutralize(orig), "the port changed id constants and nothing else");
});

test("#6 template-literal flow ids are remapped and fail closed when unmapped", async () => {
  const { portReactSource } = await import("../proto-port.mjs");
  const src = "const F = `Flow_A00`; useFlow(`Flow_A00`);";
  const r = portReactSource(src, { genToServer: { "Flow_A00": "Flow_A05" } });
  assert.ok(r.source.includes("`Flow_A05`") && !r.source.includes("`Flow_A00`"), "backtick flow id is remapped");
  assert.deepEqual(r.unresolved, [], "resolved");
  // an unmapped template-literal id is caught (fail-closed), not silently shipped
  const u = portReactSource("useFlow(`Nope_A00`)", { genToServer: { "Other_A00": "Other_A02" } });
  assert.ok(u.unresolved.includes("Nope_A00"), "unmapped backtick id is flagged unresolved");
});

test("#7 deployReactPages is transactional — removed pages don't survive a redeploy", async () => {
  const { deployReactPages } = await import("../proto-port.mjs");
  const { readdirSync, rmSync: rm } = await import("node:fs");
  const dir = mkReactRun({ idMap: { app: "A", genToServer: { "Expense_Claim_A00": "Expense_Claim_A07" } } });
  // add a second page
  writeFileSync(join(dir, "prototype", "pages", "second.jsx"), PAGE.replace("MyClaims", "Second"));
  const dest = mkdtemp(join(tmpdir(), "kf-dep-"));
  deployReactPages(dir, dest);
  assert.equal(readdirSync(dest).length, 2, "two pages deployed");
  // remove one prototype page and redeploy — the stale one must NOT survive
  rm(join(dir, "prototype", "pages", "second.jsx"));
  const out = deployReactPages(dir, dest);
  assert.deepEqual(readdirSync(dest).sort(), ["my-claims.jsx"], "the removed page is gone from the destination");
  assert.equal(out.written.length, 1);
});

test("custom UI is persisted per-project — deployReactPages writes runs/<slug>/ui/, persistUiSource snapshots a tree", async () => {
  const { deployReactPages, persistUiSource } = await import("../proto-port.mjs");
  const { existsSync: ex, readdirSync, mkdirSync: mk } = await import("node:fs");
  const dir = mkReactRun({ idMap: { app: "A", genToServer: { "Expense_Claim_A00": "Expense_Claim_A07" } } });
  const out = deployReactPages(dir, mkdtemp(join(tmpdir(), "kf-dep-")));
  assert.ok(out.durable && ex(join(dir, "ui", "pages", "my-claims.jsx")), "deploy persisted the ported source under runs/<slug>/ui/");
  assert.ok(ex(join(dir, "ui", "manifest.json")), "a manifest rides along for regeneration");
  // persistUiSource snapshots an arbitrary generated source dir (the legacy kf-ui-builder path)
  const src = mkdtemp(join(tmpdir(), "kf-src-"));
  mk(join(src, "pages"), { recursive: true });
  writeFileSync(join(src, "pages", "Home.jsx"), "export default function Home(){return null}");
  const p = persistUiSource(dir, src);
  assert.ok(ex(join(dir, "ui", "pages", "pages", "Home.jsx")), "persistUiSource copied the tree into runs/<slug>/ui/");
  assert.ok(p.written.length >= 1);
});
