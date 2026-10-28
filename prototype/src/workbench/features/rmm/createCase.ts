// New case (WORKBENCH-DESIGN.md §8.3; brd L781 step 0): pure builders plus the create sequence on an actions layer.
//
//   1. client checks (nothing is created on a problem): the inputs, a supplier, the contact rule (at least one
//      selected contact can confirm AND has a portal user id), a pinned release, the BASIC Section definition.
//      createProcessItem then checks mandatoryAt(CASE_S0) minus POST_CREATE_KEYS before any create (S07);
//   2. createProcessItem(CIQ_Case_A00, data, { postCreate }) — create at Start, the full payload read back and
//      re-applied, Case_Code = CIQ-<yyyy>-<_id> and Request_Key = <Case_Code>-C1-REQ written at Start, the full S0
//      check, submit;
//   3. ONLY THEN createFormRow(CIQ_Section_A00, BASIC);
//   4. writeAudit("Item created", case.created) with the case header in Snapshot_JSON (the case index, §6.2);
//   5. the caller navigates to the case.
// If 3 or 4 fails, the case exists: the case detail offers "Finish setup" (finishSetup), which creates only the
// missing rows, idempotently by key.
// Reactivation (brd L857; TK15): same Case_Code, Cycle_No + 1, Reactivates_Case_Item = the old _id, within Settings
// reactivationDays of the Cancellation event.
import { listValues } from "../../schema";
import { caseCode as caseCodeOf, requestKey, sectionItemKey } from "../../domain/keys";
import { parseOwnership, parseSectionDefinition, parseTemplate, type PinnedConfig, type SettingsPayload } from "../../domain/config";
import { caseHeaderSnapshot } from "../../data/map";
import { addDays } from "../../data/normalize";
import type { Actions } from "../../data/actions";
import type { AuditInput, AuditVM, CaseVM, ConfigVM, ContactVM, Problem, SupplierVM } from "../../data/viewModels";

export const CASE_FLOW = "CIQ_Case_A00" as const;
export const SECTION_FLOW = "CIQ_Section_A00" as const;
export const BASIC = "BASIC";

// ---------------------------------------------------------------- config for a new case

export interface NewCaseConfig {
  release: ConfigVM;
  settings: SettingsPayload;
  /** "<configKey>@<Version_Label>" of the Template, or "" when the release has none. */
  templateLabel: string;
  /** The BASIC Section definition: payload row, parsed code/title/sort, manifest hash and key. */
  basic: { row: ConfigVM; code: string; title: string; sort: number; hash: string; configKey: string; applicability: string; lead: string; queryOwner: string; co: string[] } | null;
  problems: string[];
}

/** The pinned config a new case needs (§8.3 Reads). */
export function newCaseConfigFrom(pinned: PinnedConfig | null): NewCaseConfig | null {
  if (!pinned) return null;
  const problems = [...pinned.problems];
  const entries = pinned.manifest;
  const rowOf = (configKey: string) => pinned.rows.get(configKey) ?? null;
  const tplEntry = entries.find((e) => e.kind === "Template");
  const tplRow = tplEntry ? rowOf(tplEntry.configKey) : null;
  const tpl = tplRow ? parseTemplate(tplRow.payloadJson) : null;
  const templateLabel = tplEntry ? [tplEntry.configKey, tplRow?.versionLabel].filter(Boolean).join("@") : "";
  let basic: NewCaseConfig["basic"] = null;
  for (const e of entries.filter((x) => x.kind === "Section definition")) {
    const row = rowOf(e.configKey);
    if (!row) continue;
    const p = parseSectionDefinition(row.payloadJson);
    if (p.ok && p.value.sectionKey === BASIC) {
      const ownEntry = entries.find((x) => x.kind === "Section ownership");
      const ownRow = ownEntry ? rowOf(ownEntry.configKey) : null;
      const own = ownRow ? parseOwnership(ownRow.payloadJson) : null;
      const o = own?.ok ? own.value.owners[BASIC] : undefined;
      basic = {
        row,
        code: p.value.code,
        title: p.value.title,
        sort: p.value.sort,
        hash: e.contentHash,
        configKey: e.configKey,
        applicability: (tpl?.ok ? tpl.value.sections.find((s) => s.sectionKey === BASIC)?.default : undefined) ?? "Mandatory",
        lead: o?.lead ?? "",
        queryOwner: o?.queryOwner ?? "",
        co: o?.co ?? [],
      };
    }
  }
  if (!basic) problems.push("The pinned release has no Section definition for BASIC, so the basic-data section cannot be created.");
  return { release: pinned.release, settings: pinned.settings, templateLabel, basic, problems };
}

