// proto-react.test.mjs — behavioral tests for the React-prototype migration (see v1feedback.md).
// Covers the per-run medium decision (the four cases) and the safety property that a FAILED react build
// keeps the last good prototype visible — never a blank/partial page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { resolvePrototypeMedium, beginReactMigration, readMigration, assembleReactRun, decideTurnMedium, revertUnfinishedMigration, smokeStagedReact } from "../proto-react.mjs";

// #5 runtime smoke needs a headless Chrome; skip the assertions (not fail) where there is none, exactly as
// the primitive itself does — so a Chrome-less CI stays green while a dev box with Chrome gets the coverage.
const CHROME = (() => {
  const cands = [process.env.CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean);
  for (const c of cands) { if (c.includes("/")) { if (existsSync(c)) return c; continue; } try { const w = spawnSync("which", [c], { encoding: "utf8" }); if (w.status === 0 && w.stdout.trim()) return true; } catch {} }
  return null;
})();

function mkRun() {
  const dir = mkdtempSync(join(tmpdir(), "kf-proto-"));
  mkdirSync(join(dir, "prototype", "pages"), { recursive: true });
  writeFileSync(join(dir, "app-spec.json"), JSON.stringify({
    app: { name: "Test App" },
    forms: [{ name: "Thing", fields: [{ name: "Title" }, { name: "Status" }] }],
    roles: [{ name: "User" }],
  }));
  return dir;
}

test("per-run medium — the four cases", () => {
  // 1. NEW (no prototype, no state) → react by default (react IS the prototype medium; html is suspended)
  assert.equal(resolvePrototypeMedium(mkRun()), "react");

  // 2. Existing HTML prototype, no migration state → stays html (no unsolicited migration)
  const b = mkRun(); writeFileSync(join(b, "prototype", "index.html"), "<html>old</html>");
  assert.equal(resolvePrototypeMedium(b), "html");

  // 3. A prototype-editing turn began a migration → react, and it is recorded as building
  const c = mkRun(); writeFileSync(join(c, "prototype", "index.html"), "<html>old</html>");
  beginReactMigration(c, { sourceVersion: 5 });
  assert.equal(readMigration(c).reactMigrationStatus, "building");
  assert.equal(readMigration(c).prototypeSourceVersion, 5);
  assert.equal(resolvePrototypeMedium(c), "react");

  // 4. NEW with the legacy html opt-out → html
  const d = mkRun();
  process.env.KF_PROTOTYPE = "html";
  try { assert.equal(resolvePrototypeMedium(d), "html"); } finally { delete process.env.KF_PROTOTYPE; }
});

test("RR-1 — host-owned migration decision + revert (gated)", () => {
  delete process.env.KF_REACT_MIGRATION; delete process.env.KF_PROTOTYPE;

  // gated OFF → an existing HTML run stays html and no migration is begun
  const a = mkRun(); writeFileSync(join(a, "prototype", "index.html"), "<html>old</html>");
  assert.equal(decideTurnMedium(a), "html");
  assert.equal(readMigration(a), null, "gated off: nothing written");

  // enabled → react, migration begun durably, and resolves react for the rest of the turn
  const b = mkRun(); writeFileSync(join(b, "prototype", "index.html"), "<html>old</html>");
  process.env.KF_REACT_MIGRATION = "1";
  try {
    assert.equal(decideTurnMedium(b, { sourceVersion: 7 }), "react");
    assert.equal(readMigration(b).reactMigrationStatus, "building");
    assert.equal(readMigration(b).prototypeSourceVersion, 7);
    assert.equal(resolvePrototypeMedium(b), "react");

    // Q&A turn: no react prototype was built (still "building") → revert leaves the run as HTML
    revertUnfinishedMigration(b);
    assert.equal(readMigration(b), null, "unfinished migration reverted");
    assert.equal(resolvePrototypeMedium(b), "html");

    // a COMPLETED migration ("done") is NOT reverted
    const c = mkRun();
    writeFileSync(join(c, "prototype", "migration.json"), JSON.stringify({ prototypeMedium: "react", reactMigrationStatus: "done" }));
    revertUnfinishedMigration(c);
    assert.equal(readMigration(c).reactMigrationStatus, "done", "a promoted build is not reverted");
  } finally { delete process.env.KF_REACT_MIGRATION; }
});

