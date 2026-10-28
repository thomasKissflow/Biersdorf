// reconcile.mjs — the three-way planner for editing an EXISTING app safely.
//
// The reconciler's promise is: the live app is the source of truth, the AI proposes a MINIMAL
// reviewable diff, and a live change a developer made by hand is never silently overwritten. That
// promise needs three inputs, not two:
//
//   BASE     what we last knew the app to be (the snapshot from the previous apply/import).
//   DESIRED  what the new IR wants it to be.
//   LIVE     what the app actually is right now (imported fresh).
//
// A two-way diff (desired vs live) cannot tell "the user intends this change" from "the live app
// drifted since we last looked" — so it either clobbers drift or refuses every difference. The base
// disambiguates:
//
//   changed base→desired, live==base     → ADD/UPDATE   (a clean intended change)
//   changed base→live,    desired==base   → DRIFT        (live moved, we didn't; leave it, report it)
//   changed in BOTH, desired!=live        → CONFLICT     (both moved differently; do NOT auto-apply)
//   base==desired==live                   → UNCHANGED
//   in desired, absent from base+live      → ADD
//   in base+live, absent from desired      → DELETE (intended removal) — but only if live==base,
//                                            else it's a DRIFT the desired IR simply didn't mention.
//
// This module is PURE — three IRs in, a classified plan out. It fabricates no live API calls (the
// import that produces LIVE is a separate, honestly-scoped concern, see import-live.mjs), so it is
// fully deterministic and testable.

// Stable identity for an entity across the three IRs (id preferred, name as the human key).
const keyOf = (e) => String(e?.id || e?.name || "");
// A slice is a named collection on the IR. Each is compared by identity, then by content.
const SLICES = [
  { k: "forms", label: "form/flow" },
  { k: "roles", label: "role" },
  { k: "lists", label: "list" },
  { k: "permissions", label: "permission", key: (p) => `${p.role}::${p.flow}` },
  { k: "pages", label: "page" },
  { k: "automations", label: "automation" },
];
const listOf = (ir, k) => (Array.isArray(ir?.[k]) ? ir[k] : []);
// Content equality: order-insensitive deep compare via canonical JSON (enough for IR entities, which
// are plain data). Undefined and missing arrays compare equal so an absent slice never reads as a diff.
const canon = (v) => JSON.stringify(sortKeys(v));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}
const same = (a, b) => canon(a) === canon(b);

/**
 * plan(base, desired, live) → { changes:[{slice, key, op, reason, conflict?}], summary, hasConflict }
 * op ∈ add | update | delete | drift | conflict | unchanged. Only add/update/delete are APPLIED;
 * drift and conflict are reported and NEVER auto-applied (a conflict needs a human).
 */