// ---------------------------------------------------------------- inputs

export interface NewCaseInput {
  supplier: SupplierVM | null;
  /** Selected contact row ids (ContactVM._id). */
  contactIds: string[];
  tradeName: string;
  mainInci: string;
  bdfMaterialNo: string;
  sapMaterialNo: string;
  irmaRef: string;
  caseTitle: string;
  targetMarketsText: string;
  marketsLabel: string;
  /** YYYY-MM-DD */
  supplierDueDate: string;
  overallApprovalRequired: boolean;
  isTest: boolean;
}
export interface Reactivation {
  /** The cancelled case being reactivated. */
  from: Pick<CaseVM, "_id" | "caseCode" | "cycleNo">;
}

export function defaultNewCaseInput(now: Date, settings: SettingsPayload | null): NewCaseInput {
  return {
    supplier: null,
    contactIds: [],
    tradeName: "",
    mainInci: "",
    bdfMaterialNo: "",
    sapMaterialNo: "",
    irmaRef: "",
    caseTitle: "",
    targetMarketsText: "",
    marketsLabel: "",
    supplierDueDate: addDays(now, settings?.defaultSupplierDueDays ?? 14),
    overallApprovalRequired: settings?.overallApprovalRequired ?? false,
    isTest: false,
  };
}

/** Active contacts of a supplier, with the portal warning (§8.3). */
export function contactChoices(s: SupplierVM | null): { contact: ContactVM; warning?: string }[] {
  return (s?.contacts ?? [])
    .filter((c) => c.active)
    .map((c) => ({ contact: c, warning: c.portalUserId ? undefined : "not invited to the portal yet" }));
}

export interface DerivedContacts {
  Portal_Contact_Ids: string;
  Confirm_Contact_Ids: string;
  Supplier_Contact_Emails: string;
  Case_Contacts_JSON: string;
}
/** BR-025/BR-026 derived contact fields (comma-separated [convention, §4.6]; the X1 format is unverified). */
export function deriveContacts(selected: ContactVM[]): DerivedContacts {
  const portal = selected.filter((c) => c.portalUserId).map((c) => c.portalUserId);
  const confirm = selected.filter((c) => c.canConfirm && c.portalUserId).map((c) => c.portalUserId);
  return {
    Portal_Contact_Ids: portal.join(","),
    Confirm_Contact_Ids: confirm.join(","),
    Supplier_Contact_Emails: selected.map((c) => c.email).filter(Boolean).join(","),
    Case_Contacts_JSON: JSON.stringify(selected.map((c) => ({ name: c.fullName, email: c.email, role: c.role, canConfirm: c.canConfirm, portalUserId: c.portalUserId || null }))),
  };
}

const p = (field: string, label: string, message: string): Problem => ({ field, label, message });

