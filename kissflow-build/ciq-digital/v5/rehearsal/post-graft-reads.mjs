// Read-only: older in-progress items after the R5/R6 grafts (do they still read; did their assignee change?).
import { CASE, POINT, adminGet, save } from "./lib.mjs";
const out = { at: new Date().toISOString() };
for (const [p, id] of [[CASE, "PkEKO4Ijeqy3"], [POINT, "PkEKOEvnYp7X"], [POINT, "PkEKIVxRRM9x"]]) {
  const s = await adminGet(p, id);
  out[id] = { status: s._status, step: s._current_step, assigned: s._current_assigned_to, activity: s._current_context?.[0]?._context_activity_id };
}
save("post-graft-reads.json", out); console.log(JSON.stringify(out, null, 1));
