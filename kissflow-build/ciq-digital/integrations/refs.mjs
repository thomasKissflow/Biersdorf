// Read-only: References in each of the app session's integration drafts, and any whose owning step no longer exists.
import { getDraft, load } from "./integ-lib.mjs";
const s = load();
for (const [k, st] of Object.entries(s.integrations)) {
  if (!st.id) continue;
  const b = await getDraft(st.id);
  const refs = Object.values(b).filter((v) => v?.Kind === "Reference");
  const dead = refs.filter((r) => (r.Action && !b[r.Action]) || (r.StepId && !b[r.StepId]) || (r.Property && !b[r.Property]));
  console.log(k, st.id, "references", refs.length, "dead", dead.length, dead.map((r) => r.Id).join(","));
}
