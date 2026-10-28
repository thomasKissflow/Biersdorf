// Open point logic, pure (WORKBENCH-DESIGN.md §8.9; BR-046; D34). Every builder returns a Patch for saveAtStep at the
// step that holds the task; the screens only render. Field ids come from the generated schema (F.Open_Point).
//
// Actions by step (§8.9):
//   OPNT_R_<D> with OP_Outcome blank      → Accept · Withdraw · Return (§7.5, T0's sendBackPoint) · Mark in progress
//                                            (+ Late decision at R_REG/R_SAF when the case lane is already completed)
//   OPNT_R_<D> with OP_Outcome "Withdrawn" → ONLY Confirm withdrawal (withdrawn at OPNT_S1)
//   OPNT_S1 (whoever holds the task)       → Supplier responded (manual record) · Withdraw point
// Every action needs the HELD task for this point at that step (ground rule 13); the role never decides.
import { deptOfOpReviewStep, isWritableAt, switchesAt, type Dept, type StepIr } from "../../schema";
import { F } from "../../schema/generated";
import { ADDITIONAL_PART } from "../../domain/flags";
import { DEPT_LABEL } from "../../domain/labels";
import { opKey as makeOpKey, queryKey } from "../../domain/keys";
import { mirrorOf } from "../../data/gates";
import { isBlank, kfDateTime } from "../../data/normalize";
import type { Me } from "../../data/runtime";
import type { CaseVM, Patch, PointVM, Problem, TaskVM } from "../../data/viewModels";

const P = F.Open_Point;
const R = F.Rounds;
export const OP_FLOW = "CIQ_Open_Point_A00" as const;

/** Response kinds of a supplier answer (brd L465). Response_Kind is a Text field, so the list lives here. */
export const RESPONSE_KINDS = ["Answer", "Document", "Additional part completed", "Cannot provide"] as const;
/** Response_Kind written when Beiersdorf withdraws the point at OPNT_S1 (brd L915). */
export const WITHDRAWN_BY_BDF = "Withdrawn by Beiersdorf";

const problem = (field: string, label: string, message?: string): Problem => ({ field, label, message: message ?? `${label} is required.` });
const filled = (v: unknown) => !isBlank(v);
/** Drops undefined and blank strings, so nothing blank is written by accident (a clear uses CLEAR). */
function clean(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && !(typeof v === "string" && v.trim() === "")));
}

const reviewedBy = (me: Me, now: Date) => ({ [P.Reviewed_By]: { _id: me._id }, [P.Reviewed_By_Email]: me.Email, [P.Reviewed_At]: kfDateTime(now) });

/** One Rounds row for the CURRENT round (natural key: Rounds_Round_No + Rounds_Outcome, §7.2). */
export function roundRow(p: Pick<PointVM, "roundNo" | "questionText" | "responseKind" | "responseText">, outcome: "Accepted" | "Returned" | "Withdrawn", me: Me, now: Date, extra: { reason?: string; docFileName?: string; docUploadedAt?: string } = {}): Record<string, unknown> {
  return clean({
    [R.Rounds_Round_No]: p.roundNo ?? 1,
    [R.Rounds_Question_Text]: p.questionText,
    [R.Rounds_Response_Kind]: p.responseKind,
    [R.Rounds_Response_Text]: p.responseText,
    [R.Rounds_Outcome]: outcome,
    [R.Rounds_Reason]: extra.reason,
    [R.Rounds_Doc_File_Name]: extra.docFileName,
    [R.Rounds_Doc_Uploaded_At]: extra.docUploadedAt,
    [R.Rounds_Reviewed_By]: { _id: me._id },
    [R.Rounds_Reviewed_At]: kfDateTime(now),
  });
}

// ---------------------------------------------------------------- OPNT_R_<D>

export interface AcceptInput {
  /** Picked from Response_Doc_Refs_JSON. */
  acceptedDocFileName?: string;
  acceptedDocUploadedAt?: string;
  onBehalfOf?: string;
  /** R_REG/R_SAF only (Editable there only). */
  lateDecision?: string;
  lateDecisionReason?: string;
  note?: string;
}

