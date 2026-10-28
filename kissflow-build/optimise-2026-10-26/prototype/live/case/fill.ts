// The supplier's fill-in for S-CASE step 4: the answers a supplier gives so that "Check completeness" finds nothing
// missing, worked out from the portal's OWN view of the request (portal/data/map.ts caseOfRequest, the domain's
// completenessBlockers), as a person at the screen would: the metadata answers first (they open the sections), then a
// value per missing field, a justification where a value is not possible (file fields: the live suite uploads no files;
// a value the field's check refuses), one component row. The patch is saved by the portal's own writer (patchRequest).
// A requested document can only be uploaded, so it is reported as unfillable (the run's metadata avoid them).
import { fieldOf } from "@/domain/catalog";
import { isSlotKey } from "@/domain/requestedDocs";
import { completenessBlockers, type Blocker } from "@/domain/selectors";
import type { AnswerValue, ComponentRow, ConfigAnswers, FieldDef } from "@/domain/types";
import { applyPatch, docFields, readDoc, type AnswerPatch, type Who } from "@/portal/data/answers";
import { caseOfRequest, writableAnswer, type CaseBundle } from "@/portal/data/map";
import type { RawItem } from "@/portal/data/raw";

/** A value the field accepts (texts carry the run tag). */
function valueFor(f: FieldDef, text: (s: string) => string): AnswerValue {
  switch (f.type) {
    case "email":
      return "qa@zzt-n21.example";
    case "number":
      return 1;
    case "decimal":
      return 0.5;
    case "range":
      return { min: 1, max: 2 };
    case "yesno":
      return false;
    case "single":
      return f.options?.[0]?.value ?? text("value");
    case "multi":
      return [f.options?.[0]?.value ?? text("value")];
    case "longtext":
      return text("Described in the supplier's statement.");
    default:
      return text("Test value");
  }
}

/** The request as the portal would hold it after saving `patch` (saveRequest's own merge). */
function after(request: RawItem, patch: AnswerPatch, who: Who): RawItem {
  const doc = applyPatch(readDoc(request), patch, who, new Date().toISOString());
  return { ...request, ...docFields(doc, patch) };
}

/** What still blocks the completeness on the request after `patch`, as the portal shows it. */
export function blockersAfter(b: CaseBundle, request: RawItem, patch: AnswerPatch, who: Who): Blocker[] {
  const { c, config } = caseOfRequest(b, after(request, patch, who), who);
  return completenessBlockers(c, config);
}

export interface Fill {
  patch: AnswerPatch;
  /** Blockers no answer can clear (requested documents need an upload). */
  unfillable: Blocker[];
  /** What the patch sets, justifies and adds, for the evidence. */
  summary: { config: string[]; set: string[]; just: string[]; components: number };
}

export function fillPatch(b: CaseBundle, request: RawItem, who: Who, config: ConfigAnswers, text: (s: string) => string): Fill {
  const patch: AnswerPatch = { config: { ...config }, set: {}, just: {} };
  delete patch.config!.SF11; // Beiersdorf's (B-05)
  const tried = new Set<string>();
  const unfillable: Blocker[] = [];
  for (let round = 0; round < 8; round++) {
    const { c, config: cfg } = caseOfRequest(b, after(request, patch, who), who);
    const blockers = completenessBlockers(c, cfg);
    if (!blockers.length) break;
    for (const bl of blockers) {
      const id = bl.fieldId;
      if (!id) {
        if (bl.sectionId === "K2.1") {
          const origin = (config.SF01 ?? ["vegetable"])[0]!;
          const row: ComponentRow = { id: "c1", inci: c.inci || "Aqua", fn: "emollient", additive: false, origin, concMin: 99, concMax: 100, cas: "8001-25-0" };
          patch.components = [row];
        } else if (!unfillable.includes(bl)) unfillable.push(bl);
        continue;
      }
      if (/^SF\d\d$/.test(id)) continue; // answered by `config`; a metadata question still open stays a blocker
      if (isSlotKey(id)) {
        if (!unfillable.some((x) => x.fieldId === id)) unfillable.push(bl);
        continue;
      }
      const f = fieldOf(id, c.templateVersion, cfg);
      if (!f || tried.has(id) || id === "FLD-5.1-002" || !writableAnswer(id, c.templateVersion, cfg)) {
        delete patch.set![id];
        patch.just![id] = text("Not available for this material; statement on request.");
        continue;
      }
      tried.add(id);
      patch.set![id] = valueFor(f, text);
    }
  }
  return {
    patch,
    unfillable: unfillable.filter((x) => blockersAfter(b, request, patch, who).some((y) => y.label === x.label)),
    summary: { config: Object.keys(patch.config ?? {}), set: Object.keys(patch.set ?? {}), just: Object.keys(patch.just ?? {}), components: patch.components?.length ?? 0 },
  };
}
