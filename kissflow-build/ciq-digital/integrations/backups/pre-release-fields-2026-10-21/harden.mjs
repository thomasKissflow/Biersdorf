// Hardening of the app session's six hand-off integrations (21 Oct, from the portal session's night tests; HARDENING.md).
// A pure transform of one integration's draft: a second "Search an item" (the portal target, searched by the payload's app
// id like I-1's twin search) between the app item's search and the Run script, one more script input (that search's Data),
// the hardened script (scripts/harden/), and every action's Output/IsTested cleared (the webhook trigger keeps its
// captured Output). No Kissflow call here: build.mjs runs it on the snapshot (stage harden, a dry run) or on the re-read
// live draft (stage harden-apply); test-harden.mjs runs it offline.

const LISTS = ["Integration::Trigger", "Integration::Action", "Trigger::FieldMapping", "Action::FieldMapping", "FieldMapping::FieldMapping", "FieldMapping::Property", "Property::Reference"];
const fmsOf = (b, id) => (b[id]?.[`${b[id]?.Kind}::FieldMapping`] || []).map((x) => b[x]).filter(Boolean);
const named = (b, id, name) => fmsOf(b, id).find((f) => f.Name === name);
const propOf = (b, fm) => (fm?.["FieldMapping::Property"] || []).map((p) => b[p]).find(Boolean);
const orderOf = (b) => [...(b[b.Root]?.["Integration::Action"] || [])];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The Run script's input names and the Code property. */
function scriptParts(b, ps) {
  const parent = named(b, ps, "input_fields");
  const inputs = (parent?.["FieldMapping::FieldMapping"] || []).map((c) => b[c]).filter(Boolean);
  return { parent, inputs, code: propOf(b, named(b, ps, "js_code")) };
}

/** Every Field property ("context.<step>.<path>") must read the trigger or a step that runs before its own step. */
export function wiring(b) {
  const root = b[b.Root] || {};
  const order = [...(root["Integration::Trigger"] || []), ...(root["Integration::Action"] || [])];
  const problems = [];
  const walk = (fm, step, i) => {
    for (const p of fm?.["FieldMapping::Property"] || []) {
      const f = b[p]?.Type === "Field" ? b[p].Field : null;
      const m = f && /^context\.([^.]+)\./.exec(f);
      if (m && !order.slice(0, i).includes(m[1])) problems.push(`${step}.${fm.Name} reads ${m[1]}, which does not run before it`);
    }
    for (const c of fm?.["FieldMapping::FieldMapping"] || []) walk(b[c], step, i);
  };
  order.forEach((step, i) => fmsOf(b, step).forEach((fm) => walk(fm, step, i)));
  return problems;
}

/** Listed ids that don't exist, children whose parent pointer is wrong, and entities nothing reaches from the root. */
export function integrity(b) {
  const problems = [];
  const seen = new Set([b.Root]);
  const visit = (id) => {
    const e = b[id];
    for (const k of LISTS) for (const x of e?.[k] || []) {
      if (!b[x]) { problems.push(`${id} lists ${x}, which does not exist`); continue; }
      const back = k === "FieldMapping::FieldMapping" ? b[x].FieldMapping : k === "FieldMapping::Property" ? b[x].FieldMapping : k === "Action::FieldMapping" ? b[x].Action : k === "Property::Reference" ? b[x].Property : null;
      if (back !== null && back !== undefined && back !== id) problems.push(`${x} points to ${back}, but ${id} lists it`);
      if (!seen.has(x)) { seen.add(x); visit(x); }
    }
  };
  visit(b.Root);
  const unreached = Object.entries(b).filter(([k, v]) => v?.Kind && v.Kind !== "User" && !seen.has(k)).map(([k]) => k);
  return { problems, unreached };
}

