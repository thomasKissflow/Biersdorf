// T1 test fixtures (imported by T1 specs only; never by the app, so never bundled). Fictional suppliers and people,
// @example.test e-mails (ground rule 11). Pure data builders: no test kit import (guards.spec.ts).
import { loadPinnedConfig, type PinnedConfig } from "../../domain/config";
import { toCaseVM, toConfigVM, toPointVM, toSupplierVM } from "../../data/map";
import type { CaseVM, ConfigVM, PointVM, RawItem, SupplierVM } from "../../data/viewModels";

export const T1_ME = { _id: "UsAlex01", Name: "Alex Rivera", Email: "alex@example.test" };

export function supplierFixture(): SupplierVM {
  return toSupplierVM({
    _id: "FmSup01",
    Supplier_Code: "SUP-NWB",
    Supplier_Legal_Name: "Northwind Botanicals GmbH",
    Supplier_Country_Code: "DE",
    Supplier_Active: "Yes",
    "Table::Contacts": [
      { _id: "Contacts_aaaaaaaaa1", Contacts_Full_Name: "Mira Castell", Contacts_Email: "mira.castell@example.test", Contacts_Role: "Quality", Contacts_Can_Confirm: "Yes", Contacts_Portal_User_Id: "PuMira01", Contacts_Active: "Yes" },
      { _id: "Contacts_aaaaaaaaa2", Contacts_Full_Name: "Teo Brandt", Contacts_Email: "teo.brandt@example.test", Contacts_Role: "Regulatory", Contacts_Can_Confirm: "Yes", Contacts_Portal_User_Id: "PuTeo01", Contacts_Active: "Yes" },
      { _id: "Contacts_aaaaaaaaa3", Contacts_Full_Name: "Ines Varga", Contacts_Email: "ines.varga@example.test", Contacts_Role: "Sales", Contacts_Can_Confirm: "No", Contacts_Portal_User_Id: "", Contacts_Active: "Yes" },
    ],
  } as RawItem);
}

const cfgRow = (id: string, f: Record<string, unknown>): ConfigVM => toConfigVM({ _id: id, Config_State: "Published", ...f } as RawItem);

export interface ConfigFixture {
  rows: ConfigVM[];
  release: ConfigVM;
}
/**
 * A Published Live release: Template of 6 sections (BASIC, GEN, K2.1, SAF-A, REG-B, SUS-1), their definitions,
 * ownership, a Text bundle and Settings. No "Rule set" entry unless `ruleSet` is set.
 */
export function configFixture(o: { deptReviewMode?: boolean; ruleSet?: boolean; noBasicDef?: boolean } = {}): ConfigFixture {
  const sections: [string, string, string, number, string, string][] = [
    ["BASIC", "K1", "Basic data", 1, "Mandatory", "RMM"],
    ["GEN", "K2", "General", 2, "Mandatory", "QM"],
    ["K2.1", "K2.1", "Composition", 3, "Mandatory", "REG"],
    ["SAF-A", "S-A", "Safety data", 4, "Mandatory", "SAF"],
    ["REG-B", "R-B", "Regulatory status", 5, "Optional", "REG"],
    ["SUS-1", "SU1", "Sustainability", 6, "N.A.", "SUS"],
  ];
  const rows: ConfigVM[] = [];
  const manifest: { configKey: string; kind: string; itemId: string; contentHash: string; sectionKey?: string }[] = [];
  const add = (id: string, kind: string, key: string, payload: unknown, extra: Record<string, unknown> = {}) => {
    rows.push(cfgRow(id, { Config_Key: key, Config_Kind: kind, Version_Label: "1.0", Payload_JSON: JSON.stringify(payload), ...extra }));
    manifest.push({ configKey: key, kind, itemId: id, contentHash: `hash-${key}` });
  };
  add("FmTpl", "Template", "template-default-v1", { sections: sections.map(([k, , , , def]) => ({ sectionKey: k, default: def })) });
  for (const [k, code, title, sort] of sections) {
    if (k === "BASIC" && o.noBasicDef) continue;
    add(`FmDef${code}`, "Section definition", `section-definition-${k}-v1`, { sectionKey: k, code, title, sort, fields: [{ key: "f1", label: "Field 1", type: "Text", required: true }] }, { Section_Key: k });
  }
  add("FmOwn", "Section ownership", "section-ownership-default-v1", { owners: Object.fromEntries(sections.map(([k, , , , , lead]) => [k, { lead, co: k === "K2.1" ? ["SAF"] : [], queryOwner: lead === "RMM" ? "RMM" : lead }])) });
  add("FmTxt", "Text bundle", "text-bundle-default-v1", { texts: { "completeness.declaration": "We confirm the questionnaire is complete.", "final-release.declaration": "We release the final answers.", "closing.neutral": "Thank you for your answers." } });
  add("FmSet", "Settings", "settings-default-v1", { deptReviewMode: !!o.deptReviewMode, overallApprovalRequired: false, defaultSupplierDueDays: 14, reactivationDays: 365 });
  if (o.ruleSet) add("FmRule", "Rule set", "rule-set-default-v3", { rules: [] }, { Version_Label: "3.2" });
  const release = cfgRow("FmRel01", {
    Config_Key: "release-REL-20261001-1",
    Config_Kind: "Release",
    Release_Key: "REL-20261001-1",
    Release_Stage: "Live",
    Release_Manifest_JSON: JSON.stringify(manifest),
    Manifest_Hash: "mhash-0001",
    Published_At: "2026-10-01T08:00:00Z",
  });
  rows.push(release);
  return { rows, release };
}

export async function pinnedFixture(o: Parameters<typeof configFixture>[0] = {}): Promise<PinnedConfig> {
  const f = configFixture(o);
  const p = await loadPinnedConfig(f.rows, f.release._id);
  if (!p) throw new Error("fixture: no pinned config");
  return p;
}

/** A case VM with the given raw fields (read "full"). */
export function caseFixture(f: Record<string, unknown> = {}, id = "PkCase01"): CaseVM {
  return toCaseVM(
    {
      _id: id,
      _status: "In progress",
      Case_Code: `CIQ-2026-${id}`,
      Cycle_No: 1,
      Trade_Name: "Lumen Calendula Extract",
      Main_INCI: "Calendula Officinalis Flower Extract",
      BDF_Material_No: "BDF-100200",
      Supplier_Code: "SUP-NWB",
      Supplier_Legal_Name: "Northwind Botanicals GmbH",
      Supplier_Due_Date: "2026-10-22",
      Portal_Contact_Ids: "PuMira01,PuTeo01",
      Confirm_Contact_Ids: "PuMira01,PuTeo01",
      Supplier_Contact_Emails: "mira.castell@example.test,teo.brandt@example.test",
      Release_Item_Id: "FmRel01",
      ...f,
    } as RawItem,
    "full",
    { trustStep: true },
  );
}

export function pointFixture(f: Record<string, unknown>, id: string): PointVM {
  return toPointVM({ _id: id, _status: "Completed", ...f } as RawItem, "full");
}
