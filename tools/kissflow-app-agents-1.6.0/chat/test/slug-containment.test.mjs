// slug-containment.test.mjs — a client-supplied chatSlug becomes rmSync(join(RUNS, slug)) on delete.
// isContainedRunDir is the last line before the filesystem: it must return null for anything that is
// not a STRICT single-segment child of RUNS, so a traversal payload can never widen the delete.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isContainedRunDir } from "../app.mjs";

test("traversal / absolute / multi-segment / injection slugs are refused", () => {
  for (const bad of ["../etc", "../../x", "..", ".", "/abs", "a/b", "a\\b", "foo$(x)", "", "a b", "a/../b", "sub/child"])
    assert.equal(isContainedRunDir(bad), null, `must refuse ${JSON.stringify(bad)}`);
});

test("a plain single-segment slug resolves to a strict child of RUNS", () => {
  for (const ok of ["clinic-ops", "express-bench", "a_b.c-1", "App123"]) {
    const dir = isContainedRunDir(ok);
    assert.ok(dir && dir.endsWith(`${"/"}${ok}`), `must allow ${ok}, got ${dir}`);
  }
});
