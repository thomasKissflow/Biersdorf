// The supplier's data on the CIQP Request ("the CIQ", plan v5 §3.1): one JSON document per kind, all on the one
// request item. The sync service reads them (kissflow-build/sync/handlers/portal.mjs supplierSave):
//   Config_Answers_JSON   {SF01…SF12 except SF11}
//   Answers_JSON          {fieldId: value}                      (the Beiersdorf-set GEN values and file answers stay out)
//   Answered_By_JSON      {key: {name, email, at, by}}          (key = field id, SF code, slot key or "K2.1:components")
//   Justifications_JSON   {key: text}
//   Components_JSON       ComponentRow[]                        (each row has its own id)
// Kissflow has no locking: two writes within ~0.1 s lose one, even on different fields (P3). So a save reads the item,
// merges ITS keys into what is stored (never a blind overwrite), writes, reads back, and re-applies (≤3) when one of
// its keys is missing. Only the JSON fields the patch touches are written.
import { RELEASE_LOCKED_TEXT } from "@/domain/permissions";
import type { AnswerValue, ComponentRow, ConfigAnswers } from "@/domain/types";
import type { KfData } from "../kf/sdk";
import { json, num, str, type RawItem } from "./raw";

export const COMPONENTS_KEY = "K2.1:components";

export interface Stamp {
  name: string;
  email: string;
  at: string;
  /** The Kissflow user id of the contact (the service matches the e-mail first). */
  by?: string;
}

export interface RequestDoc {
  config: Record<string, unknown>;
  answers: Record<string, AnswerValue>;
  answeredBy: Record<string, Stamp>;
  justifications: Record<string, string>;
  components?: ComponentRow[];
}

const objOf = <T,>(it: RawItem | undefined, key: string): Record<string, T> => {
  const v = json<unknown>(it, key, {});
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, T>) : {};
};

/** The supplier's data as stored on the request (defensive: an unreadable field reads as empty). */
export function readDoc(it: RawItem | undefined): RequestDoc {
  const rows = json<unknown>(it, "Components_JSON", undefined);
  const config = objOf<unknown>(it, "Config_Answers_JSON");
  delete config.SF11; // Beiersdorf's, never the supplier's (B-05)
  return {
    config,
    answers: objOf<AnswerValue>(it, "Answers_JSON"),
    answeredBy: objOf<Stamp>(it, "Answered_By_JSON"),
    justifications: Object.fromEntries(Object.entries(objOf<unknown>(it, "Justifications_JSON")).filter(([, v]) => typeof v === "string" && v.trim())) as Record<string, string>,
    components: Array.isArray(rows) ? (rows as ComponentRow[]) : undefined,
  };
}

export interface AnswerPatch {
  config?: ConfigAnswers;
  set?: Record<string, AnswerValue>;
  just?: Record<string, string>;
  components?: ComponentRow[];
}

export interface Who {
  id: string;
  name: string;
  email: string;
}

export const isEmptyPatch = (p: AnswerPatch) => !Object.keys(p.config ?? {}).length && !Object.keys(p.set ?? {}).length && !Object.keys(p.just ?? {}).length && !p.components;

/** Merges two patches; the later one wins per key. */
export function mergePatch(a: AnswerPatch, b: AnswerPatch): AnswerPatch {
  return { config: { ...a.config, ...b.config }, set: { ...a.set, ...b.set }, just: { ...a.just, ...b.just }, components: b.components ?? a.components };
}

export function applyPatch(doc: RequestDoc, patch: AnswerPatch, who: Who, at: string): RequestDoc {
  const stamp: Stamp = { name: who.name, email: who.email, at, by: who.id };
  const next: RequestDoc = { config: { ...doc.config }, answers: { ...doc.answers }, answeredBy: { ...doc.answeredBy }, justifications: { ...doc.justifications }, components: doc.components };
  for (const [k, v] of Object.entries(patch.config ?? {})) {
    if (k === "SF11") continue;
    next.config[k] = v;
    next.answeredBy[k] = stamp;
  }
  for (const [k, v] of Object.entries(patch.set ?? {})) {
    next.answers[k] = v;
    next.answeredBy[k] = stamp;
  }
  for (const [k, text] of Object.entries(patch.just ?? {})) {
    if (text.trim()) next.justifications[k] = text;
    else delete next.justifications[k];
    next.answeredBy[k] = stamp;
  }
  if (patch.components) {
    next.components = patch.components;
    next.answeredBy[COMPONENTS_KEY] = stamp;
  }
  return next;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The keys of the patch the stored document does not hold (empty: the save landed). */
export function missingKeys(doc: RequestDoc, patch: AnswerPatch): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(patch.config ?? {})) if (k !== "SF11" && !same(doc.config[k], v)) out.push(k);
  for (const [k, v] of Object.entries(patch.set ?? {})) if (!same(doc.answers[k], v)) out.push(k);
  for (const [k, t] of Object.entries(patch.just ?? {})) if ((t.trim() ? doc.justifications[k] : undefined) !== (t.trim() ? t : undefined)) out.push(`justification ${k}`);
  if (patch.components && !same(doc.components ?? [], patch.components)) out.push(COMPONENTS_KEY);
  return out;
}

