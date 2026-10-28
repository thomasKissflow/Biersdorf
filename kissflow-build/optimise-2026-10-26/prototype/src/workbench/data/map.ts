// Raw Kissflow items → view models (WORKBENCH-DESIGN.md §6.4). The only module that reads raw field ids for display.
// Status comes from `_status` (matched case-insensitively) and the current step from a FULL read only: on an admin
// list the row carries no step (UI-LOG L43), and on any other list it is item-level (§6.3).
import { DEPTS, anyStepOf, childTableOf, type ChildTableId, type Dept, type FlowId, type StepIr } from "../schema";
import { F } from "../schema/generated";
import type { RawItem } from "./client";
import { idOf, nameOf } from "./normalize";
import type {
  AuditVM,
  BaseVM,
  CaseVM,
  ComponentRowVM,
  ConfigVM,
  ContactVM,
  CrDept,
  CrVM,
  CriterionVM,
  FindingVM,
  ItemStatus,
  LaneVM,
  NoteVM,
  PointVM,
  ReadQuality,
  RmesVM,
  RoundVM,
  RunVM,
  SectionVM,
  SupplierVM,
  UserRef,
} from "./viewModels";

/** Row keys that may carry a step name (item-level until Diagnostics proves otherwise, §6.3). */
export const STEP_KEYS = ["_current_step", "_current_activity_name", "_activity_name", "_step_name"] as const;

export const str = (o: Record<string, unknown> | undefined, k: string): string => {
  const v = o?.[k];
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return nameOf(v) ?? idOf(v) ?? "";
  return String(v);
};
export const num = (o: Record<string, unknown> | undefined, k: string): number | null => {
  const v = o?.[k];
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const user = (o: Record<string, unknown> | undefined, k: string): UserRef | null => {
  const v = o?.[k];
  const id = idOf(v);
  if (!id) return null;
  const name = nameOf(v);
  return name ? { _id: id, name } : { _id: id };
};
const yes = (o: Record<string, unknown> | undefined, k: string): boolean => str(o, k).trim().toLowerCase() === "yes";

export function statusOf(raw: Record<string, unknown>): ItemStatus {
  const s = String(raw._status ?? "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  if (!s) return "unknown";
  if (s === "draft") return "draft";
  if (s === "inprogress" || s === "active" || s === "pending") return "in-progress";
  if (s === "completed" || s === "complete" || s === "approved") return "completed";
  if (s === "rejected") return "rejected";
  if (s === "withdrawn") return "withdrawn";
  return "unknown";
}
/** Open for counting purposes: In progress, or `_status` absent (§6.2 rung-1 per-item reads). */
export const isOpenStatus = (s: ItemStatus): boolean => s === "in-progress" || s === "unknown";

/** Step names a raw item carries (string, array of strings, or array of objects with a name). */
export function stepNamesOf(raw: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const k of STEP_KEYS) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) out.push(v.trim());
    else if (Array.isArray(v))
      for (const x of v) {
        if (typeof x === "string" && x.trim()) out.push(x.trim());
        else if (x && typeof x === "object") {
          const n = (x as { Name?: unknown; name?: unknown }).Name ?? (x as { name?: unknown }).name;
          if (typeof n === "string" && n.trim()) out.push(n.trim());
        }
      }
    else if (v && typeof v === "object") {
      const n = (v as { Name?: unknown; name?: unknown }).Name ?? (v as { name?: unknown }).name;
      if (typeof n === "string" && n.trim()) out.push(n.trim());
    }
  }
  return [...new Set(out)];
}
export function currentStepsOf(flow: FlowId, raw: Record<string, unknown>): StepIr[] {
  return [...new Set(stepNamesOf(raw).map((n) => anyStepOf(flow, n)).filter((x): x is StepIr => !!x))];
}

