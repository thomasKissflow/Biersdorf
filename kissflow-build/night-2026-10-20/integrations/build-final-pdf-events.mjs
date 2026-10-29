// 29 Oct (Thomas): the final PDF by events, the two app integrations Thomas made as skeletons.
//  I1 CIQ_Case_Item_exits_final_step_fin_A00: trigger -> "When an item completes its workflow" (ItemCompleted) on CIQ Case
//     (Thomas: any completion, the script checks the release itself). Its HTTP POST step is left for Thomas: he builds it in
//     the builder with the web app URL and the token in the JSON body, so neither passes through here or the repo.
//  I2 CIQ_Case_Send_Final_Release_to_RMM_A00: webhook {caseItemId, caseCode, seal} -> Search the case -> Get user data
//     (the RMM role, as Thomas set it) -> "RMM mail text" (Run JavaScript: picks the case, needs its Final PDF, joins the
//     members' e-mails) -> Send an email (To/Subject/Body from the script, Attachments = the case's Final PDF).
// The search, script and mail entities are cloned from CIQP Request changed to case's proven steps (RC, 27 Oct).
// Backups go to the scratch folder given in BACKUP_DIR, never the repo (I1 will hold a URL and a token in prod).
//   node build-final-pdf-events.mjs           dry run: prints the planned blobs' summary
//   node build-final-pdf-events.mjs --apply   backup, PUT, read back, publish (both stay OFF)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { call, A, getDraft, putDraft, publish, summary } from "./integ-lib.mjs";

const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = process.env.BACKUP_DIR;
if (APPLY && !BACKUP_DIR) throw new Error("set BACKUP_DIR to a folder outside the repo");
if (A !== "AcDOSunMEpSA") throw new Error("not the dev sandbox");
const I1 = "CIQ_Case_Item_exits_final_step_fin_A00", I2 = "CIQ_Case_Send_Final_Release_to_RMM_A00";
const RC = JSON.parse(readFileSync(new URL("./backups/CIQP_Request_changed_to_case_A00.before-code-Action_KHpGiW5Wym.2026-10-27T12-01-57-414Z.json", import.meta.url)));
const APP_CONN = { _id: "CnEPk_z1eYLu", Name: "Kissflow Process - Thomas Access Keys - Trigger" };
let n = 0;
const nid = (p) => `${p}_fp${Date.now().toString(36).slice(-4)}${(++n).toString(36)}`;

/** Copies an RC action's FieldMappings (and their Properties and child mappings) onto `dstId`; `fix(name, prop)` rewrites a Property. */
function cloneMappings(dst, srcId, dstId, fix) {
  const drop = (fmId) => { const f = dst[fmId]; if (!f) return; (f["FieldMapping::FieldMapping"] || []).forEach(drop); (f["FieldMapping::Property"] || []).forEach((p) => { (dst[p]?.["Property::Reference"] || []).forEach((r) => delete dst[r]); delete dst[p]; }); delete dst[fmId]; };
  (dst[dstId]["Action::FieldMapping"] || []).forEach(drop);
  const copy = (fmId, parent) => {
    const f = RC[fmId], id = nid("FieldMapping");
    const out = { ...f, Id: id };
    if (parent) out.FieldMapping = parent; else out.Action = dstId;
    delete out["FieldMapping::FieldMapping"]; delete out["FieldMapping::Property"];
    dst[id] = out;
    const props = (f["FieldMapping::Property"] || []).map((p) => {
      const pid = nid("Property"), pr = { ...RC[p], Id: pid, FieldMapping: id };
      delete pr["Property::Reference"];
      const fixed = fix(f.Name, pr, parent ? RC[parent]?.Name : undefined);
      if (fixed === null) return null;
      dst[pid] = fixed;
      return pid;
    }).filter(Boolean);
    if (props.length) out["FieldMapping::Property"] = props;
    const kids = (f["FieldMapping::FieldMapping"] || []).map((k) => copy(k, id));
    if (kids.length) out["FieldMapping::FieldMapping"] = kids;
    return id;
  };
  dst[dstId]["Action::FieldMapping"] = (RC[srcId]["Action::FieldMapping"] || []).map((x) => copy(x, undefined));
}

