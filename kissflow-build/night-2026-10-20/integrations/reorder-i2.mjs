// 25 Oct (Thomas chose "Move bulk step last"): in a real run Kissflow's "Create and submit items in bulk" creates the
// reviews but then times out polling (150 s, KISSFLOW_ERROR_10277) and stops I-2. So the bulk step goes last: the
// history row and the move into review run first. Only the step order changes. Backs up, PUTs, reads back, publishes.
import { call, A, backup, getDraft, putDraft, publish } from "./integ-lib.mjs";
const ID = "CIQP_Completeness_confirmed_to_cas_A00", BULK = "Action_DAgm0TLRIy", APP = "CIQ_Supplier_Portal_A00";
const b = await getDraft(ID), root = b.Root, acts = b[root]["Integration::Action"];
backup(ID, b, "before-reorder-bulk-last");
b[root]["Integration::Action"] = [...acts.filter((x) => x !== BULK), BULK];
const put = await putDraft(ID, b);
console.log("PUT", put.status, put.status >= 300 ? JSON.stringify(put.body).slice(0, 300) : "");
const back = await getDraft(ID), order = back[back.Root]["Integration::Action"];
console.log("order now:", order.map((x) => back[x]?.Name).join(" · "));
if (order[order.length - 1] !== BULK || order.length !== acts.length) throw new Error("read-back order is wrong: not publishing");
const p = await publish(ID);
console.log("publish", p?.status ?? JSON.stringify(p).slice(0, 120));
const act = await call("PUT", `/flow/2/${A}/integration/${ID}/activate?_application_id=${APP}`, {});
console.log("activate", act.status, JSON.stringify(act.body).slice(0, 120));