/** Accept: a Rounds row (Accepted), OP_Outcome "Accepted", Reviewed_By/_Email/_At, the accepted document, On_Behalf_Of. */
export function buildAcceptPatch(p: PointVM, step: StepIr, input: AcceptInput, me: Me, now: Date): Patch {
  // only a Department review carries a late decision: the S6 rule reads no other kind (brd L903; F3)
  const late = isWritableAt(step, P.Late_Decision) && p.kind === DEPARTMENT_REVIEW;
  return {
    fields: clean({
      [P.OP_Outcome]: "Accepted",
      ...reviewedBy(me, now),
      [P.Accepted_Doc_File_Name]: input.acceptedDocFileName,
      [P.Accepted_Doc_Uploaded_At]: input.acceptedDocFileName ? input.acceptedDocUploadedAt : undefined,
      [P.On_Behalf_Of]: input.onBehalfOf,
      [P.Late_Decision]: late ? input.lateDecision : undefined,
      [P.Late_Decision_Reason]: late && input.lateDecision ? input.lateDecisionReason : undefined,
    }),
    tables: { Rounds: [{ kind: "add", row: roundRow(p, "Accepted", me, now, { reason: input.note, docFileName: input.acceptedDocFileName, docUploadedAt: input.acceptedDocFileName ? input.acceptedDocUploadedAt : undefined }) }] },
  };
}

/** Withdraw at R_<D>: Outcome_Reason required; a Rounds row (Withdrawn), OP_Outcome "Withdrawn" and Reviewed_* (all
 *  three Mandatory at every R step). A business outcome, never the native withdraw (COH-17). */
export function buildWithdrawPatch(p: PointVM, reason: string, me: Me, now: Date, onBehalfOf?: string): Patch {
  return {
    fields: clean({ [P.OP_Outcome]: "Withdrawn", [P.Outcome_Reason]: reason.trim(), ...reviewedBy(me, now), [P.On_Behalf_Of]: onBehalfOf }),
    tables: { Rounds: [{ kind: "add", row: roundRow(p, "Withdrawn", me, now, { reason: reason.trim() }) }] },
  };
}

/** Confirm withdrawal (the point was withdrawn at OPNT_S1): Reviewed_* and a Rounds row (Withdrawn, reason =
 *  Outcome_Reason). OP_Outcome is already "Withdrawn" and is not written again. */
export function buildConfirmWithdrawalPatch(p: PointVM, me: Me, now: Date): Patch {
  return {
    fields: { ...reviewedBy(me, now) },
    tables: { Rounds: [{ kind: "add", row: roundRow(p, "Withdrawn", me, now, { reason: p.outcomeReason }) }] },
  };
}

export const buildProgressPatch = (progress: string): Patch => ({ fields: { [P.OP_Progress]: progress } });

// ---------------------------------------------------------------- OPNT_S1 (manual record, Y3 fallback)

export interface ManualResponseInput {
  responseKind: string;
  responseText?: string;
  /** File names as given by the supplier (stored as a JSON array of names). */
  docFileNames?: string[];
  supplierResponsibleEmail?: string;
}

export function manualResponseProblems(i: ManualResponseInput): Problem[] {
  const out: Problem[] = [];
  if (!(RESPONSE_KINDS as readonly string[]).includes(i.responseKind)) out.push(problem(P.Response_Kind, "Response kind", "Pick how the supplier responded."));
  if (i.supplierResponsibleEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.supplierResponsibleEmail.trim())) out.push(problem(P.Supplier_Responsible_Email, "Supplier responsible e-mail", "This is not an e-mail address."));
  return out;
}

/** "Supplier responded (manual record)": Response_Kind (Mandatory), text, file names as given, the supplier's
 *  e-mail, Awaiting_Response "No". Portal_Query_Item_Id stays blank (no portal hand-off exists). */
