// TESTS ONLY. E-A (22 Oct) played on the fake Kissflow: what I-2's steps "I2 plan reviews" and the bulk create leave
// (kissflow-build/night-2026-10-20/integrations/scripts/i2-plan-reviews.js): the case's missing round-1 reviews, RMM's
// own plus each department named, with the script's fields (no Assignee_*: the bulk create refuses a blank user), each
// started at its department's step; and the ONE case-level review.started row with every track. The integration's
// connection creates them, so no app user is their creator.
import type { ReviewDept } from "@/domain/types";
import { str, type RawItem } from "@/portal/data/raw";
import { LIST, STEPS } from "../ids";
import type { FakeClient } from "../kf/fakeClient";

const LABEL: Record<ReviewDept, string> = { RMM: "RMM", REG: "Regulatory", SAF: "Safety", QM: "QM", MIC: "Microbiology", SUS: "Sustainability" };
const ORDER: ReviewDept[] = ["RMM", "REG", "SAF", "QM", "MIC", "SUS"];
export const INTEGRATION_CONNECTION = { _id: "UsIntegrationConnection", Name: "Kissflow integration" };

/** Plays E-A for the case item `caseItemId` with the departments of Review_Depts; returns the reviews it created.
 *  `reviews: false` plays a refused Approve: since 25 Oct the bulk create is I-2's last step, after the review.started
 *  row and the Approve, so only the row is written. */
export function playEA(fake: FakeClient, caseItemId: string, depts: ReviewDept[], at = "2026-10-24T08:30:00Z", o: { reviews?: boolean } = {}): RawItem[] {
  const c = fake.find(caseItemId)?.item;
  if (!c) throw new Error(`playEA: no case ${caseItemId}`);
  const code = str(c, "Case_Code");
  const have = new Set(fake.db.review.filter((r) => str(r, "Case_Item_Id") === caseItemId).map((r) => str(r, "Review_Key")));
  const want = ORDER.filter((d) => d === "RMM" || depts.includes(d)).filter((d) => !have.has(`${code}-${d}-1`));
  if (!want.length) return [];
  const made: RawItem[] = [];
  if (o.reviews !== false) for (const d of want) {
    const id = `PkEA${code.replace(/-/g, "")}${d}`;
    const item: RawItem = {
      _id: id,
      _status: "InProgress",
      _created_at: at,
      _modified_at: at,
      _created_by: INTEGRATION_CONNECTION,
      _modified_by: INTEGRATION_CONNECTION,
      Review_Key: `${code}-${d}-1`,
      Case_Code: code,
      Cycle_No: Number(c.Cycle_No) || 1,
      Case_Item_Id: caseItemId,
      Supplier_Code: str(c, "Supplier_Code"),
      Trade_Name: str(c, "Trade_Name"),
      Review_Dept: d,
      Round_No: 1,
      Activation_Kind: "Completeness",
      Activation_Reason: "The supplier confirmed completeness.",
      Activated_By_Name: "Integration",
      Track_Status: LIST.track["in-review"],
      Open_Count: 0,
      RMES_Gaps: 0,
    };
    fake.db.review.push(item);
    fake.move(id, STEPS.review[d]);
    made.push(item);
  }
  const text = `Reviews started: ${want.map((d) => LABEL[d]).join(", ")}.`;
  const owner = (c.Owner_RMM as { _id?: string } | undefined)?._id;
  fake.db.audit.push({
    _id: `PkEvEA${code.replace(/-/g, "")}`,
    _created_at: at,
    _created_by: INTEGRATION_CONNECTION,
    Event_Key: `EV-${code}-${at.replace(/[-:TZ]/g, "").slice(0, 14)}-ea00`,
    Case_Code: code,
    Cycle_No: Number(c.Cycle_No) || 1,
    Case_Item_Id: caseItemId,
    Event_At: at,
    Event_Category: "Review",
    Action_Code: "review.started",
    Actor_Side: "BDF",
    Actor_Name: "Integration",
    Object_Kind: "Case",
    Object_Key: code,
    Object_Item_Id: caseItemId,
    Object_State: "In review",
    New_Value_Text: text,
    Snapshot_JSON: JSON.stringify({
      v: 1,
      code: "review.started",
      audit: [{ id: "", at, by: "system", action: "Activated review", detail: text }],
      handoffs: [],
      tracks: want.map((d) => ({ dept: d, status: "in-review", roundNo: 1, startedAt: at, ...(d === "RMM" && owner ? { assigneeId: owner } : {}) })),
    }),
  });
  return made;
}
