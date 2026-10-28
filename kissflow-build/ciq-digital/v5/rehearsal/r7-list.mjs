// R7: list replace on CIQ_ZZ_Spike_Decision_A00, keeping the old values (POST …/items REPLACES the whole set).
//   node r7-list.mjs            dry run: read the live items, print the new set
//   node r7-list.mjs --apply    write, read back, then prove the new value on an item (create stores it) and an old value still reads
import { w, CASE, L_DEC, adminGet, createItem, save, exists, sleep, listItemsStrict } from "./lib.mjs";
const APPLY = process.argv.includes("--apply");
const ADD = ["Needs info"];
const out = { rehearsal: "R7", list: L_DEC, at: new Date().toISOString(), apply: APPLY };
const before = await listItemsStrict(L_DEC); // aborts unless 200 + JSON string array
out.before = before;
out.next = [...before, ...ADD.filter((x) => !before.includes(x))];
if (!APPLY) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
if (exists("R7-result.json")) { console.error("R7 already applied"); process.exit(1); }
const put = await w.putListItems(L_DEC, out.next);
out.write = { status: put.status, body: put.status >= 300 ? JSON.stringify(put.body).slice(0, 300) : undefined };
save("R7-result.json", out);
await sleep(1000);
out.readBack = await listItemsStrict(L_DEC);
out.match = JSON.stringify(out.readBack) === JSON.stringify(out.next);
// the new value on an item: a Select silently drops a value that is not in its list (master §3.8), so a stored value proves the list
const c = await createItem(CASE, { Flag_A: "No", Flag_B: "No", Flag_C: "No", Flag_D: "No", Flag_E: "No", Flag_F: "No", Spike_Decision: "Needs info" });
await sleep(1000);
const g = await adminGet(CASE, c.body?._id);
out.newValueItem = { item: c.body?._id, create: c.status, stored: g.Spike_Decision ?? null };
// control: a value that is NOT in the list
const x = await createItem(CASE, { Flag_A: "No", Flag_B: "No", Flag_C: "No", Flag_D: "No", Flag_E: "No", Flag_F: "No", Spike_Decision: "Not in list" });
await sleep(1000);
const gx = await adminGet(CASE, x.body?._id);
out.controlNotInList = { item: x.body?._id, create: x.status, err: x.status >= 300 ? (x.body?.en_message || JSON.stringify(x.body).slice(0, 200)) : undefined, stored: gx.Spike_Decision ?? null };
// an old item with an old value still reads it
const old = await adminGet(CASE, "PkEKO9rhUVOf");
out.oldItem = { item: "PkEKO9rhUVOf", status: old._status, Spike_Decision: old.Spike_Decision ?? null };
save("R7-result.json", out);
console.log(JSON.stringify(out, null, 1));
