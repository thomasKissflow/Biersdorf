// H-17: new CIQ Internal Note rows with mentions → C-20 to every mentioned active internal user except the writer
// (B-37). The author is the row's platform `_created_by`. Mentions are found by the prototype (mentions.ts) in the
// note text; Note_Mentions_Emails written by the Workbench add anyone the text parse missed (active internal only).
// New notes are found by id: the cursor keeps the ids already seen (host storage). A Form list row carries only _id +
// business fields (live, 15 Oct), so each unseen note is read in full (GET) for its platform _created_by/_created_at.
// A lost cursor only means a replay, which the outbox keys make harmless.
// A note is a Workbench input: a Note_Mentions_Emails address that an internal user shares with a supplier contact
// (dev) means the internal user (byEmail "internal"); a supplier contact is never mentioned.

import { FLOW } from "../ids.mjs";
import { D, runAction, caseIn } from "../engine.mjs";
import { reconcile } from "../reconcile.mjs";
import { loadCase, worldFor, writeAudit } from "./common.mjs";

export async function processNotes(ctx, cursor = { seen: [] }, { caseCode } = {}) {
  const seen = new Set(cursor.seen ?? cursor.ids ?? []);
  // `caseCode` (runOnce caseOnly): only that case's notes are read; the others stay unseen for a normal pass.
  const unseen = (await ctx.port.listForm(FLOW.note)).filter((r) => !seen.has(r._id) && (!caseCode || r.Case_Code === caseCode));
  const rows = [];
  for (const listed of unseen) rows.push((await ctx.port.getFormRow(FLOW.note, listed._id)) ?? listed);
  rows.sort((a, b) => String(a._created_at ?? "").localeCompare(String(b._created_at ?? "")));
  let n = 0;
  for (const note of rows) {
    const by = note._created_by?._id;
    const cs = note.Case_Code ? await loadCase(ctx, note.Case_Code) : null;
    if (cs && by) {
      const key = `note:${note._id}`;
      const sectionId = /section/i.test(note.Linked_Kind ?? "") ? note.Linked_Key : undefined;
      const project = { [by]: ctx.directory.deptsOf(by).includes(note.Note_Dept) ? note.Note_Dept : ctx.directory.deptsOf(by)[0] };
      const world = worldFor(ctx, [cs.before], { project });
      const r = runAction(world, cs.before.id, (w) => {
        let s = D.A.addInternalNote(w, by, cs.before.id, note.Note_Text ?? "", sectionId, note._created_at ?? ctx.now());
        if (D.wasRefused(w, s)) return s;
        // people the Workbench recorded but the text parse did not find (active internal users only, never the writer)
        const c = caseIn(s, cs.before.id);
        const added = c.internalNotes.at(-1);
        const listed = String(note.Note_Mentions_Emails ?? "").split(/[,;\s]+/).filter(Boolean).map((e) => ctx.directory.byEmail(e, "internal")?.id).filter((id) => id && !added.mentions.includes(id));
        if (listed.length) s = D.noteMentionMails(s, c, { ...added, mentions: listed }, note._created_at ?? ctx.now());
        return s;
      });
      if (r.refused) await writeAudit(ctx, [{ at: note._created_at, by, action: "Internal note not mailed", detail: r.refusal }], { key: `${key}#refused`, caseCode: cs.before.id, category: "Internal note", project });
      else if (r.newMails.length || r.newAudit.length) {
        const after = caseIn(r.state, cs.before.id);
        await reconcile(ctx, cs, { ...after, internalNotes: [] }, r, { triggerKey: key, actorId: by, at: note._created_at, project });
      }
      n++;
    }
    seen.add(note._id);
  }
  return { processed: n, cursor: { seen: [...seen] } };
}