/** What a hardened draft must look like; [] when it does. */
export function checkHardened(b, spec, codeTo) {
  const out = [];
  const want = [spec.s1, spec.s2, spec.ps, ...spec.targets];
  if (!same(orderOf(b), want)) out.push(`run order is ${orderOf(b).join(", ")}; want ${want.join(", ")}`);
  const s2 = b[spec.s2];
  if (!s2 || s2.Kind !== "Action" || s2.Type !== "Search" || s2.Connector?.ActionId !== "Action_Kh4Jb2AoG") out.push(`${spec.s2} is not a Kissflow Process "Search an item"`);
  else {
    if (s2.Connection?._id !== b[spec.s1]?.Connection?._id) out.push(`${spec.s2} does not use ${spec.s1}'s connection`);
    if (!same(propOf(b, named(b, spec.s2, "process_id"))?.Value, [spec.read[0]])) out.push(`${spec.s2} does not search ${spec.read[0]}`);
    if (propOf(b, named(b, spec.s2, "lookupValue"))?.Field !== `context.${spec.trigger}.${spec.key}`) out.push(`${spec.s2} does not search by the payload's ${spec.key}`);
  }
  const { inputs, code } = scriptParts(b, spec.ps);
  const inp = inputs.find((c) => c.Name === spec.input);
  if (propOf(b, inp)?.Field !== `context.${spec.s2}.Data`) out.push(`${spec.ps} has no input ${spec.input} = context.${spec.s2}.Data`);
  if (code?.Code !== codeTo) out.push(`${spec.ps} does not run scripts/harden/${spec.code}`);
  return [...out, ...wiring(b), ...integrity(b).problems];
}

/**
 * spec: {trigger, s1, s2, ps, targets, key, extraInputs, read: [processId, label], input, code}; code: {from, to}, the built
 * script (scripts/<code>) and the hardened one. Refuses (throws) unless the draft has exactly the built shape (trigger, run
 * order [s1, ps, ...targets], the script's inputs and code as built), so a manual change made in the builder stops it
 * instead of being overwritten. A draft that is already hardened comes back as {already: true}.
 */