export function plan(base = {}, desired = {}, live = {}) {
  const changes = [];
  for (const slice of SLICES) {
    const keyFn = slice.key || keyOf;
    const idx = (ir) => { const m = new Map(); for (const e of listOf(ir, slice.k)) m.set(keyFn(e), e); return m; };
    const B = idx(base), D = idx(desired), L = idx(live);
    // FAIL CLOSED on unknown live state. If the live IR's provenance says this slice was
    // desired-carried (import-live only reconstructs forms/fields from live — the rest is a copy of
    // desired), we do NOT actually know the live truth, so we must not diff-and-overwrite it: every
    // entity is marked `unknown` and is never applicable. (#15)
    const liveKnown = (live?._provenance?.[slice.k] ?? "live") === "live";
    const keys = new Set([...B.keys(), ...D.keys(), ...L.keys()].filter(Boolean));
    for (const key of keys) {
      const b = B.get(key), d = D.get(key), l = L.get(key);
      const inB = B.has(key), inD = D.has(key), inL = L.has(key);
      if (!liveKnown) { changes.push({ slice: slice.k, label: slice.label, key, op: "unknown", reason: `live state for '${slice.k}' is desired-carried, not reconstructed from live — cannot safely diff` }); continue; }
      let op, reason, conflict;
      // dChanged/lChanged relative to BASE. With no base entry, "present now" counts as a change from
      // the base-absent state — so a base-absent concurrent create on BOTH sides with different
      // content reads as both-changed → conflict, per spec.
      const dChanged = inD && (!inB || !same(b, d));
      const lChanged = inL && (!inB || !same(b, l));
      if (inD && inL) {
        if (same(d, l)) { op = "unchanged"; reason = "desired already matches live"; }
        else if (dChanged && lChanged) { op = "conflict"; reason = "both desired and live diverged (incl. base-absent concurrent create) — needs a human"; conflict = { base: b, desired: d, live: l }; }
        else if (dChanged) { op = "update"; reason = "desired changed; live unchanged since base"; }
        else { op = "drift"; reason = "live changed since base; desired did not — live-owned change kept"; }
      }
      else if (inD && !inL) {
        // desired has it, live does not.
        if (!inB) { op = "add"; reason = "new in desired, never lived"; }
        else if (same(b, d)) { op = "drift"; reason = "desired UNCHANGED but live DELETED it — respecting the live deletion, not recreating"; }  // #15 fix: was wrongly "add/recreate"
        else { op = "conflict"; reason = "desired changed it, but live DELETED it — needs a human"; conflict = { base: b, desired: d, live: null }; }
      }
      else if (!inD && inL) {
        // desired doesn't mention it. If live matches base, the user intends to DELETE it; if live
        // differs from base (or was never in base), live drifted independently — leave it.
        if (inB && same(b, l)) { op = "delete"; reason = "removed from desired; live unchanged since base"; }
        else { op = "drift"; reason = "in live, not in desired — live-only (dev-owned), left untouched"; }
      }
      else continue;
      changes.push({ slice: slice.k, label: slice.label, key, op, reason, ...(conflict ? { conflict } : {}) });
    }
  }
  const by = (op) => changes.filter((c) => c.op === op);
  const summary = { add: by("add").length, update: by("update").length, delete: by("delete").length, drift: by("drift").length, conflict: by("conflict").length, unknown: by("unknown").length, unchanged: by("unchanged").length };
  // ONLY add/update/delete are applicable. drift (live-owned), conflict (needs a human), and unknown
  // (live state not reconstructed) are NEVER auto-applied — the reconciler's core safety promise.
  return { changes, summary, hasConflict: summary.conflict > 0, hasUnknown: summary.unknown > 0, applicable: changes.filter((c) => ["add", "update", "delete"].includes(c.op)) };
}

/**
 * The scope-of-change an apply may touch — derived from the plan's applicable items, so
 * `validation-gate` / a scoped apply can BLOCK anything the plan didn't intend (the reconciler's
 * "never rewrite unrelated items"). Returns the set of `slice:key` the plan authorizes.
 */
export function planScope(planned) {
  return (planned.applicable || []).map((c) => `${c.slice}:${c.key}`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const { readFileSync } = await import("node:fs");
  const argv = process.argv.slice(2);
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const load = (f) => (f ? JSON.parse(readFileSync(f, "utf8")) : {});
  const base = load(flag("--base")), desired = load(flag("--desired")), live = load(flag("--live"));
  if (!flag("--desired") || !flag("--live")) { console.error("usage: reconcile.mjs --base <base.json> --desired <desired.json> --live <live.json> [--out plan.json]"); process.exit(2); }
  const p = plan(base, desired, live);
  const out = flag("--out");
  if (out) { const { writeFileSync } = await import("node:fs"); writeFileSync(out, JSON.stringify(p, null, 2) + "\n"); }
  const s = p.summary;
  console.log(`PLAN (three-way) — ${s.add} add · ${s.update} update · ${s.delete} delete · ${s.drift} drift(left) · ${s.conflict} CONFLICT · ${s.unchanged} unchanged`);
  for (const c of p.changes.filter((c) => c.op !== "unchanged")) console.log(`  ${c.op === "conflict" ? "⚠" : c.op === "drift" ? "~" : "•"} ${c.op.padEnd(9)} ${c.slice}:${c.key} — ${c.reason}`);
  if (p.hasConflict) { console.log(`\n❌ ${s.conflict} conflict(s) — NOT auto-applicable; a human must resolve.`); process.exit(1); }
  process.exit(0);
}