function base<T extends FlowId>(flow: T, raw: RawItem, q: ReadQuality): BaseVM & { flow: T } {
  const v: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(raw)) if (!k.startsWith("_") && !k.startsWith("Table::")) v[k] = val;
  return {
    _id: raw._id,
    flow,
    status: statusOf(raw),
    statusText: typeof raw._status === "string" ? raw._status : undefined,
    readQuality: q,
    createdAt: typeof raw._created_at === "string" ? raw._created_at : undefined,
    v,
    raw,
  };
}

/** The rows of a child table on a raw item: `Table::<model id>` (as read back over REST) or the bare table id. */
export function childRows(flow: FlowId, table: ChildTableId, raw: Record<string, unknown>): Record<string, unknown>[] {
  const { key, def } = childTableOf(flow, table);
  const v = raw[key] ?? raw[`Table::${def.id}`] ?? raw[def.id];
  return Array.isArray(v) ? (v.filter((r) => r && typeof r === "object") as Record<string, unknown>[]) : [];
}

function lane(raw: RawItem, d: Dept): LaneVM {
  const confirm = str(raw, `${d}_Review_Confirm`);
  const completedAt = str(raw, `${d}_Completed_At`);
  const l: LaneVM = {
    dept: d,
    active: yes(raw, `Dept_${d}_Active`),
    confirm,
    completedBy: user(raw, `${d}_Completed_By`),
    completedByEmail: str(raw, `${d}_Completed_By_Email`),
    completedAt,
    onBehalfOf: str(raw, `${d}_On_Behalf_Of`),
    openCount: num(raw, `${d}_Open_Count`),
    gate: str(raw, `${d}_Gate`),
    complete: confirm === "Confirmed" && !!completedAt,
  };
  if (d === "SAF" || d === "REG") {
    l.rmesDecision = str(raw, `${d}_RMES_Decision`);
    l.rmesDecisionReason = str(raw, `${d}_RMES_Decision_Reason`);
    l.rmesGaps = num(raw, `${d}_RMES_Gaps`);
  }
  return l;
}

export interface MapOptions {
  /** Trust the row's step keys for currentSteps / step (full reads; held tasks). Default: only when q = "full". */
  trustStep?: boolean;
}
const trust = (q: ReadQuality, o?: MapOptions) => o?.trustStep ?? q === "full";

export function toCaseVM(raw: RawItem, q: ReadQuality = "row", o?: MapOptions): CaseVM {
  const C = F.Case;
  const b = base("CIQ_Case_A00", raw, q);
  const status = b.status;
  const conf = (p: "Completeness" | "Final_Release") => ({
    requestKey: str(raw, `${p}_Request_Key`),
    dueDate: str(raw, `${p}_Due_Date`),
    confirm: str(raw, `${p}_Confirm`),
    byName: str(raw, `${p}_By_Name`),
    byEmail: str(raw, `${p}_By_Email`),
    byRole: str(raw, `${p}_By_Role`),
    at: str(raw, `${p}_At`),
  });
  return {
    ...b,
    caseCode: str(raw, C.Case_Code),
    cycleNo: num(raw, C.Cycle_No),
    title: str(raw, C.Case_Title),
    tradeName: str(raw, C.Trade_Name),
    mainInci: str(raw, C.Main_INCI),
    bdfMaterialNo: str(raw, C.BDF_Material_No),
    sapMaterialNo: str(raw, C.SAP_Material_No),
    irmaRef: str(raw, C.IRMA_Ref),
    supplierCode: str(raw, C.Supplier_Code),
    supplierLegalName: str(raw, C.Supplier_Legal_Name),
    ownerRmm: user(raw, C.Owner_RMM),
    bdfContactName: str(raw, C.BDF_Contact_Name),
    bdfContactEmail: str(raw, C.BDF_Contact_Email),
    targetMarketsText: str(raw, C.Target_Markets_Text),
    marketsLabel: str(raw, C.Markets_Label),
    originTypes: str(raw, C.Origin_Types),
    supplierDueDate: str(raw, C.Supplier_Due_Date),
    caseContactsJson: str(raw, C.Case_Contacts_JSON),
    portalContactIds: str(raw, C.Portal_Contact_Ids),
    confirmContactIds: str(raw, C.Confirm_Contact_Ids),
    supplierContactEmails: str(raw, C.Supplier_Contact_Emails),
    releaseItemId: str(raw, C.Release_Item_Id),
    releaseKey: str(raw, C.Release_Key),
    manifestHash: str(raw, C.Manifest_Hash),
    ruleSetVersion: str(raw, C.Rule_Set_Version),
    overallApprovalRequired: yes(raw, C.Overall_Approval_Required),
    overallDecision: str(raw, C.Overall_Decision),
    overallReason: str(raw, C.Overall_Reason),
    overallDecidedBy: user(raw, C.Overall_Decided_By),
    completeness: conf("Completeness"),
    finalRelease: conf("Final_Release"),
    rmesKey: str(raw, C.RMES_Key),
    openItemsCount: num(raw, C.Open_Items_Count),
    openCrCount: num(raw, C.Open_CR_Count),
    holdForOpenItems: str(raw, C.Hold_For_Open_Items),
    openItemsGateRelease: str(raw, C.Open_Items_Gate_Release),
    openItemsGateClose: str(raw, C.Open_Items_Gate_Close),
    holdNote: str(raw, C.Hold_Note),
    lateCompletionsText: str(raw, C.Late_Completions_Text),
    completionTrigger: str(raw, C.Completion_Trigger),
    isTest: yes(raw, C.Case_Test),
    reactivatesCaseItem: str(raw, C.Reactivates_Case_Item),
    lanes: Object.fromEntries(DEPTS.map((d) => [d, lane(raw, d)])) as Record<Dept, LaneVM>,
    currentSteps: trust(q, o) ? currentStepsOf("CIQ_Case_A00", raw) : [],
    cancelled: status === "rejected" || status === "withdrawn",
  };
}

