// shell-check.mjs — fail the build when a freshly-rebuilt app-shell.jsx drifts from the standard
// sidebar/header/theme-switcher shape.
//
// CANONICAL COPY. kit-install.mjs installs this into every app it touches (<app>/scripts/
// shell-check.mjs + a `prebuild` hook), same mechanism theme-check.mjs already uses — edit here,
// not in an app.
//
//   node scripts/shell-check.mjs [appDir]        # defaults to cwd
//   node scripts/shell-check.mjs . --warn-only   # report, exit 0
//
// WHY THIS EXISTS. kf-ui-builder.md has told every shell-rebuild "sidebar separates by shadow, not
// a border" and "mount the theme switcher" since 2026-08-13 — and a sweep of the four apps built
// since still found two different shells that dropped one or both, plus a third that read a
// legacy scaffold-only token for its active-nav highlight instead of the real theme-reactive one.
// A written instruction an agent can skip is exactly the failure theme-check.mjs's own banner
// describes for the identity gate ("a line of prose in CONDUCTOR.md that an agent can skip") — the
// fix there was a loud, mechanical gate instead of a hope. This is the same fix for the shell.
//
// 2026-08-13, round 2: the outer sidebar/header containers were gated above, but the INNER
// elements (nav-item shape + active-selection colour, the header's avatar/name identity block,
// the sidebar's wordmark badge) were still hand-authored prose every time — and had already
// silently drifted between DamWatch and Supplier & Vendor Portal (a bg-sidebar-accent vs bg-accent
// selection token; a badge missing text-sm font-bold) before either was ever reported as a bug.
// Rather than grow this file into a longer and more fragile list of class-string checks, those
// three pieces were promoted to real shared components (kit/NavItem.jsx, kit/SidebarWordmark.jsx,
// kit/HeaderIdentity.jsx) that kit-install.mjs installs into every app — so this file only needs
// to check that they're actually IMPORTED, the same reliable pattern already used for
// ThemeSwitcher below, instead of re-deriving and checking their internals as substrings.
//
// WHAT THIS DOES NOT CHECK: whether the shell is well-designed, matches the app's domain, or has
// the right nav items — kf-ui-builder.md's "two apps must look visibly different" requirement is a
// judgment call, not a grep. This only catches the handful of load-bearing utility classes that
// have already drifted twice, checked as plain substrings against src/components/app-shell.jsx —
// deliberately not a JSX/AST parse, so it survives the file being restructured as long as the
// classes and the ThemeSwitcher usage are still there somewhere.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : ".";
const warnOnly = process.argv.includes("--warn-only");
const shellPath = join(dir, "src/components/app-shell.jsx");

if (!existsSync(shellPath)) {
  console.log("✓ shell-check: no src/components/app-shell.jsx — nothing to check (no root layout, or not built yet).");
  process.exit(0);
}
const shell = readFileSync(shellPath, "utf8");
const has = (s) => shell.includes(s);

const errors = [];
const warnings = [];

// ── Sidebar: shadow, never a border — Layout.dc.html's original border exception was overridden
// app-wide 2026-08-13 in favour of --shadow-sidebar; see kf-ui-builder.md's own note. ─────────────
if (has("<aside")) {
  if (!has("shadow-sidebar")) errors.push('Sidebar missing "shadow-sidebar" — the <aside> should read `bg-sidebar shadow-sidebar`, no border utility on that element at all.');
  if (has("border-sidebar-border") || has("border-r border-sidebar")) errors.push('Sidebar uses a border ("border-sidebar-border") instead of "shadow-sidebar" — the original prototype\'s border exception was superseded app-wide; see kf-ui-builder.md.');
}

