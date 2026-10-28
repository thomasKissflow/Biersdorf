// tw-smoke.mjs — a build-time proof that the Tailwind compiler the prototype pipeline depends on is
// actually RESOLVABLE and RUNS in this image. It exercises the exact runtime path (precompile → its
// loadTailwind search over starter/package.json), so a production image that can't compile a prototype
// fails at BUILD time — loud — instead of at run time, where precompile used to fail open and ship the
// raw CDN head (the P0 that made every hosted prototype render unstyled).
//
//   node plugins/app-agents/engine/tw-smoke.mjs   → exit 0 (compiled), non-zero (could not)
import { precompile } from "./proto-precompile.mjs";

// A minimal but real v4-contract document with enough utilities to clear precompile's byte floor. The
// import subpaths (theme.css/utilities.css) are the real contract — bare `@import "tailwindcss"` would
// resolve to the JS entry and is not what a prototype ships.
const CLASSES = "p-4 px-6 py-3 m-2 mt-4 mb-6 flex grid gap-4 items-center justify-between rounded-lg rounded-xl shadow-sm border bg-card text-sm text-lg font-semibold w-full h-10 max-w-md grid-cols-2 grid-cols-3 hover:bg-primary md:flex lg:grid-cols-4 col-span-2 space-y-4 divide-y overflow-hidden relative absolute inset-0 z-10 opacity-80 transition text-muted-foreground";
const DOC = `<!doctype html><html><head>
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
<style type="text/tailwindcss">
@import "tailwindcss/theme.css";
@import "tailwindcss/utilities.css";
@theme { --color-card: #131722; --color-primary: #00aaff; --color-muted-foreground: #8b93a7; }
</style></head><body><div class="${CLASSES}"></div><div class="${CLASSES}"></div></body></html>`;

const r = await precompile(DOC, { label: "tw-smoke" });
if (!r.changed) {
  console.error(`✗ tailwind smoke FAILED — ${r.reason}`);
  console.error("  The Tailwind compiler is not resolvable/usable in this image. Prototypes would ship");
  console.error("  uncompiled and render unstyled. Install the starter workspace deps (tailwindcss) and retry.");
  process.exit(1);
}
if (/tailwindcss\/browser@|type=["']text\/tailwindcss["']/.test(r.html)) {
  console.error("✗ tailwind smoke FAILED — the raw runtime survived compilation");
  process.exit(1);
}
console.log(`✓ tailwind smoke OK — compiled ${r.stats.cssBytes} bytes with tailwindcss ${r.stats.version} (CDN removed)`);
