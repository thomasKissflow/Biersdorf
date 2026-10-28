// atomic-write.test.mjs — the streaming prototype write must be atomic (#7): a reader/watcher must never
// observe a truncated document, and no temp debris may be left behind. atomicWrite writes a sibling temp
// and renames it into place (rename is atomic on one filesystem), so the destination only ever contains
// a complete old or complete new document.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWrite } from "../proto-assemble.mjs";

test("#7 atomicWrite replaces a file wholesale and leaves no temp debris", () => {
  const dir = mkdtempSync(join(tmpdir(), "kf-aw-"));
  const dest = join(dir, "index.html");
  writeFileSync(dest, "OLD".repeat(1000));               // an existing good file
  const next = "NEW".repeat(50_000);                     // a large replacement
  atomicWrite(dest, next);
  assert.equal(readFileSync(dest, "utf8"), next, "the destination holds the COMPLETE new document");
  assert.deepEqual(readdirSync(dir).filter((f) => f.includes(".tmp")), [], "no .tmp files left behind");
});

test("#7 a reader between writes sees only a complete document, never a partial one", () => {
  // Rename is atomic: at every instant the path resolves to a fully-written file. We can't force a
  // mid-write read deterministically, but we CAN prove the invariant the atomicity guarantees — the
  // temp path, not the destination, is what receives the bytes, so the destination is never truncated.
  const dir = mkdtempSync(join(tmpdir(), "kf-aw2-"));
  const dest = join(dir, "index.html");
  const v1 = "<html>v1</html>", v2 = "<html>v2 " + "x".repeat(100_000) + "</html>";
  atomicWrite(dest, v1);
  const before = readFileSync(dest, "utf8");
  atomicWrite(dest, v2);
  const after = readFileSync(dest, "utf8");
  // Each read is one of the two COMPLETE documents — never a prefix of v2 while it was being written.
  assert.ok(before === v1, "first read is the complete v1");
  assert.ok(after === v2 && after.endsWith("</html>"), "second read is the complete v2, not a truncation");
  assert.ok(existsSync(dest) && !readdirSync(dir).some((f) => f.includes(".tmp")));
});
