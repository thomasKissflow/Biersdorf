// marker-containment.test.mjs — a preview/blueprint marker path is written by the conductor (a model),
// so it is untrusted (#4). It must resolve, through symlinks, to a real file INSIDE this session's own
// run directory — otherwise `<<KF:preview ../../.kf-env>>` (or an absolute path, or an escaping symlink)
// would expose repository/container files through the authenticated preview route.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionCore } from "../session-core.mjs";

function setup() {
  const repo = mkdtempSync(join(tmpdir(), "kf-marker-"));
  const runs = join(repo, "runs");
  mkdirSync(runs, { recursive: true });
  const core = createSessionCore({ repoRoot: repo, runsDir: runs });
  const s = { id: "s1", slug: "app1", messages: [] };
  mkdirSync(join(runs, "app1", "prototype"), { recursive: true });
  writeFileSync(join(runs, "app1", "prototype", "index.html"), "<html>ok</html>");
  writeFileSync(join(repo, ".kf-env"), "SECRET=1");           // a container secret OUTSIDE the run
  const ctx = { emit() {}, persist() {}, onPreview() {} };
  return { core, s, ctx, repo, runs };
}

test("#4 a legit in-run preview marker is accepted", () => {
  const { core, s, ctx } = setup();
  core.onMarker(s, { kind: "preview", value: "runs/app1/prototype/index.html" }, ctx);
  assert.ok(s.preview && s.preview.includes("app1/prototype/index.html"), "an in-run path is recorded");
});

test("#4 a traversal marker escaping the run dir is REJECTED", () => {
  const { core, s, ctx } = setup();
  core.onMarker(s, { kind: "preview", value: "runs/app1/prototype/../../../.kf-env" }, ctx);
  assert.equal(s.preview, undefined, "a path climbing out to .kf-env is not recorded");
  core.onMarker(s, { kind: "blueprint", value: "../.kf-env" }, ctx);
  assert.equal(s.blueprint, undefined, "same for the blueprint marker");
});

test("#4 a marker naming a DIRECTORY (not a file) is rejected — it would widen the preview root", () => {
  const { core, s, ctx } = setup();
  core.onMarker(s, { kind: "preview", value: "runs/app1/prototype" }, ctx);   // the dir, not index.html
  assert.equal(s.preview, undefined, "a directory marker is not accepted");
});

test("#4 a persisted OUT-OF-RUN marker is re-validated by the resolver, not trusted", () => {
  const { core, s, ctx } = setup();
  core.onMarker(s, { kind: "preview", value: "runs/app1/prototype/index.html" }, ctx);
  assert.ok(s.preview, "legit marker recorded");
  s.preview = "../.kf-env";                       // simulate a poisoned persisted value
  assert.equal(core.resolvePreview(s) && core.resolvePreview(s).includes(".kf-env"), false, "the resolver refuses a persisted escape and falls back to the in-run prototype");
});

test("#4 a SYMLINK inside the run pointing OUT is rejected (realpath containment)", () => {
  const { core, s, ctx, repo, runs } = setup();
  try { symlinkSync(join(repo, ".kf-env"), join(runs, "app1", "prototype", "leak.html")); }
  catch { return; }   // some CI filesystems disallow symlinks — the traversal test above still covers escape
  core.onMarker(s, { kind: "preview", value: "runs/app1/prototype/leak.html" }, ctx);
  assert.equal(s.preview, undefined, "a symlink whose real target is outside the run is rejected");
});