function toRound(r: Record<string, unknown>): RoundVM {
  return {
    _id: str(r, "_id"),
    roundNo: num(r, "Rounds_Round_No"),
    questionText: str(r, "Rounds_Question_Text"),
    responseKind: str(r, "Rounds_Response_Kind"),
    responseText: str(r, "Rounds_Response_Text"),
    outcome: str(r, "Rounds_Outcome"),
    reason: str(r, "Rounds_Reason"),
    docFileName: str(r, "Rounds_Doc_File_Name"),
    docUploadedAt: str(r, "Rounds_Doc_Uploaded_At"),
    reviewedBy: user(r, "Rounds_Reviewed_By"),
    reviewedAt: str(r, "Rounds_Reviewed_At"),
  };
}

export function toPointVM(raw: RawItem, q: ReadQuality = "row", o?: MapOptions): PointVM {
  const P = F.Open_Point;
  const b = base("CIQ_Open_Point_A00", raw, q);
  const steps = trust(q, o) ? currentStepsOf("CIQ_Open_Point_A00", raw) : [];
  return {
    ...b,
    opKey: str(raw, P.OP_Key),
    roundNo: num(raw, P.Round_No),
    queryKey: str(raw, P.Query_Key),
    caseCode: str(raw, P.Case_Code),
    cycleNo: num(raw, P.Cycle_No),
    caseItemId: str(raw, P.Case_Item_Id),
    supplierCode: str(raw, P.Supplier_Code),
    kind: str(raw, P.OP_Kind),
    dept: str(raw, P.OP_Dept),
    raisedByDept: str(raw, P.Raised_By_Dept),
    toSupplier: yes(raw, P.OP_To_Supplier),
    refKind: str(raw, P.Ref_Kind),
    refSectionKey: str(raw, P.Ref_Section_Key),
    refFieldKey: str(raw, P.Ref_Field_Key),
    refRowId: str(raw, P.Ref_Row_Id),
    refLabel: str(raw, P.Ref_Label),
    refInternalKey: str(raw, P.Ref_Internal_Key),
    kindLabel: str(raw, P.Kind_Label),
    questionText: str(raw, P.Question_Text),
    supplierJustification: str(raw, P.Supplier_Justification),
    internalJustification: str(raw, P.Internal_Justification),
    responsibleUser: user(raw, P.Responsible_User),
    responsibleName: str(raw, P.Responsible_Name),
    responsibleDeptLabel: str(raw, P.Responsible_Dept_Label),
    internalDueDate: str(raw, P.Internal_Due_Date),
    supplierDueDate: str(raw, P.Supplier_Due_Date),
    portalContactIds: str(raw, P.Portal_Contact_Ids),
    threadText: str(raw, P.Thread_Text),
    awaitingResponse: str(raw, P.Awaiting_Response),
    responseKind: str(raw, P.Response_Kind),
    responseText: str(raw, P.Response_Text),
    responseDocRefsJson: str(raw, P.Response_Doc_Refs_JSON),
    progress: str(raw, P.OP_Progress),
    outcome: str(raw, P.OP_Outcome),
    outcomeReason: str(raw, P.Outcome_Reason),
    returnReason: str(raw, P.Return_Reason),
    reviewedBy: user(raw, P.Reviewed_By),
    reviewedByEmail: str(raw, P.Reviewed_By_Email),
    reviewedAt: str(raw, P.Reviewed_At),
    lateDecision: str(raw, P.Late_Decision),
    lateDecisionReason: str(raw, P.Late_Decision_Reason),
    onBehalfOf: str(raw, P.On_Behalf_Of),
    openNum: num(raw, P.Open_Num),
    startGate: str(raw, P.Start_Gate),
    rounds: childRows("CIQ_Open_Point_A00", "Rounds", raw).map(toRound).sort((a, b2) => (a.roundNo ?? 0) - (b2.roundNo ?? 0)),
    step: steps.find((s) => s !== "OPNT_END") ?? null,
  };
}

