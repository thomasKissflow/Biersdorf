// The final document (spec §1.10, AS-12, R-2): generated once, automatically, with the supplier's final release, and
// immutable afterwards (a fingerprint over its content is shown and can be re-checked). It holds the case header, the
// released answers by section, the K2.1 components, the evidence list, every open-point thread round by round
// (attachments by file name only) and every confirmation. It never holds RMES records or decisions, findings,
// internal notes or internal reasons (a withdrawal reason, a "not accepted" note). Internal only.

import { CONFIG_QUESTIONS, DEPT_SHORT, fieldOf, sectionOf } from "./catalog";
import { isSlotKey, requestedDocStatus, requestedDocuments, slotDocuments } from "./requestedDocs";
import { caseFields, closedByCancellation, formatValue, hasValue, isConfigAnswered, isVisible, manufacturerOf, siteOf, userName } from "./selectors";
import type { AnswerValue, AppState, CiqCase, ConfirmationType, DocumentRef, FieldDef, FinalDocAnswer, FinalDocEvidence, FinalDocMetadataAnswer, FinalDocThread, FinalDocThreadEntry, FinalDocument, OpenPoint } from "./types";

export const CONFIRMATION_LABEL: Record<ConfirmationType, string> = {
  completeness: "Completeness confirmation",
  "dept-completion": "Review completed",
  "final-release": "Final release",
  cancellation: "Cancellation",
};