const MAIL_CODE = `// RMM mail text (final PDF by events, 29 Oct): the case the script named, its Final PDF, the RMM role's e-mails.
const rows = Array.isArray(inputData.rows) ? inputData.rows : [];
const kase = rows.find(function (r) { return r && r._id === inputData.caseId; });
if (!kase) throw new Error("case " + inputData.caseId + " not found");
const pdf = Array.isArray(kase.Final_PDF) ? kase.Final_PDF : [];
// no throw without a PDF: the step tests in prod run before the first filing; a real run comes only after the attach
const users = Array.isArray(inputData.users) ? inputData.users : [];
const to = users.map(function (u) { return u && u.Email; }).filter(function (e, i, all) { return typeof e === "string" && e.indexOf("@") > 0 && all.indexOf(e) === i; });
if (!to.length) throw new Error("the RMM role has no member with an e-mail address");
const code = kase.Case_Code || "";
const material = kase.Trade_Name ? " (" + kase.Trade_Name + ")" : "";
return {
  To: to.join(","),
  Subject: code + ": final document ready",
  Body: "The final document of CIQ case " + code + material + (pdf.length ? " is attached." : " is not attached: the case has no Final PDF yet.") + "\\n\\n" +
    "It was created automatically at the supplier's final release and filed on the case. It cannot be changed.\\n\\n" +
    "Open the case in the CIQ app to see it.",
  CaseCode: code,
  Files: pdf.length
};`;

// ---- I1: the trigger ----
const b1 = await getDraft(I1);
const t1 = b1[b1[b1.Root]["Integration::Trigger"][0]];
const plan1 = structuredClone(b1);
{
  const t = plan1[t1.Id];
  t.Name = "When an item completes its workflow";
  t.Connector = { ...t.Connector, TriggerId: "ItemCompleted", TriggerName: "When an item completes its workflow" };
  delete t.Output; t.IsTested = false;
  for (const fm of [...(t["Trigger::FieldMapping"] || [])]) {
    if (plan1[fm]?.Name !== "step_id") continue;
    for (const p of plan1[fm]["FieldMapping::Property"] || []) { for (const r of plan1[p]?.["Property::Reference"] || []) delete plan1[r]; delete plan1[p]; }
    delete plan1[fm];
    t["Trigger::FieldMapping"] = t["Trigger::FieldMapping"].filter((x) => x !== fm);
  }
}

