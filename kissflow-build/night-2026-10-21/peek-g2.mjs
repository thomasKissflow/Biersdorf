// The live portal hand-off check (22 Oct): reads ZZT-NT-G2's case and request (admin GET, paced and windowed by lib.mjs)
// and prints only revision numbers, times, steps and hashes of the answers, never their content
import { createHash } from "node:crypto";
import { procGet, APP, PORTAL } from "./lib.mjs";
const h = (v) => (v == null ? null : createHash("sha256").update(String(v)).digest("hex").slice(0, 12));
const [c, r] = [await procGet("CIQ_Case_A00", APP, "PkEPFTpqmiR5"), await procGet("CIQP_Request_A00", PORTAL, "PkEPFU4Y3R_p")];
const view = (x) => x && { step: x._current_step, status: x._status, rev: x.Answers_Rev, changedAt: x.Answers_Changed_At, answers: h(x.Answers_JSON), docs: h(x.Documents_JSON), modified: x._modified_at };
console.log(JSON.stringify({ at: new Date().toISOString(), case: view(c), request: view(r), requestCase: r?.App_Case_Item_Id, assigned: r?._current_assigned_to?.map?.((u) => u._id ?? u) }, null, 1));
