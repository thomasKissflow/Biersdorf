// reconcile.test.mjs — the three-way planner (#20). The base is what disambiguates a user's intended
// change from live drift; without it a two-way diff clobbers drift or refuses everything.
import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, planScope } from "../reconcile.mjs";

const form = (id, extra = {}) => ({ id, name: id, flowType: "Process", ...extra });
const opFor = (p, slice, key) => p.changes.find((c) => c.slice === slice && c.key === key)?.op;

test("intended change: desired moved, live still == base → UPDATE", () => {
  const base = { forms: [form("Req", { fields: [{ name: "A" }] })] };
  const desired = { forms: [form("Req", { fields: [{ name: "A" }, { name: "B" }] })] };  // added field
  const live = base;                                                                      // live unchanged
  const p = plan(base, desired, live);
  assert.equal(opFor(p, "forms", "Req"), "update");
});

test("live drift: live moved, desired == base → DRIFT, left untouched (not overwritten)", () => {
  const base = { forms: [form("Req", { fields: [{ name: "A" }] })] };
  const desired = base;                                                                    // we didn't change it
  const live = { forms: [form("Req", { fields: [{ name: "A" }, { name: "DevAdded" }] })] };// a dev changed it live
  const p = plan(base, desired, live);
  assert.equal(opFor(p, "forms", "Req"), "drift");
  assert.equal(p.applicable.length, 0, "drift is never applied — the dev's live change is kept");
});

test("conflict: BOTH desired and live changed differently since base → CONFLICT, not auto-applied", () => {
  const base = { forms: [form("Req", { fields: [{ name: "A" }] })] };
  const desired = { forms: [form("Req", { fields: [{ name: "A" }, { name: "Mine" }] })] };
  const live = { forms: [form("Req", { fields: [{ name: "A" }, { name: "Theirs" }] })] };
  const p = plan(base, desired, live);
  assert.equal(opFor(p, "forms", "Req"), "conflict");
  assert.ok(p.hasConflict);
  assert.equal(p.applicable.length, 0, "a conflict needs a human — never auto-applied");
});

test("add: new in desired, absent from base and live → ADD", () => {
  const p = plan({ forms: [] }, { forms: [form("New")] }, { forms: [] });
  assert.equal(opFor(p, "forms", "New"), "add");
});

test("delete only when live is unchanged since base — silence on a drifted item is NOT a delete", () => {
  // removed from desired, live == base → intended DELETE
  const clean = plan({ forms: [form("Old")] }, { forms: [] }, { forms: [form("Old")] });
  assert.equal(opFor(clean, "forms", "Old"), "delete");
  // removed from desired, but live DRIFTED from base → keep it (drift), do not delete on silence
  const drifted = plan({ forms: [form("Old", { fields: [] })] }, { forms: [] }, { forms: [form("Old", { fields: [{ name: "X" }] })] });
  assert.equal(opFor(drifted, "forms", "Old"), "drift");
});

test("unchanged: base == desired == live → UNCHANGED, nothing applied", () => {
  const s = { forms: [form("Req", { fields: [{ name: "A" }] })] };
  const p = plan(s, s, s);
  assert.equal(opFor(p, "forms", "Req"), "unchanged");
  assert.equal(p.applicable.length, 0);
});

test("permissions keyed by role::flow, not id — a per-cell matrix diffs correctly", () => {
  const base = { permissions: [{ role: "R", flow: "F", level: "ReadOnly" }] };
  const desired = { permissions: [{ role: "R", flow: "F", level: "Editable" }] };
  const p = plan(base, desired, base);
  assert.equal(opFor(p, "permissions", "R::F"), "update");
});

test("planScope authorizes only the intended items — a scoped apply blocks the rest", () => {
  const p = plan({ forms: [form("A")] }, { forms: [form("A", { fields: [{ name: "x" }] }), form("B")] }, { forms: [form("A")] });
  const scope = planScope(p);
  assert.ok(scope.includes("forms:A") && scope.includes("forms:B"), "both intended changes in scope");
  assert.ok(!scope.some((s) => s.includes("conflict")), "scope carries no drift/conflict");
});

// ── #15 correctness cases (the two classification bugs + provenance fail-closed) ────────────────────
test("#15 live deletion + desired UNCHANGED → DRIFT, not a recreate (the dev's deletion is respected)", () => {
  const base = { forms: [form("Req", { fields: [{ name: "A" }] })] };
  const desired = base;                                   // desired unchanged
  const live = { forms: [] };                             // dev deleted it live
  const p = plan(base, desired, live);
  assert.equal(opFor(p, "forms", "Req"), "drift", "must NOT recreate — this was the bug (classified add)");
  assert.equal(p.applicable.length, 0, "drift is never applied — the deletion stands");
});

test("#15 live deletion + desired CHANGED it → CONFLICT (user wants it, dev deleted it)", () => {
  const base = { forms: [form("Req", { fields: [{ name: "A" }] })] };
  const desired = { forms: [form("Req", { fields: [{ name: "A" }, { name: "B" }] })] };  // user changed it
  const live = { forms: [] };                                                             // dev deleted it
  const p = plan(base, desired, live);
  assert.equal(opFor(p, "forms", "Req"), "conflict");
  assert.ok(p.hasConflict && p.applicable.length === 0, "a conflict is never auto-applied");
});

test("#15 base-absent concurrent creation with DIFFERENT content → CONFLICT (was wrongly 'update')", () => {
  const p = plan({ forms: [] }, { forms: [form("New", { fields: [{ name: "Mine" }] })] }, { forms: [form("New", { fields: [{ name: "Theirs" }] })] });
  assert.equal(opFor(p, "forms", "New"), "conflict");
  assert.equal(p.applicable.length, 0);
});

test("#15 base-absent concurrent creation with SAME content → UNCHANGED (both added the same)", () => {
  const same = { forms: [form("New", { fields: [{ name: "X" }] })] };
  const p = plan({ forms: [] }, same, same);
  assert.equal(opFor(p, "forms", "New"), "unchanged");
});

test("#15 desired-carried live slice is UNKNOWN and never applicable (fail closed on unreconstructed live)", () => {
  const base = { roles: [{ id: "r1", name: "Approver" }] };
  const desired = { roles: [{ id: "r1", name: "Approver" }, { id: "r2", name: "Admin" }] };
  const live = { roles: [{ id: "r1", name: "Approver" }], _provenance: { roles: "desired-carried" } };  // roles not from live
  const p = plan(base, desired, live);
  assert.ok(p.changes.filter((c) => c.slice === "roles").every((c) => c.op === "unknown"), "all role changes are unknown");
  assert.ok(p.hasUnknown && p.applicable.every((c) => c.slice !== "roles"), "unknown slices never reach applicable");
});

test("#15 forms slice stays trustworthy when provenance says it is live", () => {
  const base = { forms: [form("A")] };
  const p = plan(base, { forms: [form("A", { fields: [{ name: "x" }] })] }, { forms: [form("A")], _provenance: { forms: "live" } });
  assert.equal(opFor(p, "forms", "A"), "update", "forms are reconstructed from live, so they diff normally");
});