/** cyrb53-style 64-bit string hash, hex. Deterministic and synchronous (no crypto API needed in the browser). */
export function fingerprintOf(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

const content = (d: Omit<FinalDocument, "fingerprint"> | FinalDocument) => {
  const { fingerprint: _omit, ...rest } = d as FinalDocument;
  void _omit;
  return JSON.stringify(rest);
};

const docName = (c: CiqCase, id?: string) => (id ? c.documents.find((d) => d.id === id)?.name : undefined);

/** An answer as the reviewers read it: a number or decimal with its unit ("0.1 mg/kg"). */
export const answerText = (f: Pick<FieldDef, "type" | "unit">, v: AnswerValue | undefined): string =>
  (f.type === "number" || f.type === "decimal") && f.unit && hasValue(v) ? `${formatValue(v)} ${f.unit}` : formatValue(v);

/** The metadata answers SF-01…SF-12 that set the scope, in questionnaire order (SF-11 is set by Beiersdorf). */
export function metadataAnswers(s: AppState, c: CiqCase): FinalDocMetadataAnswer[] {
  return CONFIG_QUESTIONS.map((q) => {
    const v = c.config[q.id] as AnswerValue | undefined;
    const label = (x: string) => q.options?.find((o) => o.value === x)?.label ?? x;
    const value = !isConfigAnswered(c, q.id) ? "—" : Array.isArray(v) ? (v.length ? (v as string[]).map(label).join(", ") : "None") : formatValue(v);
    const who = c.answeredBy[q.id];
    return { id: q.id, code: q.code, label: q.label, value, by: who ? userName(s, who.by) : undefined, at: who?.at, setByBdf: q.answeredBy === "rmm" || undefined };
  });
}

/** "Accepted", "Not accepted", "Closed, no answer needed", "Withdrawn with the case cancellation" or "Open". */
export function pointResult(p: OpenPoint): string {
  if (p.status !== "closed") return "Open";
  if (closedByCancellation(p)) return "Withdrawn with the case cancellation";
  return p.outcome === "accepted" ? "Accepted" : p.outcome === "withdrawn" ? "Closed, no answer needed" : "Not accepted";
}

/** The thread round by round: a new round starts with every entry that sent the point back to the supplier. */
export function threadRounds(s: AppState, c: CiqCase, p: OpenPoint): FinalDocThread["rounds"] {
  const rounds: FinalDocThread["rounds"] = [];
  for (const m of p.thread) {
    const entry: FinalDocThreadEntry = {
      at: m.at,
      by: userName(s, m.by),
      side: m.side,
      action: m.action,
      // The internal reason of "closed as not accepted" stays out; the entry itself is kept.
      text: m.action === "note" ? "Closed as not accepted." : m.text,
      attachment: docName(c, m.documentId),
    };
    const starts = m.action === "raised" || m.newRound === true || (m.action === "returned" && m.newRound !== false);
    if (starts || !rounds.length) rounds.push({ n: rounds.length + 1, entries: [entry] });
    else rounds[rounds.length - 1].entries.push(entry);
  }
  return rounds;
}

/** Builds the document from the case as it is at the release (released answers of the sections in scope only), with
 *  the sections and fields of the case's own questionnaire version. */
export function buildFinalDocument(s: AppState, c: CiqCase, at: string, trigger: string): FinalDocument {
  const sup = s.suppliers.find((x) => x.id === c.supplierId);
  const sec = (id: string) => sectionOf(id, c.templateVersion, s.config);
  const field = (id: string) => fieldOf(id, c.templateVersion, s.config);
  // Requested documents (spec §8.5): each slot is listed in its section and in the evidence list.
  const slots = requestedDocuments(c, s.config);
  const slotAnswer = (x: (typeof slots)[number]): FinalDocAnswer => {
    const files = slotDocuments(c, x.key);
    const who = files[0] ? { by: files[0].uploadedBy, at: files[0].uploadedAt } : c.answeredBy[x.key];
    return { fieldId: x.key, label: `${x.doc} (requested document)`, value: files.length ? files.map((d) => d.name).join(", ") : "—", by: who ? userName(s, who.by) : undefined, at: who?.at, justification: files.length ? undefined : c.justifications[x.key] };
  };
  const sections = c.scope
    .filter((sc) => sc.applicability !== "na" || (sc.sectionId === "K5.1" && !!c.justifications["FLD-5.1-002"]))
    .map((sc) => {
      const def = sec(sc.sectionId);
      const answers = caseFields(c, sc.sectionId, s.config)
        .filter((f) => hasValue(c.answers[f.id]) || !!c.justifications[f.id])
        .map((f): FinalDocAnswer => {
          const v = c.answers[f.id];
          const value = f.type === "file" && typeof v === "string" ? (docName(c, v) ?? formatValue(v)) : answerText(f, v);
          const who = c.answeredBy[f.id];
          return { fieldId: f.id, label: f.label, value: hasValue(v) ? value : "—", by: who ? userName(s, who.by) : undefined, at: who?.at, justification: c.justifications[f.id] };
        })
        .concat(slots.filter((x) => x.sectionId === sc.sectionId && requestedDocStatus(c, x) !== "missing").map(slotAnswer));
      return { sectionId: sc.sectionId, code: def?.code ?? sc.sectionId, title: def?.title ?? "", applicability: sc.applicability, addedLater: sc.addedLater, answers, justification: c.justifications[sc.sectionId] };
    });
  const owner = s.users.find((u) => u.id === c.ownerId);
  // Evidence of the sections the document holds only (a section that closed in Part 1 keeps its uploads on the case).
  const held = new Set(sections.map((x) => x.sectionId));
  // A requested document's file sits in its slot's section: before the completeness confirmation a slot two rules
  // share can move with the answers, while the file keeps the section it was uploaded in.
  const placeOf = (d: DocumentRef) => (isSlotKey(d.fieldId) ? (slots.find((x) => x.key === d.fieldId)?.sectionId ?? d.sectionId) : d.sectionId);
  const shown = c.documents.filter((d) => {
    if (!held.has(placeOf(d))) return false;
    // A file of a requested document the answers stopped asking for before the completeness confirmation stays out.
    if (isSlotKey(d.fieldId)) return slots.some((x) => x.key === d.fieldId);
    const f = d.fieldId ? field(d.fieldId) : undefined;
    return !f || isVisible(f, c);
  });
  const base: Omit<FinalDocument, "fingerprint"> = {
    id: `${c.id}-FD`,
    caseId: c.id,
    generatedAt: at,
    trigger,
    header: {
      caseId: c.id,
      materialName: c.materialName,
      inci: c.inci,
      materialNo: c.materialNo,
      supplierName: sup?.name ?? c.manufacturer,
      duns: sup?.duns ?? String(c.answers["FLD-GEN-003"] ?? ""),
      manufacturer: manufacturerOf(c),
      site: siteOf(c),
      markets: c.config.SF11 ?? [],
      templateVersion: c.templateVersion,
      ruleSetVersion: c.ruleSetVersion,
      ownerName: owner?.name ?? c.ownerId,
      createdAt: c.createdAt,
      releasedAt: at,
    },
    metadata: metadataAnswers(s, c),
    sections,
    components: c.components.map((r) => ({ ...r })),
    evidence: [
      ...shown.map((d): FinalDocEvidence => {
        const slot = isSlotKey(d.fieldId) ? slots.find((x) => x.key === d.fieldId) : undefined;
        return {
          documentId: d.id,
          name: d.name,
          sectionId: placeOf(d),
          sectionCode: sec(placeOf(d))?.code ?? placeOf(d),
          fieldLabel: slot ? `Requested document: ${slot.doc}` : d.fieldId ? field(d.fieldId)?.label : undefined,
          uploadedBy: userName(s, d.uploadedBy),
          uploadedAt: d.uploadedAt,
          ...(slot ? { requested: slot.doc } : {}),
        };
      }),
      // A requested document the supplier could not provide: its justification, with who gave it and when.
      ...slots
        .filter((x) => held.has(x.sectionId) && requestedDocStatus(c, x) === "justified")
        .map((x): FinalDocEvidence => {
          const who = c.answeredBy[x.key];
          return {
            documentId: x.key,
            name: x.doc,
            sectionId: x.sectionId,
            sectionCode: sec(x.sectionId)?.code ?? x.sectionId,
            fieldLabel: `Requested document: ${x.doc}`,
            uploadedBy: who ? userName(s, who.by) : "—",
            uploadedAt: who?.at ?? "",
            requested: x.doc,
            justification: c.justifications[x.key],
          };
        }),
    ],
    threads: c.openPoints.map((p) => ({ opId: p.id, ref: p.ref.label, kind: p.kind, raisedBy: userName(s, p.createdBy), raisedAt: p.createdAt, result: pointResult(p), rounds: threadRounds(s, c, p) })),
    confirmations: c.confirmations
      .filter((x) => x.type !== "cancellation")
      .map((x) => ({ type: x.type, label: x.type === "dept-completion" && x.dept ? `${CONFIRMATION_LABEL[x.type]}: ${DEPT_SHORT[x.dept]}` : CONFIRMATION_LABEL[x.type], name: x.name, email: x.email, role: x.role, at: x.at, note: x.note })),
  };
  return { ...base, fingerprint: fingerprintOf(content(base)) };
}

/** True when the stored document still matches its fingerprint. */
export const verifyFinalDocument = (d: FinalDocument) => fingerprintOf(content(d)) === d.fingerprint;

/** The case's final document (completed cases only). */
export const finalDocumentOf = (c: CiqCase): FinalDocument | undefined => c.finalDocument;