/** The JSON fields a patch touches (Answered_By_JSON always). */
export function docFields(doc: RequestDoc, patch: AnswerPatch): KfData {
  const out: KfData = { Answered_By_JSON: JSON.stringify(doc.answeredBy) };
  if (Object.keys(patch.config ?? {}).length) out.Config_Answers_JSON = JSON.stringify(doc.config);
  if (Object.keys(patch.set ?? {}).length) out.Answers_JSON = JSON.stringify(doc.answers);
  if (Object.keys(patch.just ?? {}).length) out.Justifications_JSON = JSON.stringify(doc.justifications);
  if (patch.components) out.Components_JSON = JSON.stringify(doc.components ?? []);
  return out;
}

export class LockedError extends Error {}

/**
 * Request_Locked = "Yes" (plan v5 §3.1): the service takes no supplier change. Since Thomas, 15 Oct that is while the
 * final release is requested (label "Awaiting your final release"; a reopened review unlocks it) and for good once the
 * case is completed or cancelled.
 */
export const isLocked = (it: RawItem | undefined) => str(it, "Request_Locked") === "Yes";

/** Plan v6 D-10: Beiersdorf reopened a review while the release was requested. The go-to step sent the request back
 *  to "keep the CIQ up to date"; the flag wins over a lock or label left over from the release request. */
export const isReopened = (it: RawItem | undefined) => str(it, "Release_Flag") === "Reopened";

const labelOf = (it: RawItem | undefined) => str(it, "Case_Phase_Label").trim().toLowerCase();

/** The request waits for the supplier's final release (the service's label). */
export const isAwaitingRelease = (it: RawItem | undefined) => labelOf(it).includes("final release") && !isReopened(it);

/** Closed for good: labelled completed or cancelled, or locked outside the final-release step (older items). */
export const isClosedRequest = (it: RawItem | undefined) => labelOf(it) === "completed" || labelOf(it) === "cancelled" || (isLocked(it) && !isAwaitingRelease(it) && !isReopened(it));

/** No supplier change is written: the request is locked, or it waits for the final release (also before a service that
 *  did not lock it yet: the questionnaire is locked at that step either way). */
export const isWriteLocked = (it: RawItem | undefined) => isClosedRequest(it) || isAwaitingRelease(it) || (isLocked(it) && !isReopened(it));

export const LOCKED_TEXT = "This request is closed (completed or withdrawn by Beiersdorf), so it can no longer be changed. Your change was not saved.";
/** Thomas, 15 Oct: the domain's own wording (permissions.ts), plus what happened to the change. */
export const RELEASE_LOCKED_SAVE_TEXT = `${RELEASE_LOCKED_TEXT} Your change was not saved.`;

/** Why a write on this request is refused (the closed request, or the one waiting for the final release). */
export const lockedText = (it: RawItem | undefined) => (isClosedRequest(it) ? LOCKED_TEXT : RELEASE_LOCKED_SAVE_TEXT);

export interface RequestIO {
  read(): Promise<RawItem>;
  write(data: KfData): Promise<void>;
}

/**
 * Saves a patch: read → merge own keys → write (with `extra(doc, item)`: Scope_JSON, Requested_Docs_JSON, …) → read
 * back → re-apply when a key is missing, at most `maxTries` times. Refuses, without writing, on a locked request (the
 * final release requested, or closed).
 */
export async function saveRequest(io: RequestIO, patch: AnswerPatch, who: Who, now: () => string, extra: (doc: RequestDoc, item: RawItem) => KfData = () => ({}), maxTries = 3): Promise<{ rev: number; tries: number; item: RawItem }> {
  for (let tries = 1; tries <= maxTries; tries++) {
    const cur = await io.read();
    if (isWriteLocked(cur)) throw new LockedError(lockedText(cur));
    const at = now();
    const doc = applyPatch(readDoc(cur), patch, who, at);
    const rev = (num(cur, "Answers_Rev") ?? 0) + 1;
    await io.write({ ...docFields(doc, patch), ...extra(doc, cur), Answers_Rev: rev, Answers_Changed_At: at, Answers_Changed_By_Email: who.email, Editing_By: who.email, Editing_Since: at });
    const back = await io.read();
    // `item`: the request as read back, so the page can show it without reading everything again
    if (!missingKeys(readDoc(back), patch).length) return { rev: num(back, "Answers_Rev") ?? rev, tries, item: back };
  }
  // No field ids in the message (D-10): the screen keeps the unsaved value on display.
  throw new Error("Your change could not be saved because a colleague saved this questionnaire at the same moment. Please try again.");
}