export function buildManualResponsePatch(i: ManualResponseInput): Patch {
  const names = (i.docFileNames ?? []).map((n) => n.trim()).filter(Boolean);
  return {
    fields: clean({
      [P.Response_Kind]: i.responseKind,
      [P.Response_Text]: i.responseText,
      [P.Response_Doc_Refs_JSON]: names.length ? JSON.stringify(names) : undefined,
      [P.Supplier_Responsible_Email]: i.supplierResponsibleEmail?.trim(),
      [P.Awaiting_Response]: "No",
    }),
  };
}

/** Withdraw the point at OPNT_S1 (brd L915): it still routes to R_<OP_Dept>, where the owner confirms it. */
export function buildS1WithdrawPatch(reason: string): Patch {
  return { fields: { [P.Response_Kind]: WITHDRAWN_BY_BDF, [P.OP_Outcome]: "Withdrawn", [P.Outcome_Reason]: reason.trim() } };
}

/** File names in Response_Doc_Refs_JSON: a JSON array of names or of { name|fileName|File_Name, uploadedAt }, or a
 *  plain comma/newline list (tolerant: the portal format is not fixed yet). */
export function docRefsOf(json: string): { name: string; uploadedAt?: string }[] {
  const s = (json ?? "").trim();
  if (!s) return [];
  try {
    const v = JSON.parse(s) as unknown;
    const arr = Array.isArray(v) ? v : [v];
    return arr
      .map((x) => {
        if (typeof x === "string") return { name: x };
        if (x && typeof x === "object") {
          const o = x as Record<string, unknown>;
          const name = [o.name, o.fileName, o.File_Name, o.file_name].find((n) => typeof n === "string" && n.trim()) as string | undefined;
          const at = [o.uploadedAt, o.Uploaded_At, o.uploaded_at].find((n) => typeof n === "string" && n.trim()) as string | undefined;
          return name ? { name, uploadedAt: at } : null;
        }
        return null;
      })
      .filter((x): x is { name: string; uploadedAt?: string } => !!x);
  } catch {
    return s
      .split(/[\n,;]+/)
      .map((n) => n.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
  }
}

// ---------------------------------------------------------------- what the user may do on a point

export type PointAction = "accept" | "withdraw" | "return" | "progress" | "late-decision" | "confirm-withdrawal" | "submit" | "s1-response" | "s1-withdraw";
export interface PointPanel {
  mode: "s1" | "review" | "readonly" | "unresolved";
  task: TaskVM | null;
  actions: PointAction[];
  note?: string;
}

export const DEPARTMENT_REVIEW = "Department review";

/** Late_Decision is offered at R_REG/R_SAF (Editable there only) on a "Department review" point ONLY: it is the late
 *  SAF/REG decision the overall approver's rule reads (brd L903, WB-D8). On any other kind S6 would ignore it, so it
 *  is never offered there (F3). */
export function lateDecisionVisible(step: StepIr | null, p: Pick<PointVM, "kind">): boolean {
  if (!step || !isWritableAt(step, P.Late_Decision)) return false;
  return p.kind === DEPARTMENT_REVIEW;
}

/**
 * The point panel for this user (§8.9, ground rule 13): decided ONLY by the held task for this point (optionally the
 * activity instance from ?task=), never by the user's roles. So a reviewer who raised a supplier point and holds its
 * OPNT_S1 task (K-FA) gets the S1 panel, and an RMM user who does not hold it gets a read-only page.
 */
export function pointPanel(p: Pick<PointVM, "_id" | "outcome" | "toSupplier" | "kind">, tasks: TaskVM[], act?: string | null, o: { lateDecision?: boolean } = {}): PointPanel {
  const mine = tasks.filter((t) => t.flow === OP_FLOW && t.instanceId === p._id && (!act || t.activityInstanceId === act));
  const t = mine.find((x) => x.step) ?? mine[0] ?? null;
  if (!t) return { mode: "readonly", task: null, actions: [], note: "You don't hold this task." };
  if (!t.step) return { mode: "unresolved", task: t, actions: [], note: "Task at an unidentified step: open it in Kissflow." };
  if (t.step === "OPNT_S1") return { mode: "s1", task: t, actions: ["s1-response", "s1-withdraw"] };
  if (deptOfOpReviewStep(t.step)) {
    if (p.outcome === "Withdrawn") return { mode: "review", task: t, actions: ["confirm-withdrawal"] };
    if (p.outcome === "Accepted") return { mode: "review", task: t, actions: ["submit"], note: "Accepted already; only the submit is left." };
    const a: PointAction[] = ["accept", "withdraw"];
    if (p.toSupplier && switchesAt(t.step).sendBack) a.push("return");
    a.push("progress");
    if (o.lateDecision) a.push("late-decision");
    return { mode: "review", task: t, actions: a };
  }
  return { mode: "readonly", task: t, actions: [], note: "This step is not handled on the point page." };
}

// ---------------------------------------------------------------- raise (OPNT_S0)

/** What the raise dialog collects (§8.9). Generated by createPoint: OP_Key, Round_No 1, Query_Key, Awaiting_Response,
 *  Thread_Text, the case keys and Responsible_User = me. Start_Gate is computed: never an input. */
export interface RaiseInput {
  opKind: string;
  opDept: string;
  raisedByDept: string;
  toSupplier: boolean;
  refKind: string;
  refSectionKey?: string;
  refFieldKey?: string;
  refRowId?: string;
  refDocId?: string;
  refDocFileName?: string;
  refDocUploadedAt?: string;
  refLabel: string;
  refInternalKey?: string;
  kindLabel?: string;
  questionText: string;
  supplierJustification?: string;
  internalJustification: string;
  internalDueDate: string;
  supplierDueDate?: string;
  responsibleName?: string;
  responsibleDeptLabel?: string;
  portalContactIds?: string;
}

/** Reference kinds offered by the dialog [convention: Ref_Kind is a Text field without a list]. */
export const REF_KINDS = ["Section", "Field", "Row", "Document", "Case", "Change request", "RMES finding", "Internal"] as const;

/** OP_To_Supplier default per kind (§8.9): Yes for Query and Document request (and Additional part); No for the
 *  internal kinds; null = the user picks (Contact update). */
export function defaultToSupplier(kind: string): boolean | null {
  if (kind === "Query" || kind === "Document request" || kind === ADDITIONAL_PART) return true;
  if (kind === "Internal review" || kind === "Department review") return false;
  return null;
}

/** Client problems before anything is created. Supplier_Due_Date is NOT checked here: the server Start_Gate decides,
 *  and a blank one is listed after the create with the draft kept (§8.9 sequence; harness S22). */
export function raiseProblems(i: Partial<RaiseInput>): Problem[] {
  const out: Problem[] = [];
  if (!i.opKind) out.push(problem(P.OP_Kind, "Kind"));
  if (i.opKind === ADDITIONAL_PART) out.push(problem(P.OP_Kind, "Kind", "Raising an \"Additional part\" point is not available in this version."));
  if (!i.opDept) out.push(problem(P.OP_Dept, "Department"));
  if (!i.raisedByDept) out.push(problem(P.Raised_By_Dept, "Raised by department"));
  if (typeof i.toSupplier !== "boolean") out.push(problem(P.OP_To_Supplier, "Goes to the supplier", "Choose whether the point goes to the supplier."));
  if (!filled(i.refKind)) out.push(problem(P.Ref_Kind, "Reference kind"));
  if (!filled(i.refLabel)) out.push(problem(P.Ref_Label, "Reference label"));
  if (!filled(i.questionText)) out.push(problem(P.Question_Text, "Question"));
  if (!filled(i.internalJustification)) out.push(problem(P.Internal_Justification, "Internal justification"));
  if (!filled(i.internalDueDate)) out.push(problem(P.Internal_Due_Date, "Internal due date"));
  if (i.toSupplier && !filled(i.supplierJustification)) out.push(problem(P.Supplier_Justification, "Supplier justification", "Supplier justification is required when the point goes to the supplier."));
  return out;
}

/** The create data at OPNT_S0. `opKey` keeps the key of an earlier attempt (a draft resumed after the Start gate). */
export function buildRaiseData(i: RaiseInput, c: Pick<CaseVM, "_id" | "caseCode" | "cycleNo" | "supplierCode" | "portalContactIds">, me: Me, now: Date, rnd: () => number = Math.random, o: { opKey?: string } = {}): Record<string, unknown> {
  const key = o.opKey || makeOpKey(c.caseCode, c.cycleNo ?? 1, now, rnd);
  const raisedBy = DEPT_LABEL[i.raisedByDept as Dept] ?? i.raisedByDept;
  const thread = `[${kfDateTime(now)}] Raised by ${me.Name} (${raisedBy}): ${i.questionText.trim()}`;
  return clean({
    [P.OP_Key]: key,
    [P.Round_No]: 1,
    [P.Query_Key]: queryKey(key, 1),
    [P.Case_Code]: c.caseCode,
    [P.Cycle_No]: c.cycleNo ?? undefined,
    [P.Supplier_Code]: c.supplierCode,
    [P.Case_Item_Id]: c._id,
    [P.OP_Kind]: i.opKind,
    [P.OP_Dept]: i.opDept,
    [P.Raised_By_Dept]: i.raisedByDept,
    [P.OP_To_Supplier]: i.toSupplier ? "Yes" : "No",
    [P.Ref_Kind]: i.refKind,
    [P.Ref_Section_Key]: i.refSectionKey,
    [P.Ref_Field_Key]: i.refFieldKey,
    [P.Ref_Row_Id]: i.refRowId,
    [P.Ref_Doc_Id]: i.refDocId,
    [P.Ref_Doc_File_Name]: i.refDocFileName,
    [P.Ref_Doc_Uploaded_At]: i.refDocUploadedAt,
    [P.Ref_Label]: i.refLabel,
    [P.Ref_Internal_Key]: i.refInternalKey,
    [P.Kind_Label]: i.kindLabel || i.opKind,
    [P.Question_Text]: i.questionText,
    [P.Supplier_Justification]: i.toSupplier ? i.supplierJustification : undefined,
    [P.Internal_Justification]: i.internalJustification,
    [P.Responsible_User]: { _id: me._id },
    [P.Responsible_Name]: i.responsibleName || me.Name,
    [P.Responsible_Dept_Label]: i.responsibleDeptLabel || raisedBy,
    [P.Internal_Due_Date]: i.internalDueDate,
    [P.Supplier_Due_Date]: i.toSupplier ? i.supplierDueDate : undefined,
    [P.Portal_Contact_Ids]: i.portalContactIds ?? c.portalContactIds,
    [P.Thread_Text]: thread,
    [P.Awaiting_Response]: i.toSupplier ? "Yes" : undefined,
  });
}

/** What the server Start_Gate will say about this data (client mirror; explanation only, never a decision). */
export function startGatePreview(data: Record<string, unknown>): string[] {
  const m = mirrorOf(OP_FLOW, P.Start_Gate);
  if (!m) return [];
  const r = m(data);
  return r.value === "OK" ? [] : r.why;
}

/** The raiser's departments: reviewer departments, plus "RMM" when CIQ RMM is held (Caps.reviewerDepts). */
export function defaultRaisedBy(myDepts: readonly Dept[], preset?: Partial<RaiseInput>): string {
  if (preset?.raisedByDept && (myDepts as readonly string[]).includes(preset.raisedByDept)) return preset.raisedByDept;
  if (preset?.opDept && (myDepts as readonly string[]).includes(preset.opDept)) return preset.opDept;
  if (myDepts.includes("RMM")) return "RMM";
  return myDepts[0] ?? "";
}