const CR_DEPTS: CrDept[] = ["REG", "SAF", "QM", "MIC", "SUS"];
export function toCrVM(raw: RawItem, q: ReadQuality = "row", o?: MapOptions): CrVM {
  const R = F.Change_Request;
  const b = base("CIQ_Change_Request_A00", raw, q);
  const steps = trust(q, o) ? currentStepsOf("CIQ_Change_Request_A00", raw) : [];
  return {
    ...b,
    crKey: str(raw, R.CR_Key),
    caseCode: str(raw, R.Case_Code),
    cycleNo: num(raw, R.Cycle_No),
    supplierCode: str(raw, R.Supplier_Code),
    caseItemId: str(raw, R.Case_Item_Id),
    changeKind: str(raw, R.Change_Kind),
    sectionKey: str(raw, R.Section_Key),
    fieldKey: str(raw, R.Field_Key),
    rowId: str(raw, R.Row_Id),
    currentValueText: str(raw, R.Current_Value_Text),
    proposedValueJson: str(raw, R.Proposed_Value_JSON),
    changeReason: str(raw, R.Change_Reason),
    portalCrItemId: str(raw, R.Portal_CR_Item_Id),
    contactVerified: str(raw, R.Contact_Verified),
    outcome: str(raw, R.CR_Outcome),
    triageNote: str(raw, R.Triage_Note),
    scopeRunKey: str(raw, R.Scope_Run_Key),
    noticeKey: str(raw, R.Notice_Key),
    noticeKind: str(raw, R.Notice_Kind),
    noticeTitle: str(raw, R.Notice_Title),
    supplierOutcomeText: str(raw, R.Supplier_Outcome_Text),
    portalContactIds: str(raw, R.Portal_Contact_Ids),
    impacts: Object.fromEntries(
      CR_DEPTS.map((d) => [d, { impact: str(raw, `Impact_${d}`), assessment: str(raw, `${d}_Assessment`), note: str(raw, `${d}_Assess_Note`), by: user(raw, `${d}_Assessed_By`), at: str(raw, `${d}_Assessed_At`) }]),
    ) as CrVM["impacts"],
    crOpenNum: num(raw, R.CR_Open_Num),
    step: steps.find((s) => s !== "CHRQ_END") ?? null,
  };
}

