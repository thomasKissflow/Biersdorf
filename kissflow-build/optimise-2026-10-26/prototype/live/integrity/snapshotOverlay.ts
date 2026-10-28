// OFFLINE ONLY: the fields the flows gained after the read-only snapshot of 21 Oct 02:29 IST (drafts.ts SNAPSHOT_DIR) that
// the code already reads or writes, so that offline S-INTEGRITY's names steps compare the code with the flows as built
// now, not as at 02:29. Each entry is one field, explicit: its flow, id and type, the field it was modelled on (its model
// and, on every step, its permission: as the script that added it copied them) and where it comes from. It only adds,
// and only what the snapshot lacks: an entry whose field the snapshot already has (a newer snapshot: retire the entry),
// or whose model field it lacks, throws, so it can never hide a field the code names that a flow lost. Live, step 3
// reads the current draft of every flow changed after the snapshot and never applies this (it throws in a live process).
import type { FlowMeta } from "./drafts";

export interface AddedField {
  field: string;
  /** Its Kissflow type ("Text", "Email", …). */
  type: string;
  /** The field it was modelled on: the same model and, on every step, the same permission. */
  like: string;
  /** When, how and by whom it was added. */
  source: string;
}

const RELEASE_FIELDS =
  "added 21 Oct 09:59Z (15:29 IST) by the portal session's kissflow-build/night-2026-10-21/release-fields.mjs (REQ-PROC-042, Thomas approved 21 Oct; the draft before it: backups/CIQP_Request_A00-before-release-fields-2026-10-21T095948245Z.json); the portal's final release (src/portal/data/liveActions.ts) writes it";

const RAISER_EMAIL =
  "added 22 Oct 14:31 IST by the portal session (Text; Editable at \"Raise open point\", ReadOnly at every other step, as Raised_By_Name; agreed with the app session for the load-time redesign); the app's raise (src/app-live/write/encode.ts opStartFields) writes it, op.round copies it to the query";

const REVIEW_DEPTS =
  "added 22 Oct by the portal session (Text; Editable at \"Supplier: fill in the CIQ\", ReadOnly at every other step, as Completeness_By_Role; the load-time redesign's phase 2): the portal's completeness confirmation (src/portal/data/liveActions.ts) writes it, I-2 copies it to the case for E-A";

/** Flow id → the fields it gained after the snapshot. */
export const SNAPSHOT_OVERLAY: Readonly<Record<string, readonly AddedField[]>> = {
  // CIQP Request: who gave the final release, beside Release_By_Name (Editable at "Issue request", Mandatory at "Supplier:
  // give the final release", ReadOnly elsewhere)
  CIQP_Request_A00: [
    { field: "Release_By_Email", type: "Email", like: "Release_By_Name", source: RELEASE_FIELDS },
    { field: "Release_By_Role", type: "Text", like: "Release_By_Name", source: RELEASE_FIELDS },
    { field: "Review_Depts", type: "Text", like: "Completeness_By_Role", source: REVIEW_DEPTS },
  ],
  // CIQ Open Point: the raiser's e-mail, beside Raised_By_Name
  CIQ_Open_Point_A00: [{ field: "Raised_By_Email", type: "Text", like: "Raised_By_Name", source: RAISER_EMAIL }],
};

/** A flow's metadata as parsed from the snapshot (drafts.ts parseDraft) with the fields it gained since: a copy (`meta`
 *  itself is left as it is), or `meta` when the flow gained nothing. Throws on an entry that does not fit the snapshot. */
export function withOverlay(meta: FlowMeta, overlay = SNAPSHOT_OVERLAY): FlowMeta {
  if (process.env.LIVE === "1") throw new Error("snapshotOverlay.ts is offline only: live, S-INTEGRITY reads the flow's current draft.");
  const added = overlay[meta.flowId] ?? [];
  if (!added.length) return meta;
  const out: FlowMeta = { ...meta, fields: new Map(meta.fields), permissions: new Map([...meta.permissions].map(([a, p]) => [a, new Map(p)])) };
  for (const a of added) {
    if (meta.fields.has(a.field)) throw new Error(`snapshot overlay: ${meta.flowId} has ${a.field} in the snapshot already (a newer snapshot): retire the entry.`);
    const like = meta.fields.get(a.like);
    if (!like) throw new Error(`snapshot overlay: ${meta.flowId} has no ${a.like} in the snapshot (${a.field} is modelled on it).`);
    // the script set no Required on the field: the steps' permissions alone make it Mandatory
    out.fields.set(a.field, { type: a.type, model: like.model, required: false });
    for (const perms of out.permissions.values()) {
      const p = perms.get(a.like);
      if (p !== undefined) perms.set(a.field, p);
    }
  }
  return out;
}