test("a FAILED react build keeps the last good prototype and reports failure (never blank/partial)", async () => {
  const dir = mkRun();
  writeFileSync(join(dir, "prototype", "index.html"), "<html>GOOD OLD PROTOTYPE</html>");
  writeFileSync(join(dir, "prototype", "proto.json"), JSON.stringify({
    nav: [{ name: "App", items: [{ page: "broken", label: "Broken", roles: [] }] }], seed: {},
  }));
  // invalid JSX → the vite build throws → assembleReactRun must NOT touch the live index.html
  writeFileSync(join(dir, "prototype", "pages", "broken.jsx"), "export default function Broken() { return <div>{ oops unclosed");

  const ok = await assembleReactRun(dir);
  assert.equal(ok, false, "a failed build returns false, never rejects into the stream loop");
  assert.equal(readFileSync(join(dir, "prototype", "index.html"), "utf8"), "<html>GOOD OLD PROTOTYPE</html>",
    "the last good prototype is byte-for-byte untouched — it stages to react-next and only promotes a verified build");
  const m = readMigration(dir);
  assert.equal(m?.reactMigrationStatus, "failed", "the failed migration is recorded");
  // RR-5: assert the failure is the intended VITE BUILD failure, not a setup/permission error (EPERM
  // opening starter/lib once made this pass for the wrong reason). If the build can't run here, fail loudly.
  assert.match(String(m?.lastError || ""), /build|transform|esbuild|rollup|Expected|Unexpected|parse|jsx|ELIFECYCLE|exit code/i,
    `the failure must be the JSX/Vite build phase, not setup — got: ${m?.lastError}`);
  assert.doesNotMatch(String(m?.lastError || ""), /EPERM|EACCES|ENOENT.*starter\/lib/i,
    `a permission/setup error masqueraded as the build failure — got: ${m?.lastError}`);
});

test("#5 runtime smoke — mounts the staged build and FAILS on a runtime throw or an empty mount", { skip: CHROME ? false : "no headless Chrome" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "kf-smoke-"));
  const nav = [{ name: "W", items: [{ label: "My Claims" }] }];

  // a clean build: #root renders non-empty, no errors, the nav label is present → passes
  const good = join(dir, "good.html");
  writeFileSync(good, `<!doctype html><html><head><title>t</title></head><body><div id="root"></div>
    <script type="module">document.getElementById('root').textContent='My Claims — workspace ready and populated';</script></body></html>`);
  await smokeStagedReact(good, nav);   // must NOT throw

  // valid JS that THROWS while mounting — the exact case the static verify cannot see
  const throws = join(dir, "throws.html");
  writeFileSync(throws, `<!doctype html><html><head><title>t</title></head><body><div id="root"></div>
    <script type="module">document.getElementById('root').textContent='My Claims loading';throw new Error('boom during mount');</script></body></html>`);
  await assert.rejects(() => smokeStagedReact(throws, nav), /runtime smoke: .*error/i, "a mount-time throw must fail the smoke");

  // mounts nothing → empty #root
  const empty = join(dir, "empty.html");
  writeFileSync(empty, `<!doctype html><html><head><title>t</title></head><body><div id="root"></div>
    <script type="module">/* renders nothing */</script></body></html>`);
  await assert.rejects(() => smokeStagedReact(empty, nav), /mounted empty/i, "an empty mount must fail the smoke");
});