/** Client checks before any create (§8.3 Sequence 1). Case_Code and Request_Key are never listed (POST_CREATE_KEYS). */
export function newCaseProblems(i: NewCaseInput, cfg: NewCaseConfig | null): Problem[] {
  const out: Problem[] = [];
  if (!i.supplier) out.push(p("Supplier_Code", "Supplier", "Choose a supplier."));
  if (!i.tradeName.trim()) out.push(p("Trade_Name", "Trade name", "Trade name is required."));
  if (!i.mainInci.trim()) out.push(p("Main_INCI", "Main INCI", "Main INCI is required."));
  if (!i.bdfMaterialNo.trim()) out.push(p("BDF_Material_No", "BDF material no", "BDF material no is required."));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.supplierDueDate)) out.push(p("Supplier_Due_Date", "Supplier due date", "Supplier due date is required."));
  const selected = (i.supplier?.contacts ?? []).filter((c) => i.contactIds.includes(c._id) && c.active);
  if (i.supplier && !selected.length) out.push(p("Portal_Contact_Ids", "Contacts", "Select at least one supplier contact."));
  else if (i.supplier && !selected.some((c) => c.canConfirm && c.portalUserId))
    out.push(p("Confirm_Contact_Ids", "Contacts", "At least one selected contact must be allowed to confirm and have a portal user id (as given by portal user management)."));
  if (!cfg) out.push(p("Release_Item_Id", "Configuration", "No published release is pinned for new cases (Release stage Live, or Test for a test case)."));
  else for (const m of cfg.problems) out.push(p("Release_Manifest_JSON", "Configuration", m));
  return out;
}

/** The S0 data of the case (§8.3 Inputs, Defaults, Derived). Case_Code/Request_Key come after the create, except on
 *  a reactivation, where they are known (same Case_Code, next cycle). */
export function buildCaseData(i: NewCaseInput, cfg: NewCaseConfig, me: { _id: string; Name: string; Email: string }, re?: Reactivation): Record<string, unknown> {
  const selected = (i.supplier?.contacts ?? []).filter((c) => i.contactIds.includes(c._id) && c.active);
  const cycle = re ? (re.from.cycleNo ?? 1) + 1 : 1;
  const opt = (s: string) => (s.trim() ? s.trim() : undefined);
  const data: Record<string, unknown> = {
    Cycle_No: cycle,
    Trade_Name: i.tradeName.trim(),
    Main_INCI: i.mainInci.trim(),
    BDF_Material_No: i.bdfMaterialNo.trim(),
    SAP_Material_No: opt(i.sapMaterialNo),
    IRMA_Ref: opt(i.irmaRef),
    Case_Title: opt(i.caseTitle),
    Target_Markets_Text: opt(i.targetMarketsText),
    Markets_Label: opt(i.marketsLabel),
    Supplier_Code: i.supplier?.code ?? "",
    Supplier_Legal_Name: i.supplier?.legalName ?? "",
    Owner_RMM: { _id: me._id },
    BDF_Contact_Name: me.Name,
    BDF_Contact_Email: me.Email,
    Supplier_Due_Date: i.supplierDueDate,
    ...deriveContacts(selected),
    Release_Item_Id: cfg.release._id,
    Release_Key: opt(cfg.release.releaseKey),
    Manifest_Hash: cfg.release.manifestHash,
    Release_Manifest_JSON: cfg.release.releaseManifestJson,
    Template_Label: opt(cfg.templateLabel),
    Overall_Approval_Required: i.overallApprovalRequired ? "Yes" : "No",
    Case_Test: i.isTest ? "Yes" : "No",
  };
  if (re) {
    data.Case_Code = re.from.caseCode;
    data.Request_Key = requestKey(re.from.caseCode, cycle);
    data.Reactivates_Case_Item = re.from._id;
  }
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
}

/** The _id-derived Start keys (POST_CREATE_KEYS): Case_Code = CIQ-<yyyy>-<_id> (brd L735), Request_Key = …-C1-REQ. */
export function postCreateKeys(instanceId: string, now: Date, re?: Reactivation): { Case_Code: string; Request_Key: string } {
  if (re) {
    const cycle = (re.from.cycleNo ?? 1) + 1;
    return { Case_Code: re.from.caseCode, Request_Key: requestKey(re.from.caseCode, cycle) };
  }
  const code = caseCodeOf(now.getUTCFullYear(), instanceId);
  return { Case_Code: code, Request_Key: requestKey(code, 1) };
}