function toComponent(r: Record<string, unknown>): ComponentRowVM {
  return {
    _id: str(r, "_id"),
    rowId: str(r, "Components_Row_Id"),
    inci: str(r, "Components_INCI"),
    casNo: str(r, "Components_CAS_No"),
    ecNo: str(r, "Components_EC_No"),
    fn: str(r, "Components_Function"),
    isAdditive: str(r, "Components_Is_Additive"),
    origin: str(r, "Components_Origin"),
    concMin: num(r, "Components_Conc_Min"),
    concMax: num(r, "Components_Conc_Max"),
  };
}

export function toSectionVM(raw: RawItem, q: ReadQuality = "row"): SectionVM {
  const S = F.Section;
  return {
    ...base("CIQ_Section_A00", raw, q),
    sectionItemKey: str(raw, S.Section_Item_Key),
    caseCode: str(raw, S.Case_Code),
    cycleNo: num(raw, S.Cycle_No),
    caseItemId: str(raw, S.Case_Item_Id),
    supplierCode: str(raw, S.Supplier_Code),
    sectionKey: str(raw, S.Section_Key),
    sectionCode: str(raw, S.Section_Code),
    sectionTitle: str(raw, S.Section_Title),
    sort: num(raw, S.Section_Sort),
    applicabilityLabel: str(raw, S.Applicability_Label),
    addedLater: str(raw, S.Added_Later),
    origin: str(raw, S.Section_Origin),
    definitionJson: str(raw, S.Definition_JSON),
    definitionHash: str(raw, S.Definition_Hash),
    supplierDueDate: str(raw, S.Supplier_Due_Date),
    leadDept: str(raw, S.Lead_Dept),
    queryOwnerDept: str(raw, S.Query_Owner_Dept),
    coReviewDepts: str(raw, S.Co_Review_Depts)
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean),
    scopeRunKey: str(raw, S.Scope_Run_Key),
    searchInci: str(raw, S.Search_INCI),
    searchCas: str(raw, S.Search_CAS),
    components: childRows("CIQ_Section_A00", "Components", raw).map(toComponent),
  };
}

export function toRunVM(raw: RawItem, q: ReadQuality = "row"): RunVM {
  const R = F.Scope_Run;
  return {
    ...base("CIQ_Scope_Run_A00", raw, q),
    runKey: str(raw, R.Run_Key),
    caseCode: str(raw, R.Case_Code),
    cycleNo: num(raw, R.Cycle_No),
    caseItemId: str(raw, R.Case_Item_Id),
    runNo: num(raw, R.Run_No),
    scopeTrigger: str(raw, R.Scope_Trigger),
    relatedKey: str(raw, R.Related_Key),
    releaseItemId: str(raw, R.Release_Item_Id),
    ruleSetVersion: str(raw, R.Rule_Set_Version),
    evaluatorVersion: str(raw, R.Evaluator_Version),
    resultJson: str(raw, R.Result_JSON),
    addedSectionKeys: str(raw, R.Added_Section_Keys),
    leadDepartments: str(raw, R.Lead_Departments),
    runBy: user(raw, R.Run_By),
    runAt: str(raw, R.Run_At),
  };
}

function toCriterion(r: Record<string, unknown>): CriterionVM {
  const v: Record<string, unknown> = { ...r };
  return {
    _id: str(r, "_id"),
    code: str(r, "Criteria_Code"),
    part: str(r, "Criteria_Part"),
    title: str(r, "Criteria_Title"),
    applicable: str(r, "Criteria_Applicable"),
    result: str(r, "Criteria_Result"),
    comment: str(r, "Criteria_Comment"),
    openNum: num(r, "Criteria_Open_Num"),
    impactResolution: str(r, "Criteria_Impact_Resolution"),
    recordedBy: user(r, "Criteria_Recorded_By"),
    recordedAt: str(r, "Criteria_Recorded_At"),
    v,
  };
}
function toFinding(r: Record<string, unknown>): FindingVM {
  return {
    _id: str(r, "_id"),
    text: str(r, "Findings_Text"),
    criterionCode: str(r, "Findings_Criterion_Code"),
    blocking: str(r, "Findings_Blocking"),
    state: str(r, "Findings_State"),
    linkedOpKey: str(r, "Findings_Linked_OP_Key"),
  };
}

