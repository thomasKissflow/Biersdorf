// widget-coverage.test.mjs — a library nobody has been told about will never be chosen.
//
// Eighteen packages were installed in #135. Three got wrappers; the other fifteen sat in the bundle
// doing nothing for a week, and even the three that existed were invisible — all four UI agents
// scored zero mentions, so no generated page could ever reach for them. Shipping a dependency is not
// the same as shipping a capability, and the gap between the two is silent: the build passes, the
// bundle grows, and the pages look exactly as they did before.
//
// So the chain is asserted end to end: installed → wrapped → exported → documented → guidance the
// agents actually read. Break any link and the library is dead weight again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const KF = join(ROOT, "starter", "src", "components", "kf");
const read = (p) => readFileSync(p, "utf8");

const pkg = JSON.parse(read(join(ROOT, "starter", "package.json")));
const index = read(join(KF, "index.js"));
const catalog = read(join(KF, "CATALOG.md"));
const guide = read(join(ROOT, "starter", "agents", "widget-guide.md"));
// The WHOLE src tree, not just components/kf — radix lives under components/ui and the SDK is reached
// from hooks. Scoping this to one directory made eleven perfectly-used packages look orphaned.
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : (/\.(jsx?|tsx?)$/.test(f) ? [read(p)] : []);
});
const source = walk(join(ROOT, "starter", "src")).join("\n");

// Packages that are legitimately never imported by name: build-time plugins, and helpers reached
// THROUGH another library rather than directly. Anything else must be reachable from the source.
const NOT_IMPORTED_DIRECTLY = new Set([
  "vite-plugin-pages",       // a build plugin, not a runtime import
  // Not a component library and not a build plugin either: the ENGINE calls tailwind's compile() at
  // assembly time to pre-build each prototype's CSS (engine/proto-precompile.mjs), so it is a
  // SERVER-side runtime dependency of this repo. It lives in `dependencies` deliberately — the image
  // installs with `--prod`, and while it sat in devDependencies the container had no tailwind, the
  // pre-compiler silently degraded, and every prototype shipped the browser CDN it was meant to
  // remove. Nothing in starter/src imports it by name, and nothing should.
  "tailwindcss",
  "tailwindcss-animate",     // a tailwind plugin, referenced from the config
  "@hookform/resolvers",     // imported as @hookform/resolvers/zod — matched by the deep-path rule
  "@kissflow/lowcode-client-sdk",  // the HOST injects it as a global; the app reaches it via useKf()
  // Engines required as a PEER by a React binding that IS wrapped. Nothing imports them by name and
  // nothing should — the binding owns them. Removing either breaks the wrapper that depends on it.
  "three",      // under @react-three/fiber + drei  → Scene3D.jsx
  "leaflet",    // under react-leaflet               → StoresMap.jsx
]);

test("every installed library is reachable from a component — no dead weight in the bundle", () => {
  const orphans = [];
  for (const dep of Object.keys(pkg.dependencies || {})) {
    if (NOT_IMPORTED_DIRECTLY.has(dep)) continue;
    // an import of the package itself, or any deep path inside it
    const used = new RegExp(`from ["'](?:${dep.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")})(?:/[^"']*)?["']`).test(source);
    if (!used) orphans.push(dep);
  }
  assert.deepEqual(orphans, [],
    `installed but nothing imports them — either wrap them or drop them:\n  ${orphans.join("\n  ")}`);
});

test("every exported component is documented in CATALOG.md", () => {
  // named exports from the barrel, minus helpers and re-exports that are not widgets
  const HELPERS = new Set(["TONES", "toneAt", "z", "motion", "rankWidgets", "bestWidget", "signalForField",
                           "toast", "Toaster", "CountUp", "Skeleton", "kfQueryClient"]);
  const exported = [...index.matchAll(/export \{([^}]+)\} from/g)]
    .flatMap((m) => m[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop()))
    .filter((n) => n && !HELPERS.has(n));

  const missing = exported.filter((n) => !catalog.includes(`\`${n}\``));
  assert.deepEqual(missing, [],
    `exported but absent from CATALOG.md — an undocumented component may as well not exist:\n  ${missing.join("\n  ")}`);
});

test("three.js is NOT in the barrel — importing it eagerly puts ~900KB in every page", () => {
  assert.ok(!/export .*from "\.\/Scene3D\.jsx"/.test(index),
    "Scene3D must stay out of index.js; it is reached by a lazy import so Vite gives it its own chunk");
  assert.match(guide, /lazy\(\(\) => import\(/, "and the guide has to show the lazy import, or nobody will use it");
});

test("the agents that pick and build widgets have been told the kit exists", () => {
  // The gap this closes: before, all four scored zero and nothing could ever be chosen.
  for (const agent of ["kf-ux-architect", "kf-ui-designer", "kf-ui-builder"]) {
    const md = read(join(ROOT, "plugins", "app-agents", "agents", `${agent}.md`));
    assert.match(md, /widget-guide\.md/, `${agent} never reads the widget guide, so the kit is invisible to it`);
  }
  // kf-prototype-builder is deliberately NOT in that list: it writes the single-file HTML prototype
  // against proto-kit/COMPONENTS.md, which is a different surface with a different component set.
});

test("the guide names each widget it claims to cover", () => {
  for (const w of ["DataGrid", "CalendarView", "GanttChart", "FlowDiagram", "VirtualList",
                   "SortableList", "SmartForm", "CsvImport", "WidgetBoundary", "useKfItems"]) {
    assert.ok(guide.includes(w), `widget-guide.md never mentions ${w}`);
  }
});
