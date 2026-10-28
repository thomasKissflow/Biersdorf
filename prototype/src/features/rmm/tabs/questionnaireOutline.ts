// The outline of the case Questionnaire tab: every section in scope (plus the metadata block) with its group, status
// and markers, and the filters of the summary bar. Pure: the tab renders it, the unit test checks it.
import { CONFIG_QUESTIONS, fieldOf, fieldsOf, sectionOf } from "@/domain/catalog";
import { slotsIn } from "@/domain/requestedDocs";
import { REQUIRED_CONFIG, activeSections, isConfigAnswered, sectionProgress, sectionsChangedSince } from "@/domain/selectors";
import type { CiqCase, OpenPoint, ScopeItem } from "@/domain/types";

/** The metadata block (SF-01 to SF-12) is listed like a section; "SF" is the id the supplier's questionnaire uses. */
export const METADATA_ID = "SF";
/** The scope and evidence overview. */
export const SCOPE_ID = "scope";

export type OutlineGroup = "basic" | "metadata" | "chapter" | "annex";
export const GROUP_LABEL: Record<OutlineGroup, string> = { basic: "Basic data", metadata: "Metadata", chapter: "Chapters", annex: "Annexes" };
export const GROUPS: OutlineGroup[] = ["basic", "metadata", "chapter", "annex"];

/**
 * complete: every required answer and requested document is there; missing: some are not; optional: nothing is
 * required (an optional section, or only optional questions apply); docs: documents only, never blocking.
 */
export type OutlineStatus = "complete" | "missing" | "optional" | "docs";

export interface OutlineItem {
  id: string;
  group: OutlineGroup;
  status: OutlineStatus;
  /** Required answers and requested documents given / asked for. */
  done: number;
  total: number;
  /** Unresolved open points on the section (or, for the metadata block, on a metadata question). */
  ops: OpenPoint[];
  /** The supplier changed an answer or a document after the completeness confirmation. */
  changed: boolean;
  /** Documents uploaded to the section. */
  docs: number;
  /** The scope entry (none for the metadata block). */
  sc?: ScopeItem;
}

export type OutlineFilter = "all" | "missing" | "points" | "changed" | "na";

export interface Outline {
  items: OutlineItem[];
  /** The sections that do not apply, with their rule reasons (internal only). */
  na: ScopeItem[];
  /** The completeness confirmation: changes after it are marked. */
  since?: string;
  counts: Record<OutlineFilter, number>;
}

const isMetadataKey = (k: string) => /^SF\d\d$/.test(k);

/** Whether a section has questions in the case's questionnaire version (spec §8.1) or requested documents; otherwise it
 *  is answered with documents only. */
export const hasContent = (c: CiqCase, sectionId: string) => fieldsOf(sectionId, c.templateVersion).length > 0 || sectionId === "K2.1" || slotsIn(c, sectionId).length > 0;

export function groupOf(c: CiqCase, sectionId: string): OutlineGroup {
  if (sectionId === METADATA_ID) return "metadata";
  const kind = sectionOf(sectionId, c.templateVersion)?.kind;
  return kind === "annex" ? "annex" : kind === "basic" ? "basic" : "chapter";
}

export function buildOutline(c: CiqCase): Outline {
  const since = c.confirmations.filter((x) => x.type === "completeness").at(-1)?.at;
  const t = since ? Date.parse(since) : NaN;
  const after = (at?: string) => !!since && !!at && Date.parse(at) > t;
  // sectionsChangedSince counts a changed metadata answer under GEN; here the metadata block carries it itself.
  const changedSet = new Set(sectionsChangedSince(c, since));
  const unresolved = c.openPoints.filter((p) => p.status !== "closed");

  const sectionItem = (sc: ScopeItem): OutlineItem => {
    const id = sc.sectionId;
    const docs = c.documents.filter((d) => d.sectionId === id).length;
    const ops = unresolved.filter((p) => p.ref.sectionId === id && !(p.ref.fieldId && isMetadataKey(p.ref.fieldId)));
    let changed = changedSet.has(id);
    if (changed && id === "GEN") changed = Object.entries(c.answeredBy).some(([k, v]) => after(v.at) && !isMetadataKey(k) && fieldOf(k, c.templateVersion)?.sectionId === "GEN") || c.documents.some((d) => d.sectionId === "GEN" && after(d.uploadedAt));
    if (!hasContent(c, id)) return { id, group: groupOf(c, id), status: "docs", done: 0, total: 0, ops, changed, docs, sc };
    const p = sectionProgress(c, id);
    const status: OutlineStatus = p.total === 0 ? "optional" : p.done < p.total ? "missing" : "complete";
    return { id, group: groupOf(c, id), status, done: p.done, total: p.total, ops, changed, docs, sc };
  };

  const active = activeSections(c);
  const metaDone = REQUIRED_CONFIG.filter((k) => isConfigAnswered(c, k)).length;
  const metadata: OutlineItem = {
    id: METADATA_ID,
    group: "metadata",
    status: metaDone < REQUIRED_CONFIG.length ? "missing" : "complete",
    done: metaDone,
    total: REQUIRED_CONFIG.length,
    ops: unresolved.filter((p) => !!p.ref.fieldId && isMetadataKey(p.ref.fieldId)),
    changed: CONFIG_QUESTIONS.some((q) => after(c.answeredBy[q.id]?.at)),
    docs: 0,
  };
  const sections = active.map(sectionItem);
  // Basic data first, then the metadata block, chapters and annexes; questionnaire order within each group.
  const items = GROUPS.flatMap((g) => (g === "metadata" ? [metadata] : sections.filter((s) => s.group === g)));
  const na = c.scope.filter((s) => s.applicability === "na");
  const counts: Record<OutlineFilter, number> = {
    all: active.length,
    missing: items.filter((i) => i.status === "missing").length,
    points: items.filter((i) => i.ops.length > 0).length,
    changed: items.filter((i) => i.changed).length,
    na: na.length,
  };
  return { items, na, since, counts };
}

export const matchesFilter = (i: OutlineItem, f: OutlineFilter) => f === "all" || (f === "missing" ? i.status === "missing" : f === "points" ? i.ops.length > 0 : f === "changed" ? i.changed : false);

/** The section ids in the order the navigator lists them, for Previous / Next. */
export const navOrder = (o: Outline, f: OutlineFilter): string[] => (f === "na" ? o.na.map((s) => s.sectionId) : o.items.filter((i) => matchesFilter(i, f)).map((i) => i.id));
