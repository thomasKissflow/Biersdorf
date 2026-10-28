// 22 Oct: E-B's trigger sample from a real event: completes the fixture's RMM review, then (trigger test listening)
// its SUS review; stores the received sample as the trigger's Output + IsTested, as the builder does.
import { stepSubmit, search, REV } from "./run.mjs";
import { APP, call, A, procGet } from "./lib.mjs";
import { getDraft, putDraft } from "../night-2026-10-20/integrations/integ-lib.mjs";
const caseId = "PkEPlkxw_QBh", EB = "CIQ_Review_completed_final_release_A00";
const revs = (await search(REV, APP, caseId)).filter((r) => r.Case_Item_Id === caseId);
const rmm = revs.find((r) => r.Review_Dept === "RMM"), sus = revs.find((r) => r.Review_Dept === "SUS");
console.log("reviews:", revs.map((r) => `${r.Review_Dept} ${r._id} ${r._status}`).join(" | "));
if (rmm?._status !== "Completed") console.log("RMM submit", (await stepSubmit(REV, APP, rmm._id)).status);
const d = await getDraft(EB), T = (d[d.Root]["Integration::Trigger"] || [])[0];
const listening = call("POST", `/integration/2/${A}/${EB}/trigger/${T}/test?_application_id=${APP}`, {});
await new Promise((r) => setTimeout(r, 6000));
console.log("SUS submit", (await stepSubmit(REV, APP, sus._id)).status);
const t = await listening;
console.log("trigger test", t.status, JSON.stringify(t.body).replace(/[A-Za-z0-9_-]{40,}/g, "<x>").slice(0, 300));
const after = await procGet(REV, APP, sus._id);
console.log("SUS now", after?._status);
if (t.status < 300 && t.body && t.body.status !== "error" && JSON.stringify(t.body).includes(sus._id)) {
  const b = await getDraft(EB); b[T] = { ...b[T], Output: t.body, IsTested: true };
  console.log("sample stored", (await putDraft(EB, b)).status);
} else console.log("NOT captured: the trigger test did not return this review");