test("#4 a terminal cache-hit smoke failure RESTORES the last runtime-verified prototype", { skip: CHROME ? false : "no headless Chrome" }, async () => {
  const dir = mkRun();
  writeFileSync(join(dir, "prototype", "proto.json"), JSON.stringify({ nav: [{ name: "W", items: [{ page: "home", label: "Home", roles: [] }] }], seed: {} }));
  writeFileSync(join(dir, "prototype", "pages", "home.jsx"),
    `import { usePageTitle } from "@kissflow/app-ui";\nexport default function Home(){ usePageTitle("Home"); return <div>Home page content that mounts cleanly</div>; }`);
  // 1. a good terminal build → promotes index.html AND snapshots index.verified.html
  assert.equal(await assembleReactRun(dir, { final: true }), true, "the good build passed the terminal smoke");
  const good = readFileSync(join(dir, "prototype", "index.html"), "utf8");
  assert.ok(existsSync(join(dir, "prototype", "index.verified.html")), "a verified snapshot was taken");
  // 2. simulate a broken streaming promote of the SAME inputs (digest unchanged → the next call is a cache hit)
  writeFileSync(join(dir, "prototype", "index.html"), `<!doctype html><html><body><div id="root"></div><script type="module">throw new Error("boom at mount")</script></body></html>`);
  // 3. terminal assembly → cache hit → smoke fails on the broken file → the last-verified is restored
  assert.equal(await assembleReactRun(dir, { final: true }), false, "the terminal smoke on the broken promoted file fails");
  assert.equal(readFileSync(join(dir, "prototype", "index.html"), "utf8"), good, "the last runtime-verified prototype was restored, not left broken");
  assert.equal(readMigration(dir)?.reactMigrationStatus, "failed", "and the failure is recorded");
});

test("pre-react backup — existing HTML is backed up ONCE, byte-identical, never overwritten (Codex spec 1-3)", () => {
  const dir = mkRun();
  const html = "<!doctype html><html><body>OLD HTML PROTOTYPE — deadbeef</body></html>";
  writeFileSync(join(dir, "prototype", "index.html"), html);
  beginReactMigration(dir, { sourceVersion: 7 });
  const backup = join(dir, "prototype", "index.pre-react.html");
  assert.ok(existsSync(backup), "1. existing HTML is backed up before migration");
  assert.equal(readFileSync(backup, "utf8"), html, "2. the backup is byte-for-byte identical");
  const m = readMigration(dir);
  assert.equal(m.preReactBackup, "prototype/index.pre-react.html", "backup path recorded in migration.json");
  assert.match(m.preReactSha, /^[a-f0-9]{64}$/, "sha256 recorded");
  const sha1 = m.preReactSha;
  // 3. a repeated migration (even after index.html changed to a react build) does NOT overwrite the backup
  writeFileSync(join(dir, "prototype", "index.html"), "<html>a react build now, different bytes</html>");
  beginReactMigration(dir, { sourceVersion: 8 });
  assert.equal(readFileSync(backup, "utf8"), html, "3. the backup is unchanged on a repeated migration");
  assert.equal(readMigration(dir).preReactSha, sha1, "sha unchanged");
  // index.verified.html is a SEPARATE concern — no verified build yet, so it does not exist
  assert.ok(!existsSync(join(dir, "prototype", "index.verified.html")), "the backup is separate from index.verified.html");
});

test("pre-react backup — survives a real React build + promotion, and generation still completes (spec 4-5)", async () => {
  const dir = mkRun();
  const html = "<!doctype html><html><body>ORIGINAL HTML PROTOTYPE</body></html>";
  writeFileSync(join(dir, "prototype", "index.html"), html);
  beginReactMigration(dir, {});
  writeFileSync(join(dir, "prototype", "proto.json"), JSON.stringify({ nav: [{ name: "W", items: [{ page: "home", label: "Home", roles: [] }] }], seed: {} }));
  writeFileSync(join(dir, "prototype", "pages", "home.jsx"),
    `import { usePageTitle } from "@kissflow/app-ui";\nexport default function Home(){ usePageTitle("Home"); return <div>home page</div>; }`);
  assert.equal(await assembleReactRun(dir), true, "4. React generation completed and promoted");
  assert.ok(readFileSync(join(dir, "prototype", "index.html"), "utf8").length > 50000, "index.html is now the React single-file build, not the old HTML");
  assert.equal(readFileSync(join(dir, "prototype", "index.pre-react.html"), "utf8"), html, "5. the backup remains byte-identical after React promotion");
  const m = readMigration(dir);
  assert.equal(m.reactMigrationStatus, "done");
  assert.equal(m.preReactBackup, "prototype/index.pre-react.html", "the backup record survived promotion (done-write preserved it)");
});