// ---- I2: search, script, mail ----
const b2 = await getDraft(I2);
const r2 = b2[b2.Root];
const [SEARCH, USERS, MAIL] = r2["Integration::Action"];
if (b2[SEARCH]?.Connector?.Name !== "Kissflow Process" || b2[USERS]?.Connector?.Name !== "User details" || b2[MAIL]?.Connector?.Name !== "Email") throw new Error("I2's steps are not Search / Get user data / Send an email: changed by someone, stop");
const TRIG2 = r2["Integration::Trigger"][0];
const plan2 = structuredClone(b2);
plan2[SEARCH] = { ...plan2[SEARCH], Name: "Find the case", Type: "Search", IsInternalAuth: false, Connection: APP_CONN, Connector: { ...RC.Action_RC_1_request.Connector } };
delete plan2[SEARCH].Output; plan2[SEARCH].IsTested = false;
cloneMappings(plan2, "Action_RC_1_request", SEARCH, (name, pr) => {
  if (name === "process_id") return { ...pr, Value: ["CIQ_Case_A00"] };
  if (name === "lookupValue") return { ...pr, Type: "Field", Field: `context.${TRIG2}.caseItemId` };
  return pr;
});
for (const k of Object.keys(plan2)) {
  const f = plan2[k];
  if (f?.Kind === "FieldMapping" && f.Action === SEARCH && f.Name === "process_id") f.SelectedDropdown = [{ FieldId: "CIQ_Case_A00", FieldName: "CIQ Case", IsSubArray: false }];
}
const JS = "Action_FP_rmm_mail";
plan2[JS] = { ...RC.Action_KHpGiW5Wym, Id: JS, Name: "RMM mail text", Integration: b2.Root };
delete plan2[JS].Output; plan2[JS].IsTested = false;
cloneMappings(plan2, "Action_KHpGiW5Wym", JS, (name, pr, parentName) => {
  if (name === "js_code") return { ...pr, Code: MAIL_CODE };
  return pr;
});
// the script's inputs: replace RC's children with caseId / rows / users
{
  const parent = plan2[JS]["Action::FieldMapping"].find((x) => plan2[x]?.Name === "input_fields");
  for (const c of plan2[parent]["FieldMapping::FieldMapping"] || []) { for (const p of plan2[c]?.["FieldMapping::Property"] || []) delete plan2[p]; delete plan2[c]; }
  plan2[parent]["FieldMapping::FieldMapping"] = Object.entries({ caseId: `context.${TRIG2}.caseItemId`, rows: `context.${SEARCH}.Data`, users: `context.${USERS}.Users` }).map(([name, field]) => {
    const fm = nid("FieldMapping"), pr = nid("Property");
    plan2[fm] = { Id: fm, Kind: "FieldMapping", Type: "String", IsVisible: true, FieldMapping: parent, Name: name, Label: name, "FieldMapping::Property": [pr] };
    plan2[pr] = { Id: pr, Kind: "Property", FieldMapping: fm, Type: "Field", Field: field, Name: name };
    return fm;
  });
}
plan2[MAIL] = { ...plan2[MAIL], Name: "Send the final PDF to the RMMs", Type: "Create", IsInternalAuth: true, Connection: {}, Connector: { ...RC.Action_SZh4L9rG9N.Connector } };
delete plan2[MAIL].Output; plan2[MAIL].IsTested = false;
cloneMappings(plan2, "Action_SZh4L9rG9N", MAIL, (name, pr) => {
  if (pr.Type === "Field" && /Action_KHpGiW5Wym/.test(pr.Field || "")) return { ...pr, Field: pr.Field.replace("Action_KHpGiW5Wym", JS) };
  return pr;
});
{
  const att = plan2[MAIL]["Action::FieldMapping"].find((x) => plan2[x]?.Name === "Attachments");
  const pr = nid("Property");
  plan2[pr] = { Id: pr, Kind: "Property", FieldMapping: att, Type: "Field", Field: `context.${SEARCH}.Data.Final_PDF`, Name: "Attachments" };
  plan2[att]["FieldMapping::Property"] = [pr];
}
plan2[b2.Root]["Integration::Action"] = [SEARCH, USERS, JS, MAIL];

for (const [id, before, after] of [[I1, b1, plan1], [I2, b2, plan2]]) {
  console.log(`== ${id} (planned)`);
  for (const e of summary(after).ents) console.log("  ", e.kind, e.id, e.entity, e.conn || "", e.props.map((p) => p.replace(/https?:\/\/\S+/g, "<url>")).join(" | ").slice(0, 300));
}
if (!APPLY) { console.log("dry run: nothing written"); process.exit(0); }

mkdirSync(BACKUP_DIR, { recursive: true });
for (const [id, before, after] of [[I1, b1, plan1], [I2, b2, plan2]]) {
  const now = await getDraft(id);
  if (JSON.stringify(now) !== JSON.stringify(before)) throw new Error(`${id} changed during the run: stop`);
  writeFileSync(`${BACKUP_DIR}/${id}.before-final-pdf-events.json`, JSON.stringify(now));
  const put = await putDraft(id, after);
  console.log(id, "PUT", put.status, put.status >= 300 ? JSON.stringify(put.body).slice(0, 400) : "");
  if (put.status >= 300) process.exit(1);
  const back = await getDraft(id);
  console.log("  read back:", JSON.stringify(summary(back).ents.map((e) => [e.id, e.entity, e.props.length])));
  const pub = await publish(id);
  console.log("  publish", pub.status, pub.status >= 300 ? JSON.stringify(pub.body).slice(0, 400) : "");
}