// ── Header: the exact reference shape (DamWatch, generalized 2026-08-13) — four load-bearing
// classes checked independently since a partial adoption (e.g. bg-surface with no backdrop-blur)
// is still drift, just quieter. ─────────────────────────────────────────────────────────────────
if (has("<header")) {
  const HEADER_CLASSES = ["bg-surface", "backdrop-blur-sm", "border-l", "border-gray-2"];
  const missing = HEADER_CLASSES.filter((c) => !has(c));
  if (missing.length) errors.push(`Header missing: ${missing.join(", ")} — see kf-ui-builder.md's reference className string ("flex h-16 shrink-0 items-center gap-4 border-b border-l border-gray-2 bg-surface backdrop-blur-sm px-4 md:px-6").`);
}

// ── Theme switcher — a real kit component (ThemeSwitcher.jsx), not the scaffold's throwaway demo
// picker. Import-only check: it self-guards (renders nothing below 2 anchors), so there is never a
// reason to omit it even in an app that currently has just Beacon. ─────────────────────────────
if (!has("ThemeSwitcher")) errors.push('No ThemeSwitcher import/usage found — import { ThemeSwitcher } from "@/components/kit/ThemeSwitcher" and render it (variant="sidebar" next to dark mode, or variant="header" next to the dev role switcher).');

// ── Nav item, sidebar wordmark, header identity — the three INNER-element pieces promoted to
// real kit components 2026-08-13 (see the banner above). Import-only checks, same reasoning as
// ThemeSwitcher: each component self-contains the shape that was drifting (pill nav rows +
// bg-accent selection, the wordmark badge, the avatar/name identity block), so once it's
// imported there is nothing left for a hand-authored equivalent to get wrong. Only checked when
// the shell actually has a sidebar/header to put them in — a single-page or headerless app
// legitimately has neither. ──────────────────────────────────────────────────────────────────
if (has("<aside") || has("SidebarBody")) {
  if (!has("kit/NavItem") && !has("from \"@/components/kit/NavItem\"")) errors.push('No NavItem import found — import { NavItem } from "@/components/kit/NavItem" for sidebar nav rows instead of hand-authoring the pill shape + active-selection colour per app.');
  if (!has("kit/SidebarWordmark")) errors.push('No SidebarWordmark import found — import { SidebarWordmark } from "@/components/kit/SidebarWordmark" for the sidebar\'s top badge+name block.');
}
if (has("<header")) {
  if (!has("kit/HeaderIdentity")) errors.push('No HeaderIdentity import found — import { HeaderIdentity } from "@/components/kit/HeaderIdentity" for the header\'s avatar+name block (it also bakes in the !bg-primary !text-primary-foreground avatar fix).');
}

// ── Active-nav token — warn, not fail: bg-sidebar-accent is kit-compat.css's bridge for the OLD
// scaffold shell only, hard-coded per app at ~100% saturation, and does NOT react to the theme
// switcher the way bg-accent does. A rebuilt shell reading it for its own nav highlight is very
// likely a copy from the scaffold default rather than a deliberate choice — but unlike the three
// checks above there's no single proven-wrong pattern yet (just one observed case), so this warns
// instead of failing until it's confirmed as consistently wrong as the others were. ──────────────
if (has("bg-sidebar-accent")) warnings.push('Found "bg-sidebar-accent" — likely meant "bg-accent" (the real, theme-reactive token; sidebar-accent is a legacy scaffold-only bridge that stays fixed regardless of the picked theme). Check the active-nav-item styling.');

if (!errors.length && !warnings.length) {
  console.log("✓ shell-check: sidebar, header and theme switcher match the standard shape.");
  process.exit(0);
}

const lines = [];
if (errors.length) {
  lines.push("✗ shell-check: app-shell.jsx has drifted from the standard shell.\n");
  for (const e of errors) lines.push(`  - ${e}`);
}
if (warnings.length) {
  lines.push((errors.length ? "\n" : "⚠ shell-check:\n") + "  warnings:");
  for (const w of warnings) lines.push(`  - ${w}`);
}
const msg = lines.join("\n");

if (warnOnly || !errors.length) { console.warn(msg); process.exit(0); }
console.error(msg);
process.exit(1);
