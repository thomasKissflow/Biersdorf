// Static source guards (WORKBENCH-DESIGN.md §10.2). Scans src/workbench/** (harness/ excluded unless stated) and
// fails on: imports from the prototype store/domain/features/layout/portal/status or the ui index/overlay; any
// switchRole(; any deleteItem(; DELETE as an HTTP method; updateAdminItem outside kf/sdk.ts and data/adminRepair.ts;
// updateFormRow / updateItem / writeVerified in data/audit.ts; toISOString( outside data/normalize.ts.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DENY_CONTENT, DENY_HOSTS, denyHits } from "../../scripts/workbench-deny.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const SELF = "guards.spec.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}
const rel = (p: string) => path.relative(root, p).split(path.sep).join("/");
const all = walk(root).filter((p) => rel(p) !== SELF);
const isHarness = (p: string) => rel(p).startsWith("harness/");
/** Test-only code (specs and the test kit): never imported by the app, never bundled. */
const isSpec = (p: string) => /\.spec\.(ts|tsx)$/.test(p) || rel(p).startsWith("testkit/");
const src = (p: string) => readFileSync(p, "utf8");
/** Source without line and block comments (so a comment explaining a ban does not trip it). */
const code = (p: string) =>
  src(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

function offenders(files: string[], re: RegExp, strip = true): string[] {
  return files.filter((p) => re.test(strip ? code(p) : src(p))).map(rel);
}

describe("static guards (§10.2)", () => {
  it("no imports from @/store, @/domain, @/features, @/layout, @/portal, @/components/status, the ui index or ui/overlay (harness included)", () => {
    const re = /from\s+["'](@\/(store|domain|features|layout|portal)(\/[^"']*)?|@\/components\/status|@\/components\/ui|@\/components\/ui\/overlay)["']/;
    const relPortal = /from\s+["'](\.\.\/)+portal\//;
    expect(offenders(all, re)).toEqual([]);
    expect(offenders(all, relPortal)).toEqual([]);
  });

  it("no switchRole( anywhere (harness included, except the SWITCH_ROLE refusal handler)", () => {
    const hits = all.filter((p) => /switchRole\s*\(/.test(code(p))).filter((p) => !(isHarness(p) && /SWITCH_ROLE/.test(src(p))));
    expect(hits.map(rel)).toEqual([]);
  });

  it("nothing in the app imports the test kit", () => {
    expect(offenders(all.filter((p) => !isSpec(p)), /from\s+["'][./]*testkit\//)).toEqual([]);
  });

  it("no deleteItem( anywhere", () => {
    expect(offenders(all, /deleteItem\s*\(/)).toEqual([]);
  });

  it("no DELETE used as an HTTP method anywhere", () => {
    expect(offenders(all, /method\s*:\s*["'`]delete/i)).toEqual([]);
  });

  it("updateAdminItem only in kf/sdk.ts and data/adminRepair.ts (specs and the test kit's fake host excluded)", () => {
    const hits = offenders(
      all.filter((p) => !isHarness(p) && !isSpec(p)),
      /updateAdminItem/,
    ).filter((p) => p !== "kf/sdk.ts" && p !== "data/adminRepair.ts");
    expect(hits).toEqual([]);
  });

  it("data/audit.ts neither imports nor calls updateFormRow, updateItem or writeVerified", () => {
    expect(/updateFormRow|updateItem|writeVerified/.test(src(path.join(root, "data/audit.ts")))).toBe(false);
  });

  it("toISOString( only in data/normalize.ts (kfDateTime lives there)", () => {
    const hits = offenders(
      all.filter((p) => !isSpec(p)),
      /toISOString\s*\(/,
    ).filter((p) => p !== "data/normalize.ts");
    expect(hits).toEqual([]);
  });

  it("the facade declares no delete method and no switchRole", () => {
    const sdk = code(path.join(root, "kf/sdk.ts"));
    expect(/deleteItem|switchRole/.test(sdk)).toBe(false);
  });

  it("no credentials or env reads in src/workbench", () => {
    expect(offenders(all.filter((p) => !isSpec(p)), /X-Access-Key|process\.env|\.kf-env|import\.meta\.env\.(?!DEV|PROD|MODE)/i, false)).toEqual([]);
  });

  // ---- review fixes (night): user-visible text (WL-01, F2, F-01..F-09, UX-01..UX-03, UX-13)
  const app = all.filter((p) => !isSpec(p) && !isHarness(p));
  const lines = (p: string, re: RegExp) =>
    code(p)
      .split("\n")
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => re.test(l))
      .map(([n, l]) => `${rel(p)}:${n}: ${l.trim().slice(0, 140)}`);

  it("no Kissflow-internal name, test id or doc reference in app code: the zip deny-list, Diagnostics included", () => {
    expect(app.flatMap((p) => lines(p, DENY_CONTENT))).toEqual([]);
    expect(app.flatMap((p) => lines(p, DENY_HOSTS))).toEqual([]);
  });

  it("outside Diagnostics: no K-<n> ids, no 'manual-wb' (except the stored marker in domain/keys.ts), no 'X1 format', no [unverified]", () => {
    const shown = app.filter((p) => rel(p) !== "pages/Diagnostics.tsx");
    expect(shown.flatMap((p) => lines(p, /\bK-\d|X1 format|\[unverified|\bstub, T\d/))).toEqual([]);
    expect(shown.filter((p) => rel(p) !== "domain/keys.ts").flatMap((p) => lines(p, /manual-wb/))).toEqual([]);
  });

  it("the review's exact strings are gone (Thomas, SEC-HR2, stub owner, provisional Q9, Diagnostics pointers)", () => {
    const re = /ask Thomas|\(Thomas\)|\(SEC-HR2\)|\(stub, |provisional, Q9|Open Diagnostics|check Diagnostics|switch the counts policy|evaluator manual-wb/;
    expect(app.flatMap((p) => lines(p, re))).toEqual([]);
  });

  it("the deny-lists catch planted offenders (and the zip guard shares them)", () => {
    for (const bad of ['"ask Thomas to switch"', '"disabled (K-14)"', '"Counts policy (WB-D1)"', '"(SEC-HR2)"', '"see SPIKES L147"', '"UI-LOG L113"', '"never written (D23)"', '"provisional (Q9)"', '"(stub, T1)"', '"brd: L903"']) expect(DENY_CONTENT.test(bad)).toBe(true);
    // minified library code calls short-named functions: not a reference
    for (const ok of ["Bw.resolve(null).then(e).catch(Q4)", "f(D23)"]) expect(DENY_CONTENT.test(ok)).toBe(false);
    for (const bad of ["https://dev-beiersdorf.kissflow.eu", "Authorization: x", "Bearer abc"]) expect(DENY_HOSTS.test(bad)).toBe(true);
    for (const ok of ['"Ask a CIQ Case Admin"', '"Safety open items"', '"K2.1 Composition"', '"Q&A"']) expect(DENY_CONTENT.test(ok)).toBe(false);
    expect(denyHits('x="ask Thomas" y').map((h) => h.match)).toEqual(["Thomas"]);
  });

  it("the guard itself works: a planted offender is found", () => {
    expect(/switchRole\s*\(/.test("kf.app.switchRole({ roleId })")).toBe(true);
    expect(/method\s*:\s*["'`]delete/i.test('kf.api(url, { method: "DELETE" })')).toBe(true);
  });
});
