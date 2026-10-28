// H-19 (every hour) and H-20 (on request): reminders rem-1/2/3/5 and escalations from the Reminders configuration row
// (A-30), with the prototype's own idempotency keys (reminders.ts, C-21). The outbox keys that already exist are fed
// into the world, so a reminder is never sent twice, whatever the run frequency.

import { FLOW } from "../ids.mjs";
import { D, runAction, caseIn, readLedger } from "../engine.mjs";
import { reconcile } from "../reconcile.mjs";
import { loadCase, worldFor } from "./common.mjs";

export async function runRemindersFor(ctx, { now, keyPrefix = "rem", caseCodes } = {}) {
  const mailKeys = await ctx.index(FLOW.outbox, "Mail_Key");
  let sent = 0;
  for (const row of ctx.caseRows) {
    if (caseCodes && !caseCodes.includes(row.Case_Code)) continue;
    const phase = readLedger(row).core.phase;
    if (phase === "completed" || phase === "cancelled") continue;
    const cs = await loadCase(ctx, row.Case_Code);
    const keys = [...mailKeys].filter((k) => k.startsWith("rem-"));
    const world = worldFor(ctx, [cs.before], { mailKeys: keys });
    const r = runAction(world, cs.before.id, (w) => D.runReminders(w, now, "system"));
    if (r.refused || !r.newMails.length) continue;
    const after = caseIn(r.state, cs.before.id);
    const res = await reconcile(ctx, cs, after, { newMails: r.newMails }, { triggerKey: `${keyPrefix}:${now.slice(0, 13)}`, at: now });
    sent += res.report.mails;
  }
  return sent;
}