/** The BASIC F3 row (§8.3 step 5). */
export function buildBasicSection(fields: Record<string, unknown>, caseId: string, cfg: NewCaseConfig): Record<string, unknown> {
  const b = cfg.basic;
  if (!b) throw new Error("The pinned release has no Section definition for BASIC.");
  const code = String(fields.Case_Code ?? "");
  const cycle = Number(fields.Cycle_No ?? 1);
  const row: Record<string, unknown> = {
    Section_Item_Key: sectionItemKey(code, cycle, BASIC),
    Section_Key: BASIC,
    Section_Code: b.code,
    Section_Title: b.title,
    Section_Sort: b.sort,
    Applicability_Label: b.applicability,
    Section_Origin: "Template",
    Definition_JSON: b.row.payloadJson,
    Definition_Hash: b.hash,
    Section_Def_Key: b.configKey,
    Source_Content_Hash: b.hash,
    Case_Code: code,
    Cycle_No: cycle,
    Case_Item_Id: caseId,
    Supplier_Code: fields.Supplier_Code,
    Supplier_Due_Date: fields.Supplier_Due_Date,
    Portal_Contact_Ids: fields.Portal_Contact_Ids,
    // F7: list values only (as at S2, scope.ts): a value outside the list is left out instead of being dropped by Kissflow
    Lead_Dept: listValues("CIQ_Department").includes(b.lead) ? b.lead : undefined,
    Query_Owner_Dept: listValues("CIQ_Review_Dept").includes(b.queryOwner) ? b.queryOwner : undefined,
    Co_Review_Depts: b.co.filter((x) => listValues("CIQ_Review_Dept").includes(x)).join(",") || undefined,
  };
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined && v !== ""));
}

/** The F8 "Item created" event (§7.8): the case header in Snapshot_JSON feeds the case index (§6.2). */
export function buildCreatedEvent(fields: Record<string, unknown>, caseId: string): AuditInput {
  const code = String(fields.Case_Code ?? "");
  return {
    category: "Item created",
    actionCode: "case.created",
    caseCode: code,
    cycleNo: Number(fields.Cycle_No ?? 1),
    caseItemId: caseId,
    objectKind: "Case",
    objectItemId: caseId,
    objectKey: code,
    snapshot: caseHeaderSnapshot(fields),
  };
}

// ---------------------------------------------------------------- the sequence

export type CreateCaseDeps = Pick<Actions, "createProcessItem" | "createFormRow" | "writeAudit"> & { now(): Date; me: { _id: string; Name: string; Email: string } };

export interface SetupStatus {
  section: "created" | "exists" | "failed" | "skipped";
  audit: "created" | "exists" | "failed" | "skipped";
  messages: string[];
}
export interface CreateCaseResult {
  instanceId: string;
  caseCode: string;
  setup: SetupStatus;
}

/** Runs the §8.3 sequence. Throws (ActionError from the actions layer, or Error with problems) when the CASE itself
 *  was not created; setup failures after the case exists are reported in `setup`, never thrown. */
export async function createCase(deps: CreateCaseDeps, input: NewCaseInput, cfg: NewCaseConfig, o: { reactivate?: Reactivation; draft?: { instanceId: string; activityInstanceId: string } } = {}): Promise<CreateCaseResult> {
  const problems = newCaseProblems(input, cfg);
  if (problems.length) throw Object.assign(new Error(`Nothing was created. ${problems.map((x) => x.message).join(" ")}`), { problems });
  const now = deps.now();
  const data = buildCaseData(input, cfg, deps.me, o.reactivate);
  const { instanceId } = await deps.createProcessItem(CASE_FLOW, data, {
    postCreate: (draft) => ({ fields: { ...postCreateKeys(draft.instanceId, now, o.reactivate) } }),
    draft: o.draft,
  });
  const fields = { ...data, ...postCreateKeys(instanceId, now, o.reactivate) };
  const setup = await finishSetup(deps, fields, instanceId, cfg, { sectionExists: false, auditExists: false });
  return { instanceId, caseCode: String(fields.Case_Code), setup };
}

/**
 * Creates the rows a new case still lacks (§8.3 steps 5–6), idempotently: a row that exists (by key) is skipped.
 * The section comes first; the audit row is written even when the section failed (it records the case itself).
 */