export function toRmesVM(raw: RawItem, flow: "CIQ_RMES_Safety_A00" | "CIQ_RMES_Regulatory_A00", q: ReadQuality = "row"): RmesVM {
  const saf = flow === "CIQ_RMES_Safety_A00";
  return {
    ...base(flow, raw, q),
    dept: saf ? "SAF" : "REG",
    rmesKey: str(raw, "RMES_Key"),
    caseItemId: str(raw, "Case_Item_Id"),
    caseCode: str(raw, "Case_Code"),
    cycleNo: num(raw, "Cycle_No"),
    openCriteriaCount: num(raw, "Open_Criteria_Count"),
    openBlockingFindingsCount: num(raw, "Open_Blocking_Findings_Count"),
    editingBy: str(raw, "Editing_By"),
    editingSince: str(raw, "Editing_Since"),
    voided: yes(raw, "RMES_Voided"),
    criteria: childRows(flow, saf ? "Safety_Criteria" : "Regulatory_Criteria", raw).map(toCriterion),
    findings: childRows(flow, saf ? "Safety_Findings" : "Regulatory_Findings", raw).map(toFinding),
  };
}

export function toNoteVM(raw: RawItem, q: ReadQuality = "row"): NoteVM {
  const N = F.Internal_Note;
  return {
    ...base("CIQ_Internal_Note_A00", raw, q),
    noteKey: str(raw, N.Note_Key),
    caseCode: str(raw, N.Case_Code),
    cycleNo: num(raw, N.Cycle_No),
    caseItemId: str(raw, N.Case_Item_Id),
    linkedKind: str(raw, N.Linked_Kind),
    linkedKey: str(raw, N.Linked_Key),
    text: str(raw, N.Note_Text),
    author: user(raw, N.Note_Author),
    dept: str(raw, N.Note_Dept),
    at: str(raw, N.Note_At),
  };
}

