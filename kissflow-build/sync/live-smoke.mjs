// Live smoke of the service plumbing (15 Oct), no supplier contacts involved:
//   1. create one CIQ Service Request row (as the key's user) with an unknown Request_Code on a ZZT case code;
//   2. the caller then runs `CIQ_SYNC_LIVE=1 node kissflow-build/sync/run.mjs --once`;
//   3. `--check` reads it back: Request_Status Refused + Result_Note, and an audit row "Refused" written by the service;
//   4. `--cleanup` deletes the request row and the audit rows of that case code (only ZZT-SMOKE-*), verifies they're gone.
//   node kissflow-build/sync/live-smoke.mjs --create | --check | --cleanup
import { client } from "../lib/kf.mjs";
import { createPort, isDeferral } from "./kissflow.mjs";
import { FLOW } from "./ids.mjs";

const CODE = "ZZT-SMOKE-0001";
const KEY = `ZZT-SMOKE-0001:unknown-code:${process.env.SMOKE_N || 1}`;
const kf = client({ readOnly: false });
const port = createPort({ kf, log: () => {} });
const mode = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  if (mode === "--create") {
    const rows = await port.listForm(FLOW.serviceRequest);
    if (rows.some((r) => r.Request_Key === KEY)) { console.log("exists already"); process.exit(0); }
    const back = await port.createFormRow(FLOW.serviceRequest, { Request_Key: KEY, Request_Code: "zzt.unknown-code", Case_Code: CODE, Object_Key: CODE, Payload_JSON: JSON.stringify({ smoke: true }) });
    console.log(`created ${back?._id}: code ${back?.Request_Code}, status "${back?.Request_Status ?? ""}"`);
  }
  if (mode === "--check") {
    const r = (await port.listForm(FLOW.serviceRequest)).find((x) => x.Request_Key === KEY);
    const audit = (await port.listForm(FLOW.audit)).filter((x) => x.Case_Code === CODE);
    console.log(JSON.stringify({ request: r ? { status: r.Request_Status, note: r.Result_Note, processedAt: r.Processed_At, attempt: r.Attempt_No } : null, audit: audit.map((a) => ({ key: a.Event_Key, category: a.Event_Category, action: a.Action_Code, actor: a.Actor_Name, reason: a.Event_Reason ?? a.New_Value_Text })) }, null, 1));
  }
  if (mode === "--cleanup") {
    const r = (await port.listForm(FLOW.serviceRequest)).filter((x) => String(x.Request_Key).startsWith("ZZT-SMOKE-0001:"));
    const audit = (await port.listForm(FLOW.audit)).filter((x) => x.Case_Code === CODE && String(x.Case_Code).startsWith("ZZT-SMOKE-"));
    for (const [form, row] of [...r.map((x) => [FLOW.serviceRequest, x]), ...audit.map((x) => [FLOW.audit, x])]) {
      await sleep(1000);
      const d = await kf.call("DELETE", `/form/2/${kf.acc}/${form}/${row._id}?_application_id=CIQ_Digital_A00`, undefined, { retries: 0 });
      console.log(`delete ${form} ${row._id} → ${d.status}`);
    }
    await sleep(1000);
    const left = (await port.listForm(FLOW.serviceRequest)).filter((x) => String(x.Request_Key).startsWith("ZZT-SMOKE-0001:")).length + (await port.listForm(FLOW.audit)).filter((x) => x.Case_Code === CODE).length;
    console.log(`left after cleanup: ${left}`);
  }
} catch (e) {
  console.error(isDeferral(e) ? "Stopped: rate limit / challenge. Try later." : `Error: ${e.message}`);
  process.exit(1);
}
