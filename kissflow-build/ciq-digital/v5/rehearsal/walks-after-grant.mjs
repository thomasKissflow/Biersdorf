// Runtime half of the rehearsal, to run ONLY after the ZZ test processes have an initiator grant again
// (the deleted spike roles A/B took their flow membership with them, so the key's Start submit now answers 403 050302).
//   node walks-after-grant.mjs            read-only: is the grant there? (GET members of both ZZ processes)
//   node walks-after-grant.mjs --run      walk new items + the drafts left by R1–R6 through the FINAL shapes → walks-result.json
import { readFileSync } from "node:fs";
import { w, A, Q, CASE, POINT, THOMAS, here, createItem, submit, adminGet, adminPut, assigneeUpdate, walk, pathText, sleep, save } from "./lib.mjs";
const RUN = process.argv.includes("--run");
const out = { at: new Date().toISOString() };
for (const p of [CASE, POINT]) {
  const m = await w.call("GET", `/flow/2/${A}/process/${p}/member?${Q}`);
  out[`members_${p}`] = (Array.isArray(m.body) ? m.body : []).map((x) => `${x.Name}:${x.Role}:${(x.Permission || []).join("+")}`);
}
console.log(JSON.stringify(out, null, 1));
if (!RUN) process.exit(0);
const stamp = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "");
const FLAGS_YES = { Flag_A: "Yes", Flag_B: "Yes", Flag_C: "Yes", Flag_D: "Yes", Flag_E: "Yes", Flag_F: "Yes" };

// 1. A NEW Case item on the final shape (R1 fields, R2 rename, R3 owner, R4 + R5 removals), every lane flag Yes.
{
  const c = await createItem(CASE, { ...FLAGS_YES, Spike_V5_Note: "walk: at create" });
  const item = c.body?._id, act = c.body?._activity_instance_id; const o = { item, create: c.status };
  const u = await assigneeUpdate(CASE, item, act, { Spike_V5_Note: "walk: updated at Start" }); o.startUpdate = u.status;
  const s = await submit(CASE, item, act); o.submitStart = s.status; o.submitStartErr = s.status >= 300 ? s.body?.en_message : undefined;
  if (s.status < 300) {
    o.path = await walk(CASE, item, { before: async (rec, it) => {
      if (rec.step !== "Spike prepare") return {};
      const p = await adminPut(CASE, it._id, { Spike_V5_Phase: "Yes" }); await sleep(800);
      return { adminPutPhase: p.status, phaseReadBack: (await adminGet(CASE, it._id)).Spike_V5_Phase ?? null };
    } });
    o.pathText = pathText("Create spike case", o.path);
    o.expected = "Create spike case → Spike prepare[AppRole:Admin / Developer] → Spike hold check[AppRole:CIQ Integration Service] → Spike gate check[AppRole:Admin / Developer] → Completed";
    o.pass = o.pathText === o.expected;
  }
  out.newCase = o;
}
// 2. Drafts created during the rehearsal on OLDER definitions: does their Start submit follow the version they were
//    created on (_meta_version at create) or the current one? Start activity ids come from the create responses in
//    requests.jsonl (a Draft's admin GET carries no activity instance id; later steps use the admin GET context).
{
  const startAct = {};
  for (const line of readFileSync(here("./requests.jsonl"), "utf8").split("\n").filter(Boolean)) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    const res = typeof e.res === "string" ? (() => { try { return JSON.parse(e.res); } catch { return {}; } })() : e.res;
    if (e.method === "POST" && e.path?.startsWith(`/process/2/${A}/${CASE}?`) && res?._id) startAct[res._id] = { act: res._activity_instance_id, meta: res._meta_version, req: e.req };
  }
  out.oldDrafts = [];
  for (const [id, info] of Object.entries(startAct)) {
    const g = await adminGet(CASE, id);
    if (g._status !== "Draft") continue;
    const s = await submit(CASE, id, info.act);
    const o = { item: id, createdOnMeta: info.meta, flagsYes: Object.values(info.req || {}).filter((v) => v === "Yes").length, submitStart: s.status };
    if (s.status < 300) { o.path = await walk(CASE, id); o.pathText = pathText("Create spike case", o.path); }
    out.oldDrafts.push(o);
  }
}
// 3. Point: field-assigned "Spike review" (S-11)
{
  const c = await createItem(POINT, { To_Supplier: "No", Question_Text: `ZZT v5 walk ${stamp}`, Round_No: 1, Spike_Assignee: [{ _id: THOMAS }] });
  const item = c.body?._id; const o = { item, create: c.status };
  const s = await submit(POINT, item, c.body?._activity_instance_id); o.submitStart = s.status; o.submitStartErr = s.status >= 300 ? s.body?.en_message : undefined;
  if (s.status < 300) {
    await sleep(1500); const g = await adminGet(POINT, item);
    o.atReview = { step: g._current_step, assignedTo: g._current_assigned_to };
    o.assignedToUser = (g._current_assigned_to || []).some((x) => x.Kind === "User" && x._id === THOMAS) && !(g._current_assigned_to || []).some((x) => x.Kind === "AppRole");
    o.path = await walk(POINT, item); o.pathText = pathText("Raise spike point", o.path);
  }
  const e = await createItem(POINT, { To_Supplier: "No", Question_Text: `ZZT v5 walk empty-assignee ${stamp}`, Round_No: 1 });
  const es = await submit(POINT, e.body?._id, e.body?._activity_instance_id);
  o.emptyAssigneeControl = { item: e.body?._id, submitStart: es.status, err: es.body?.en_message || null };
  out.point = o;
}
save("walks-result.json", out);
console.log(JSON.stringify(out, null, 1));
