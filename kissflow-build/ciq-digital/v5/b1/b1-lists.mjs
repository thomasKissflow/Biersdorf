// B1 lists (plan-v5-final §5), rehearsal R7 pattern.
//   node b1-lists.mjs           dry run: read the live state, print what would be created / replaced
//   node b1-lists.mjs --apply   create the 5 new lists (+ items), replace the 3 changed lists with OLD + NEW values,
//                               read every list back → b1/lists-result.json
// A list's POST …/items REPLACES the whole set, so the changed lists are sent with every existing value first.
// A new list that already exists (by id or name) is not created again; its items are only checked/filled.
import { A, Q, APP, NEW_LISTS, CHANGED_LISTS, listIdOf, appLists, listItemsStrict, call, save, sleep } from "./lib-b1.mjs";

const APPLY = process.argv.includes("--apply");
const out = { step: "B1-lists", at: new Date().toISOString(), apply: APPLY, created: [], replaced: [], readBack: {} };
const live = await appLists();
const plan = [];
for (const l of NEW_LISTS) {
  const id = listIdOf(l.name);
  const hit = live.find((x) => x._id === id || x.Name === l.name);
  plan.push({ kind: "new", name: l.name, id: hit?._id || id, exists: !!hit, items: l.items });
}
for (const l of CHANGED_LISTS) {
  const before = await listItemsStrict(l.id);
  const next = [...before, ...l.add.filter((x) => !before.includes(x))];
  plan.push({ kind: "changed", id: l.id, before, next, unchanged: next.length === before.length });
}
out.plan = plan;
if (!APPLY) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }

for (const p of plan.filter((x) => x.kind === "new")) {
  let id = p.id;
  if (!p.exists) {
    const c = await call("POST", `/flow/2/${A}/list/?${Q}`, { Name: p.name, Description: `CIQ option set: ${p.name.replace(/^CIQ /, "")}.` });
    out.created.push({ name: p.name, status: c.status, id: c.body?._id, listStatus: c.body?.Status, err: c.status >= 300 ? JSON.stringify(c.body).slice(0, 300) : undefined });
    save("lists-result.json", out);
    if (c.status >= 300 || !c.body?._id) { console.error(`create ${p.name} failed; stopping`); console.log(JSON.stringify(out, null, 1)); process.exit(1); }
    id = c.body._id;
    await sleep(500);
  }
  const cur = p.exists ? await listItemsStrict(id) : [];
  if (JSON.stringify(cur) !== JSON.stringify(p.items)) {
    if (cur.length && !cur.every((x) => p.items.includes(x))) { out.replaced.push({ id, skipped: "existing list holds values outside the plan; not replaced", cur }); continue; }
    const r = await call("POST", `/flow/2/${A}/list/${id}/items`, { ListItems: p.items });
    out.replaced.push({ id, status: r.status, items: p.items.length, err: r.status >= 300 ? JSON.stringify(r.body).slice(0, 300) : undefined });
    save("lists-result.json", out);
    if (r.status >= 300) { console.error(`items ${id} failed; stopping`); process.exit(1); }
  }
  const back = await listItemsStrict(id);
  out.readBack[id] = { items: back, match: JSON.stringify(back) === JSON.stringify(p.items) };
}
for (const p of plan.filter((x) => x.kind === "changed")) {
  if (!p.unchanged) {
    const r = await call("POST", `/flow/2/${A}/list/${p.id}/items`, { ListItems: p.next });
    out.replaced.push({ id: p.id, status: r.status, items: p.next.length, added: p.next.filter((x) => !p.before.includes(x)), err: r.status >= 300 ? JSON.stringify(r.body).slice(0, 300) : undefined });
    save("lists-result.json", out);
    if (r.status >= 300) { console.error(`items ${p.id} failed; stopping`); process.exit(1); }
  }
  const back = await listItemsStrict(p.id);
  out.readBack[p.id] = { items: back, match: JSON.stringify(back) === JSON.stringify(p.next), oldValuesKept: p.before.every((x) => back.includes(x)) };
}
const after = await appLists();
out.appListsAfter = after.filter((x) => plan.some((p) => p.id === x._id)).map((x) => `${x._id} | ${x.Name} | ${x.Status}`);
out.ok = Object.values(out.readBack).every((x) => x.match) && out.appListsAfter.length === plan.length;
save("lists-result.json", out);
console.log(JSON.stringify(out, null, 1));
