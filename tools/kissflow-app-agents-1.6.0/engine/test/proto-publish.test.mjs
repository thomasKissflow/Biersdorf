// proto-publish.test.mjs — the ONE publication boundary must FAIL CLOSED on uncompiled Tailwind, and
// the verifier must SEE a raw Tailwind runtime as an error (the review's findings #2 and #6). Before
// this, an uncompiled prototype (browser CDN + <style type=text/tailwindcss> + relative
// @import "tailwindcss/…") sailed through verify() as pass:true and was published as "ready", then
// died unstyled inside the preview host.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { preparePrototypeForPublication } from "../proto-publish.mjs";
import { verify, rawTailwindFindings } from "../proto-verify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const V4 = readFileSync(join(HERE, "fixtures", "v4-prototype.html"), "utf8");

test("#6 the verifier now REJECTS a raw Tailwind runtime (was pass:true)", () => {
  const kinds = verify(V4).findings.filter((f) => f.level === "error").map((f) => f.kind);
  assert.ok(kinds.includes("RAW_TAILWIND_RUNTIME"), "browser CDN is an error");
  assert.ok(kinds.includes("UNCOMPILED_PROTOTYPE_CSS"), "text/tailwindcss block is an error");
  assert.ok(kinds.includes("UNRESOLVED_TAILWIND_IMPORT"), "unresolved tailwindcss import is an error");
});

test("#6 rawTailwindFindings detects each raw marker independently", () => {
  assert.equal(rawTailwindFindings('<div class="p-4">clean compiled page</div>').length, 0);
  assert.equal(rawTailwindFindings('<script src="x/@tailwindcss/browser@4"></script>')[0].kind, "RAW_TAILWIND_RUNTIME");
  assert.equal(rawTailwindFindings('<style type="text/tailwindcss">x</style>')[0].kind, "UNCOMPILED_PROTOTYPE_CSS");
  assert.equal(rawTailwindFindings('@import "tailwindcss/theme.css";')[0].kind, "UNRESOLVED_TAILWIND_IMPORT");
});

test("#2 the boundary COMPILES a real v4 prototype and passes it — raw runtime gone", async () => {
  const r = await preparePrototypeForPublication(V4, { phase: "final", label: "fixture" });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.compiled, true, "the Tailwind head was actually compiled");
  assert.ok(!/tailwindcss\/browser@/.test(r.html), "no browser CDN in the published bytes");
  assert.ok(!/type=["']text\/tailwindcss["']/.test(r.html), "no raw text/tailwindcss block");
  assert.ok(!/@import\s+["']tailwindcss/.test(r.html), "no unresolved tailwindcss import");
  assert.equal(rawTailwindFindings(r.html).length, 0, "and the verifier's raw check now finds nothing");
  // the token-contract prose comments ("Tabular numerals…", "Beacon's own canvas") are IN the source
  // block that compiles away — the regression is that they don't BREAK the compile (a stray */ in prose
  // is the CSS_COMMENT_BREAK failure). This fixture carries them and still compiled, so that holds.
  assert.ok(r.compiled && r.findings.length === 0, "token comments in the contract don't break compilation");
});

test("#2 FAIL CLOSED — an uncompilable raw doc is REJECTED, never returned as ok with the CDN head", async () => {
  // Bare `@import "tailwindcss"` resolves to the JS entry and the compile throws — the exact
  // fail-OPEN case precompile degrades on. The boundary must NOT publish it.
  const uncompilable = `<!doctype html><html><head>
    <script src="https://cdn/@tailwindcss/browser@4"></script>
    <style type="text/tailwindcss">@import "tailwindcss";@theme{--x:1}</style></head>
    <body><div class="p-4"></div></body></html>`;
  const r = await preparePrototypeForPublication(uncompilable, { phase: "final", label: "bad" });
  assert.equal(r.ok, false, "must not publish an uncompiled page");
  assert.match(r.reason, /uncompiled Tailwind runtime/i);
  assert.ok(/tailwindcss\/browser@/.test(r.html), "the rejected candidate still has its raw head — the caller keeps last-good, never publishes this");
});

test("#2 partial phase tolerates in-progress placeholders but NOT raw Tailwind", async () => {
  // a compiled shell with an unspliced role marker: fine for streaming (partial), the raw check still
  // gates it. Use the fixture (compiles) but add a pending placeholder.
  const streaming = V4.replace('<section id="rv-admin">', '<!-- @PART:role-finance --><section id="rv-admin">');
  const partial = await preparePrototypeForPublication(streaming, { phase: "partial", label: "stream" });
  assert.equal(partial.ok, true, "a compiled streaming candidate publishes even with a missing part");
  // but a raw (uncompilable) streaming candidate is still rejected
  const rawStream = `<style type="text/tailwindcss">@import "tailwindcss";</style><!-- @PART:role-x -->`;
  const rej = await preparePrototypeForPublication(rawStream, { phase: "partial", label: "rawstream" });
  assert.equal(rej.ok, false, "raw Tailwind is fatal even for a partial");
});