export async function finishSetup(
  deps: Pick<CreateCaseDeps, "createFormRow" | "writeAudit">,
  fields: Record<string, unknown>,
  caseId: string,
  cfg: NewCaseConfig | null,
  have: { sectionExists: boolean; auditExists: boolean },
): Promise<SetupStatus> {
  const s: SetupStatus = { section: "skipped", audit: "skipped", messages: [] };
  if (have.sectionExists) s.section = "exists";
  else if (!cfg?.basic) {
    s.section = "failed";
    s.messages.push("The BASIC section could not be created: the pinned release has no BASIC Section definition.");
  } else
    try {
      await deps.createFormRow(SECTION_FLOW, buildBasicSection(fields, caseId, cfg), "Section_Item_Key");
      s.section = "created";
    } catch (e) {
      s.section = "failed";
      s.messages.push(`The BASIC section was not created: ${e instanceof Error ? e.message : String(e)}`);
    }
  if (have.auditExists) s.audit = "exists";
  else
    try {
      await deps.writeAudit(buildCreatedEvent(fields, caseId));
      s.audit = "created";
    } catch (e) {
      s.audit = "failed";
      s.messages.push(`The "Item created" event was not recorded: ${e instanceof Error ? e.message : String(e)}`);
    }
  return s;
}

/** What Finish setup would create for an existing case (null = nothing missing, or not decidable). */
export function setupGaps(c: Pick<CaseVM, "_id" | "caseCode" | "cycleNo">, sections: { sectionItemKey: string }[], events: Pick<AuditVM, "actionCode" | "caseItemId">[], complete: { sections: boolean; events: boolean }): { section: boolean; audit: boolean } | null {
  if (!complete.sections || !complete.events || !c.caseCode) return null;
  const key = sectionItemKey(c.caseCode, c.cycleNo ?? 1, BASIC);
  const section = !sections.some((s) => s.sectionItemKey === key);
  const audit = !events.some((e) => e.actionCode === "case.created" && e.caseItemId === c._id);
  return section || audit ? { section, audit } : null;
}

/** The S0 header fields of an existing case (for Finish setup and the snapshot), from its read values. */
export function caseFieldsOf(c: CaseVM): Record<string, unknown> {
  return { ...c.v };
}

// ---------------------------------------------------------------- reactivation (brd L857)

/** The newest F8 Cancellation event of a case. */
export function cancellationOf(events: AuditVM[], caseId: string): AuditVM | null {
  return events.filter((e) => e.category === "Cancellation" && e.caseItemId === caseId).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] ?? null;
}

/** Why a cancelled case can NOT be reactivated now (null = it can). */
export function reactivationBlocker(c: Pick<CaseVM, "cancelled" | "_id">, events: AuditVM[], settings: Pick<SettingsPayload, "reactivationDays">, now: Date): string | null {
  if (!c.cancelled) return "Only a cancelled case can be reactivated.";
  const ev = cancellationOf(events, c._id);
  if (!ev) return "No cancellation event is recorded for this case, so the reactivation period cannot be checked.";
  const at = new Date(ev.at);
  if (isNaN(at.getTime())) return "The cancellation event has no readable time.";
  const limit = at.getTime() + settings.reactivationDays * 86400000;
  if (now.getTime() > limit) return `The reactivation period (${settings.reactivationDays} days after the cancellation) has ended.`;
  return null;
}

/** Prefill for a reactivation from the cancelled case's read fields (the snapshot prefill is deferred, §13.1). */
export function reactivationInput(c: CaseVM, supplier: SupplierVM | null, now: Date, settings: SettingsPayload | null): NewCaseInput {
  const base = defaultNewCaseInput(now, settings);
  return {
    ...base,
    supplier,
    contactIds: [],
    tradeName: c.tradeName,
    mainInci: c.mainInci,
    bdfMaterialNo: c.bdfMaterialNo,
    sapMaterialNo: c.sapMaterialNo,
    irmaRef: c.irmaRef,
    caseTitle: c.title,
    targetMarketsText: c.targetMarketsText,
    marketsLabel: c.marketsLabel,
    overallApprovalRequired: c.overallApprovalRequired,
    isTest: c.isTest,
  };
}
