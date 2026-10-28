#!/usr/bin/env node
// qa-universe.mjs — derive the COVERAGE UNIVERSE for runtime QA from an App-Spec IR, and gate a
// test plan against it. The universe is deterministic and countable; "100% coverage" means every
// universe item is claimed by ≥1 test case in qa/test-plan.json. The smart agent (kf-runtime-qa)
// decides HOW to test each item; this file decides WHAT must be tested and refuses anything less.
//
//   node engine/qa-universe.mjs <app-spec.json>                     # emit the universe (JSON)
//   node engine/qa-universe.mjs <app-spec.json> --check <plan.json> # coverage gate (exit 1 if <100%)
//
// Universe item classes (stable ids):
//   J:<journey>                          persona journey, end-to-end
//   W:<flow>:<step>:<decision|advance>   every workflow step × outcome (incl. reject loop-backs)
//   P:<role>:<model>:<access>            every GRANTED permission cell (positive test)
//   D:<role>:<model>                     every implied DENIAL (role exists, no grant → must be blocked)
//   S:<role>:<model>:<scope>             every data-scope rule (my-items / my-team / all)
//   A:<automation>                       every cross-flow automation (trigger fired ⇒ effect exists)
//   F:<flow>:<field>:required            every required field enforced
//   F:<flow>:<field>:computed            every formula/computed field evaluates
//   R:<flow>:<field>:ref                 every reference field resolves against its target
import { readFileSync } from "node:fs";

export function deriveUniverse(ir) {
  const items = [];
  const add = (id, kind, desc, role = null) => items.push({ id, kind, desc, role });
  const forms = ir.forms || [], roles = (ir.roles || []).map((r) => r.name || r), perms = ir.permissions || [];

  // J — journeys
  for (const j of ir.domain?.journeys || ir.journeys || [])
    add(`J:${j.id || j.name}`, "journey", `journey '${j.name || j.id}' completes end-to-end`, j.persona || null);

  // W — every step × outcome
  for (const f of forms) {
    const steps = f.workflow?.steps || [];
    steps.forEach((s, i) => {
      const nm = s.name || s.label || `step-${i + 1}`;
      const outs = (s.decision && s.decision.length) ? s.decision : ["advance"];
      for (const o of outs)
        add(`W:${f.name}:${nm}:${o}`, "workflow", `'${f.name}' at '${nm}' outcome '${o}' moves to the designed state`, s.actor || null);
    });
    for (const st of f.workflow?.statuses || [])
      add(`W:${f.name}:status:${st.name || st}`, "workflow", `case '${f.name}' can reach status '${st.name || st}'`);
  }

  // P + S — granted cells and their scopes
  const granted = new Set();
  for (const p of perms) {
    granted.add(`${p.role}::${p.model}`);
    add(`P:${p.role}:${p.model}:${p.access || "edit"}`, "permission", `'${p.role}' CAN ${p.access || "edit"} '${p.model}'`, p.role);
    if (p.scope) add(`S:${p.role}:${p.model}:${p.scope}`, "scope", `'${p.role}' on '${p.model}' sees exactly '${p.scope}' records`, p.role);
  }
  // D — implied denials: role × model pairs with NO grant must be blocked (skip default Admin)
  for (const r of roles) for (const f of forms) {
    if (!granted.has(`${r}::${f.name}`) && r !== "Admin" && r !== "Super Admin")
      add(`D:${r}:${f.name}`, "denial", `'${r}' must NOT access '${f.name}' (no grant in the matrix)`, r);
  }

  // A — automations
  for (const a of ir.automations || [])
    if ((a.channel || "internal") !== "external")
      add(`A:${a.id || a.name}`, "automation", `automation '${a.name || a.id}': trigger fires ⇒ effect record/update exists`);

  // F — step-level field/section/table states (every designed Editable/ReadOnly/Hidden/Mandatory
  // override is an obligation: prove the field is in that state AT that step)
  for (const f of forms) for (const s of f.workflow?.steps || [])
    for (const [k, v] of Object.entries(s.field_permissions || {}))
      add(`F:${f.name}:${s.name || "?"}:${k}:${v}`, "field", `'${f.name}' at step '${s.name}': '${k}' is ${v}`, s.actor || null);

  // F/R — field rules
  for (const f of forms) for (const fld of f.fields || []) {
    if (fld.required) add(`F:${f.name}:${fld.name}:required`, "field", `'${f.name}.${fld.name}' rejects empty submission`);
    if (fld.formula || fld.computed) add(`F:${f.name}:${fld.name}:computed`, "field", `'${f.name}.${fld.name}' computes from its formula`);
    if (fld.ref) add(`R:${f.name}:${fld.name}:ref`, "reference", `'${f.name}.${fld.name}' resolves against '${fld.ref}' and lookups populate`);
  }
  return items;
}

export function checkCoverage(universe, plan) {
  const claimed = new Set();
  for (const t of plan.tests || []) for (const c of t.covers || []) claimed.add(c);
  const missing = universe.filter((u) => !claimed.has(u.id));
  const unknown = [...claimed].filter((c) => !universe.some((u) => u.id === c));
  // use cases — plain-English user journeys a BA can read. Every universe item must belong to one,
  // and every story must be free of technical ids (that's what makes it BA-readable).
  const ucs = plan.usecases || [];
  const ucClaimed = new Set();
  for (const u of ucs) for (const c of u.covers || []) ucClaimed.add(c);
  const missingUC = universe.filter((u) => !ucClaimed.has(u.id));
  const badStories = ucs.filter((u) => !u.story || /(^|[^A-Za-z])(J|W|P|D|S|A|F|R):/.test(u.story)).map((u) => u.id || u.title);
  return { total: universe.length, covered: universe.length - missing.length, missing, unknown,
    usecases: ucs.length, missingUC, badStories };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const ir = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const universe = deriveUniverse(ir);
  const ci = process.argv.indexOf("--check");
  if (ci < 0) {
    const byKind = {};
    for (const u of universe) byKind[u.kind] = (byKind[u.kind] || 0) + 1;
    console.log(JSON.stringify({ counts: byKind, total: universe.length, items: universe }, null, 2));
  } else {
    const plan = JSON.parse(readFileSync(process.argv[ci + 1], "utf8"));
    const r = checkCoverage(universe, plan);
    console.log(`coverage: ${r.covered}/${r.total} (${((r.covered / r.total) * 100).toFixed(1)}%) · use cases: ${r.usecases}`);
    if (r.unknown.length) console.log(`⚠ ${r.unknown.length} claimed ids not in the universe: ${r.unknown.slice(0, 5).join(", ")}…`);
    let bad = false;
    if (r.missing.length) {
      bad = true;
      console.log(`✗ NOT 100% — ${r.missing.length} uncovered item(s):`);
      for (const m of r.missing.slice(0, 40)) console.log(`  ${m.id} — ${m.desc}`);
    }
    if (!r.usecases) { bad = true; console.log("✗ plan has no `usecases` — every plan needs plain-English use cases (one per user journey) a BA can read."); }
    if (r.missingUC.length) {
      bad = true;
      console.log(`✗ ${r.missingUC.length} item(s) belong to NO use case:`);
      for (const m of r.missingUC.slice(0, 40)) console.log(`  ${m.id} — ${m.desc}`);
    }
    if (r.badStories.length) { bad = true; console.log(`✗ use case(s) with a missing story or technical ids leaking into it: ${r.badStories.join(", ")} — stories must read as plain English.`); }
    if (bad) process.exit(1);
    console.log("✓ 100% of the coverage universe is claimed by the test plan, and every item belongs to a plain-English use case.");
  }
}
