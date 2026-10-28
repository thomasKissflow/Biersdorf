// Questions_History_JSON for the supplier's CIQP Request (plan v5 §3.1; plan v6 §4.1 webhook history.updated): the
// supplier-visible thread of every open point of a case, in supplier wording. The app screen builds it after each
// open-point change; the integration copies it onto the portal request; the portal's map.ts parses it (HistPoint).
// Byte-for-byte the shape the sync service wrote (kissflow-build/sync/reconcile.mjs supplierPointView), including the
// stable statusCode the portal reads. Internal notes and internal reasons (Outcome_Reason) never appear.
// Pure: no SDK, no Kissflow call.
import { SUPPLIER_MESSAGE_TEXT, closedByCancellation } from "@/domain/selectors";
import type { CiqCase, Message, OpenPoint } from "@/domain/types";

const KIND_LABEL: Record<OpenPoint["kind"], string> = { query: "Question", "document-request": "Document request", "additional-part": "Additional section", finding: "Question" };
const SUPPLIER_STATUS: Record<string, string> = { open: "Waiting for your answer", "in-progress": "With Beiersdorf" };

/** The stable codes the portal parses (map.ts statusOf). */
export type HistoryStatusCode = "open" | "answered" | "accepted" | "not-accepted" | "closed" | "withdrawn-with-case";

export interface HistoryMessage {
  at: string;
  side: Message["side"];
  by: string;
  action: Message["action"];
  verb?: string;
  text?: string;
  document?: string;
  newRound?: true;
}

export interface HistoryPoint {
  opId: string;
  kind: string;
  ref: string;
  sectionId?: string;
  fieldId?: string;
  rowId?: string;
  question: string;
  justification?: string;
  dueDate?: string;
  status?: string;
  statusCode: HistoryStatusCode;
  rounds: number;
  thread: HistoryMessage[];
  edits: { at: string; field: string; from?: string; to?: string }[];
}

/** Display names for the thread: a supplier contact by name, Beiersdorf people by name, "system" as "Beiersdorf". */
export type NameOf = (userId: string, side: Message["side"]) => string;

const strip = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export function statusCodeOf(op: OpenPoint): HistoryStatusCode {
  if (op.status !== "closed") return op.status === "open" ? "open" : "answered";
  if (op.outcome === "accepted") return "accepted";
  if (closedByCancellation(op)) return "withdrawn-with-case";
  return op.outcome === "withdrawn" ? "closed" : "not-accepted";
}

/** One point's supplier view. */
export function supplierPointView(op: OpenPoint, c: Pick<CiqCase, "documents">, nameOf: NameOf): HistoryPoint {
  const docName = (id?: string) => (id ? c.documents.find((d) => d.id === id)?.name : undefined);
  const outcome = op.status !== "closed" ? undefined : op.outcome === "accepted" ? "Accepted" : closedByCancellation(op) ? "Closed: the request was withdrawn" : op.outcome === "withdrawn" ? "Closed, no answer needed" : "Closed";
  const name = (id: string, side: Message["side"]) => (side !== "supplier" && id === "system" ? "Beiersdorf" : nameOf(id, side));
  return strip({
    opId: op.id,
    kind: KIND_LABEL[op.kind],
    ref: op.ref.label,
    sectionId: op.ref.sectionId,
    fieldId: op.ref.fieldId,
    rowId: op.ref.rowId,
    question: op.question,
    justification: op.justification,
    dueDate: op.dueDate,
    status: op.status === "closed" ? outcome : SUPPLIER_STATUS[op.status],
    statusCode: statusCodeOf(op),
    rounds: op.rounds,
    thread: op.thread
      .filter((m) => m.action !== "note")
      .map((m) => strip({ at: m.at, side: m.side, by: name(m.by, m.side), action: m.action, verb: SUPPLIER_MESSAGE_TEXT[m.action], text: m.text, document: docName(m.documentId), newRound: m.newRound ? (true as const) : undefined })),
    edits: (op.edits ?? []).map((e) => ({ at: e.at, field: e.field, from: e.field === "responsibleId" && e.from ? nameOf(e.from, "internal") : e.from, to: e.field === "responsibleId" && e.to ? nameOf(e.to, "internal") : e.to })),
  });
}

/** The whole Questions_History_JSON of a case: every point the supplier was asked, in the case's order. */
export function questionsHistory(c: Pick<CiqCase, "openPoints" | "documents">, nameOf: NameOf): string {
  // only points that went to the supplier at least once (a raised point has round 1)
  const toSupplier = c.openPoints.filter((op) => op.rounds > 0);
  return JSON.stringify(toSupplier.map((op) => supplierPointView(op, c, nameOf)));
}
