// Which read returns child-table rows? (GETs only; the form list is a POST read)
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00", REG = "CIQ_ZZ_Spike_Register_A00", item = "PkEKIWtnoX7B";
for (const p of [`/form/2/${A}/${REG}/${item}?${Q}`, `/form/2/${A}/${REG}/${item}?_response_type=full&${Q}`]) {
  const r = await w.call("GET", p); console.log(r.status, p.replace(A, "{acc}"), JSON.stringify(r.body).slice(0, 400));
}
