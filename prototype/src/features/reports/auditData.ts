// Audit-trail view-models: one flat, filterable list of every audit event across all cases, plus the global
// supplier-master and configuration log (who changed a supplier, a contact, a rule-set version, ownership or a reminder).
import { supplierName, userById } from "@/domain/selectors";
import type { AppState, AuditEvent } from "@/domain/types";

export type EventSide = "internal" | "supplier" | "system";
export type EventArea = "case" | "supplier" | "config";

export const AREA_LABEL: Record<EventArea, string> = { case: "Cases", supplier: "Supplier master", config: "Configuration" };

export interface FlatEvent extends AuditEvent {
  area: EventArea;
  /** "" for supplier-master and configuration events. */
  caseId: string;
  /** The case's material; for a supplier-master event the supplier's name. */
  material: string;
  supplierId?: string;
  side: EventSide;
  who: string;
  org: string; // "Beiersdorf", the supplier's name, or "Automatic"
}

function whoOf(state: AppState, by: string) {
  const u = by === "system" ? undefined : userById(state, by);
  const side: EventSide = by === "system" ? "system" : (u?.side ?? "internal");
  return {
    side,
    who: by === "system" ? "System" : (u?.name ?? by),
    org: side === "system" ? "Automatic" : side === "supplier" ? supplierName(state, u?.supplierId ?? "") : "Beiersdorf",
  };
}

export function flattenAudit(state: AppState): FlatEvent[] {
  const caseEvents = state.cases.flatMap((c) => c.audit.map<FlatEvent>((a) => ({ ...a, area: "case", caseId: c.id, material: c.materialName, ...whoOf(state, a.by) })));
  const logEvents = (state.log ?? []).map<FlatEvent>((l) => ({
    id: l.id,
    at: l.at,
    by: l.by,
    action: l.action,
    detail: l.detail,
    area: l.kind === "supplier" ? "supplier" : "config",
    caseId: "",
    material: l.kind === "supplier" && l.supplierId ? supplierName(state, l.supplierId) : "",
    supplierId: l.supplierId,
    ...whoOf(state, l.by),
  }));
  return [...caseEvents, ...logEvents].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}

export interface AuditFilters {
  q: string;
  caseId: string;
  person: string;
  action: string;
  side: "" | EventSide;
  area: "" | EventArea;
}

export const EMPTY_FILTERS: AuditFilters = { q: "", caseId: "", person: "", action: "", side: "", area: "" };

export const isFiltered = (f: AuditFilters) => !!(f.q.trim() || f.caseId || f.person || f.action || f.side || f.area);

export function filterEvents(events: FlatEvent[], f: AuditFilters): FlatEvent[] {
  const q = f.q.trim().toLowerCase();
  return events.filter(
    (e) =>
      (!f.caseId || e.caseId === f.caseId) &&
      (!f.area || e.area === f.area) &&
      (!f.person || e.by === f.person) &&
      (!f.action || e.action === f.action) &&
      (!f.side || e.side === f.side) &&
      (!q || [e.action, e.detail, e.caseId, e.material, e.who, e.org, e.sectionId ?? ""].some((s) => s.toLowerCase().includes(q))),
  );
}

/** People who appear in the log, grouped by side, for the person filter. */
export function peopleInLog(events: FlatEvent[]) {
  const seen = new Map<string, { id: string; name: string; side: EventSide; org: string }>();
  for (const e of events) if (!seen.has(e.by)) seen.set(e.by, { id: e.by, name: e.who, side: e.side, org: e.org });
  const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { internal: list.filter((p) => p.side === "internal"), supplier: list.filter((p) => p.side === "supplier"), system: list.filter((p) => p.side === "system") };
}

export const actionsInLog = (events: FlatEvent[]) => [...new Set(events.map((e) => e.action))].sort((a, b) => a.localeCompare(b));