export function hardenDraft(draft, spec, code, newId) {
  if (!draft || typeof draft !== "object" || !draft.Root || !draft[draft.Root]) throw new Error("not an integration draft (no Root)");
  const b = structuredClone(draft);
  const fresh = (p) => { let x; do x = newId(p); while (b[x]); return x; };
  if (b[spec.s2]) {
    const problems = checkHardened(b, spec, code.to);
    if (problems.length) throw new Error(`partly hardened, fix by hand first: ${problems.join("; ")}`);
    return { already: true, blob: draft, changes: [] };
  }
  const root = b[b.Root];
  if (!same(root["Integration::Trigger"], [spec.trigger])) throw new Error(`trigger is ${JSON.stringify(root["Integration::Trigger"])}; built: [${spec.trigger}]`);
  const before = orderOf(b);
  const built = [spec.s1, spec.ps, ...spec.targets];
  if (!same(before, built)) throw new Error(`run order is ${before.join(", ")}; built: ${built.join(", ")}`);
  const pFm = named(b, spec.s1, "process_id"), lFm = named(b, spec.s1, "lookupValue");
  if (b[spec.s1]?.Type !== "Search" || !pFm || !lFm) throw new Error(`${spec.s1} is not the built "Search an item"`);
  if (propOf(b, lFm)?.Field !== `context.${spec.trigger}.${spec.key}`) throw new Error(`${spec.s1} no longer searches by the payload's ${spec.key}`);
  const { parent, inputs, code: codeProp } = scriptParts(b, spec.ps);
  const names = inputs.map((c) => c.Name).sort();
  const builtNames = [spec.key, "rows", ...(spec.extraInputs || [])].sort();
  if (!parent || !same(names, builtNames)) throw new Error(`${spec.ps} inputs are ${names.join(", ")}; built: ${builtNames.join(", ")}`);
  if (!codeProp) throw new Error(`${spec.ps} has no js_code`);
  // the refusal carries the builder's change as a line diff (e.diff), which build.mjs prints
  if (codeProp.Code !== code.from) throw Object.assign(new Error(`${spec.ps} code differs from scripts/${spec.code} (changed in the builder?): compare before hardening`), { diff: lineDiff(code.from, String(codeProp.Code ?? "")) });

  // the new step: the same connector, connection and field schema as the app item's search (I-1's Action_I1_2_twins shape)
  const s1 = b[spec.s1];
  const fp = fresh("FieldMapping"), pp = fresh("Property"), fl = fresh("FieldMapping"), pl = fresh("Property");
  b[spec.s2] = { Id: spec.s2, Kind: "Action", Type: "Search", Name: s1.Name, IsInternalAuth: false, Connection: { ...s1.Connection }, Integration: b.Root,
    Connector: { ...s1.Connector }, "Action::FieldMapping": [fp, fl] };
  b[fp] = { Id: fp, Kind: "FieldMapping", Type: pFm.Type, FieldId: pFm.FieldId, Label: pFm.Label, Name: "process_id", IsRequired: !!pFm.IsRequired, IsDropdown: true, AutoRefresh: true, Action: spec.s2,
    SelectedDropdown: [{ FieldId: spec.read[0], FieldName: spec.read[1], IsSubArray: false }], "FieldMapping::Property": [pp] };
  b[pp] = { Id: pp, Kind: "Property", FieldMapping: fp, Type: "Value", Value: [spec.read[0]], Name: "process_id" };
  b[fl] = { Id: fl, Kind: "FieldMapping", Type: lFm.Type, FieldId: lFm.FieldId, Label: lFm.Label, Name: "lookupValue", IsRequired: !!lFm.IsRequired, Action: spec.s2, "FieldMapping::Property": [pl] };
  b[pl] = { Id: pl, Kind: "Property", FieldMapping: fl, Type: "Field", Field: `context.${spec.trigger}.${spec.key}`, Name: "lookupValue" };
  root["Integration::Action"] = [spec.s1, spec.s2, spec.ps, ...spec.targets];

  // the script's new input (the setScriptInputs child shape) and the hardened code
  const ci = fresh("FieldMapping"), cp = fresh("Property");
  b[ci] = { Id: ci, Kind: "FieldMapping", Type: "String", IsVisible: true, FieldMapping: parent.Id, Name: spec.input, Label: spec.input, "FieldMapping::Property": [cp] };
  b[cp] = { Id: cp, Kind: "Property", FieldMapping: ci, Type: "Field", Field: `context.${spec.s2}.Data`, Name: spec.input };
  b[parent.Id] = { ...b[parent.Id], "FieldMapping::FieldMapping": [...parent["FieldMapping::FieldMapping"], ci] };
  b[codeProp.Id] = { ...codeProp, Code: code.to };

  // untest (build.mjs stage untest): no stale "tested" on a changed integration; the trigger keeps its captured Output
  const untested = [];
  for (const a of before) if (b[a].Output !== undefined || b[a].IsTested !== undefined) { const { Output, IsTested, ...rest } = b[a]; void Output; void IsTested; b[a] = rest; untested.push(a); }

  const changes = [
    `order    ${before.join(" → ")}`,
    `      →  ${orderOf(b).join(" → ")}`,
    `+ step   ${spec.s2} · "${s1.Name}" (${s1.Connector?.Name} ${s1.Connector?.Version}, connection ${s1.Connection?._id}) · process ${spec.read[0]} · lookupValue = context.${spec.trigger}.${spec.key}`,
    `+ input  ${spec.ps}.${spec.input} = context.${spec.s2}.Data`,
    `~ code   ${spec.ps}.js_code ${code.from.length} → ${code.to.length} chars (scripts/${spec.code} → scripts/harden/${spec.code})`,
    `~ untest Output/IsTested cleared on ${untested.join(", ")}; trigger ${spec.trigger} untouched (IsTested ${!!b[spec.trigger]?.IsTested})`,
    `+ ids    ${[spec.s2, fp, pp, fl, pl, ci, cp].join(", ")}`,
  ];
  return { already: false, blob: b, changes, added: [spec.s2, fp, pp, fl, pl, ci, cp], changed: [b.Root, parent.Id, codeProp.Id, ...untested] };
}

/** A small line diff (longest common subsequence) for printing a script change: "-"/"+" lines with their line numbers. */
export function lineDiff(a, b) {
  const x = a.split("\n"), y = b.split("\n");
  const L = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) { i++; j++; }
    else if (i < x.length && (j === y.length || L[i + 1][j] >= L[i][j + 1])) { out.push(`-${String(i + 1).padStart(3)} ${x[i]}`); i++; }
    else { out.push(`+${String(j + 1).padStart(3)} ${y[j]}`); j++; }
  }
  return out;
}
