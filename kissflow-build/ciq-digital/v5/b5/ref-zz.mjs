// READ-ONLY: the live draft of the proven ZZ integration "register created" (Dataform ItemCreated → Dataform action) and
// the Z1 shell, as the reference shapes for B5.
import { writeFileSync } from "node:fs";
import { client } from "../../../lib/kf.mjs";
const kf = client({ readOnly: true });
for (const id of ["CIQ_ZZ_Spike_log_register_created_A00", "CIQ_Z1_Case_completed_PDF_e_mails__A00"]) {
  await new Promise((r) => setTimeout(r, 1200));
  const r = await kf.get(`/metadata/2/${kf.acc}/integration/${id}/draft`);
  if (r.status !== 200 || typeof r.body !== "object") throw new Error(`STOP: ${id} ${r.status}`);
  writeFileSync(new URL(`./ref-${id}.draft.json`, import.meta.url), JSON.stringify(r.body, null, 1));
  console.log(id, r.status, Object.keys(r.body).length);
}