export function parseJson(s: string): unknown {
  if (!s.trim()) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function toAuditVM(raw: RawItem, q: ReadQuality = "row"): AuditVM {
  const A = F.Audit_Event;
  const snapshotJson = str(raw, A.Snapshot_JSON);
  return {
    ...base("CIQ_Audit_Event_A00", raw, q),
    eventKey: str(raw, A.Event_Key),
    caseCode: str(raw, A.Case_Code),
    cycleNo: num(raw, A.Cycle_No),
    caseItemId: str(raw, A.Case_Item_Id),
    at: str(raw, A.Event_At),
    category: str(raw, A.Event_Category),
    actionCode: str(raw, A.Action_Code),
    actorSide: str(raw, A.Actor_Side),
    actorName: str(raw, A.Actor_Name),
    actorEmail: str(raw, A.Actor_Email),
    actorDept: str(raw, A.Actor_Dept),
    actorRoleId: str(raw, A.Actor_Role_Id),
    onBehalfOf: str(raw, A.On_Behalf_Of),
    objectKind: str(raw, A.Object_Kind),
    objectKey: str(raw, A.Object_Key),
    objectItemId: str(raw, A.Object_Item_Id),
    oldValueText: str(raw, A.Old_Value_Text),
    newValueText: str(raw, A.New_Value_Text),
    eventReason: str(raw, A.Event_Reason),
    notifyRecipient: str(raw, A.Notify_Recipient),
    snapshotJson,
    snapshot: parseJson(snapshotJson),
  };
}

function toContact(r: Record<string, unknown>): ContactVM {
  return {
    _id: str(r, "_id"),
    fullName: str(r, "Contacts_Full_Name"),
    email: str(r, "Contacts_Email"),
    role: str(r, "Contacts_Role"),
    canConfirm: yes(r, "Contacts_Can_Confirm"),
    portalUserId: str(r, "Contacts_Portal_User_Id"),
    active: str(r, "Contacts_Active").trim().toLowerCase() !== "no",
    inviteRequestedAt: str(r, "Contacts_Invite_Requested_At"),
    invitedAt: str(r, "Contacts_Invited_At"),
  };
}

export function toSupplierVM(raw: RawItem, q: ReadQuality = "row"): SupplierVM {
  const S = F.Supplier;
  return {
    ...base("CIQ_Supplier_A00", raw, q),
    code: str(raw, S.Supplier_Code),
    legalName: str(raw, S.Supplier_Legal_Name),
    kind: str(raw, S.Supplier_Kind),
    countryCode: str(raw, S.Supplier_Country_Code),
    active: str(raw, S.Supplier_Active).trim().toLowerCase() !== "no",
    test: yes(raw, S.Supplier_Test),
    contactPortalIdsText: str(raw, S.Contact_Portal_Ids_Text),
    pendingInvites: num(raw, S.Pending_Invites),
    contacts: childRows("CIQ_Supplier_A00", "Contacts", raw).map(toContact),
  };
}

export function toConfigVM(raw: RawItem, q: ReadQuality = "row"): ConfigVM {
  const C = F.Config_Version;
  return {
    ...base("CIQ_Config_Version_A00", raw, q),
    configKey: str(raw, C.Config_Key),
    kind: str(raw, C.Config_Kind),
    versionLabel: str(raw, C.Version_Label),
    state: str(raw, C.Config_State),
    sectionKey: str(raw, C.Section_Key),
    sectionRev: num(raw, C.Section_Rev),
    payloadJson: str(raw, C.Payload_JSON),
    annotationsJson: str(raw, C.Internal_Annotations_JSON),
    contentHash: str(raw, C.Content_Hash),
    evaluatorVersion: str(raw, C.Evaluator_Version),
    changeNote: str(raw, C.Change_Note),
    publishedBy: user(raw, C.Published_By),
    publishedAt: str(raw, C.Published_At),
    releaseKey: str(raw, C.Release_Key),
    releaseLabel: str(raw, C.Release_Label),
    releaseStage: str(raw, C.Release_Stage),
    releaseManifestJson: str(raw, C.Release_Manifest_JSON),
    releaseBundleJson: str(raw, C.Release_Bundle_JSON),
    manifestHash: str(raw, C.Manifest_Hash),
  };
}

/**
 * The F8 case index (§6.2): "Item created" rows for a Case carry Case_Item_Id, Case_Code, Cycle_No and the case header
 * in Snapshot_JSON. A role on rung 3 can still find cases through it; such cases are readQuality "index" and their
 * status is not readable.
 */
export function caseIndexFromAudit(events: AuditVM[]): CaseVM[] {
  const out = new Map<string, CaseVM>();
  for (const e of events) {
    if (e.category !== "Item created" || e.objectKind !== "Case" || !e.caseItemId) continue;
    const snap = e.snapshot && typeof e.snapshot === "object" && !Array.isArray(e.snapshot) ? (e.snapshot as Record<string, unknown>) : {};
    const header: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(snap)) if (!k.startsWith("_")) header[k] = v;
    const raw = { ...header, _id: e.caseItemId, Case_Code: e.caseCode || header.Case_Code, Cycle_No: e.cycleNo ?? header.Cycle_No } as RawItem;
    out.set(e.caseItemId, toCaseVM(raw, "index"));
  }
  return [...out.values()];
}

/** The header snapshot written into the F8 "Item created" row (§7.6). */
export function caseHeaderSnapshot(c: Record<string, unknown>): Record<string, unknown> {
  const C = F.Case;
  const keys = [C.Case_Code, C.Cycle_No, C.Case_Title, C.Trade_Name, C.Main_INCI, C.BDF_Material_No, C.SAP_Material_No, C.IRMA_Ref, C.Supplier_Code, C.Supplier_Legal_Name, C.Owner_RMM, C.Supplier_Due_Date, C.Release_Key, C.Case_Test, C.Reactivates_Case_Item];
  return Object.fromEntries(keys.filter((k) => c[k] !== undefined).map((k) => [k, c[k]]));
}
