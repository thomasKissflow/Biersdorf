// proto-precompile-cache.test.mjs — the Express-fast compiler cache must be an OPTIMIZATION ONLY: it
// may not change what a page ends up with. The v4 compiler is incremental (build() accumulates), so the
// cache is keyed by (label, source): reused across a run's part arrivals (where candidates only grow —
// accumulation is correct) and fresh per run/app (so one app's utilities never leak into another's).
import { test } from "node:test";
import assert from "node:assert/strict";
import { precompile, disposePrecompileCache } from "../proto-precompile.mjs";

const BASE = "p-4 px-6 flex grid gap-4 items-center justify-between rounded-lg shadow-sm border font-semibold text-lg w-full h-10 max-w-md grid-cols-3 hover:opacity-80 md:flex lg:grid col-span-2 space-y-4 overflow-hidden relative z-10 transition";
const doc = (classes) => `<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script><style type="text/tailwindcss">@import "tailwindcss/theme.css";@import "tailwindcss/utilities.css";@theme{--color-x:#0af}</style><div class="${BASE} ${classes}"></div>`;
const cssOf = (html) => (html.match(/<style>[\s\S]*?<\/style>/) || [""])[0];

test("within a run, a later splice keeps every earlier class (streaming accumulation is correct)", async () => {
  const a = await precompile(doc("mt-4"), { label: "/runs/appA" });
  assert.equal(a.changed, true, a.reason);
  const b = await precompile(doc("mt-4 mb-8"), { label: "/runs/appA" });   // a part landed, adding mb-8
  assert.equal(b.changed, true, b.reason);
  assert.match(cssOf(b.html), /\.mb-8\b/, "the newly-arrived class is present");
  assert.match(cssOf(b.html), /\.mt-4\b/, "and the earlier class did not disappear");
});

test("a DIFFERENT run does not inherit another run's classes (no cross-app leak)", async () => {
  await precompile(doc("bg-red-500"), { label: "/runs/leakSrc" });          // appA uses bg-red-500
  const other = await precompile(doc("bg-green-500"), { label: "/runs/leakDst" });  // appB does not
  assert.match(cssOf(other.html), /\.bg-green-500\b/, "appB has its own class");
  assert.doesNotMatch(cssOf(other.html), /\.bg-red-500\b/, "appB did NOT inherit appA's class");
});

test("#6 a class removed on a LATER turn does not linger — the compiler is disposed at turn end", async () => {
  const L = "/runs/turns";
  const t1 = await precompile(doc("bg-red-500"), { label: L });        // turn 1 uses bg-red-500
  assert.match(cssOf(t1.html), /\.bg-red-500\b/);
  disposePrecompileCache(L);                                            // turn ends → drop the compiler
  const t2 = await precompile(doc("bg-green-500"), { label: L });      // turn 2 no longer uses red
  assert.match(cssOf(t2.html), /\.bg-green-500\b/, "turn 2's class is present");
  assert.doesNotMatch(cssOf(t2.html), /\.bg-red-500\b/, "turn 1's removed class did NOT carry over");
});

test("recompiling the SAME document is idempotent — same bytes out", async () => {
  const one = await precompile(doc("underline"), { label: "/runs/idem" });
  const two = await precompile(doc("underline"), { label: "/runs/idem" });
  assert.equal(one.html, two.html, "identical input → identical output, cache or not");
});

test("the cached path still removes the CDN and yields real compiled CSS", async () => {
  const r = await precompile(doc("italic"), { label: "/runs/clean" });
  assert.equal(r.stats.cdnRemoved, true);
  assert.ok(!/tailwindcss\/browser@|type=["']text\/tailwindcss["']/.test(r.html), "no raw runtime survives");
  assert.ok(r.stats.cssBytes > 500);
});
