// What a tester reads (Thomas, 22 Oct: "a tester sees no technical noise; only messages that mean something to them";
// kissflow-build/ciq-digital/FE-CLEANUP-APP-INVENTORY.md). The Development sandbox keeps the raw texts (Kissflow's error
// codes, flow and field names, item ids) for the developers; production shows the plain sentences below. The Writes
// log in Diagnostics keeps the raw cause in both environments (WriteResult.detail).
// - plainError / plainCause: a Kissflow or network failure in plain words (the inventory's C-store table, plus a value
//   Kissflow did not accept, an item it no longer finds and a failure of the app itself: none of them is a role
//   refusal). An error the app already worded for the user (PlainError, NOT_IN_APP) passes unchanged.
// - trimEnd: a cause put inside a sentence loses its own closing full stop (A2, A15: "….. You are seeing …").
// - The production sentences of the shell, the boot pages and the store, named so the tests can assert them.
import { errorText } from "@/portal/kf/sdk";
import type { AppEnv } from "./env";
import { NOT_IN_APP, isDataRefusal, isRateLimited, kfCode } from "./kf/client";
import { VerifyError, leftQueue } from "./write/verify";

/** A reason already written for the user (a guard's text, "… is no longer loaded. Reload and try again."): production
 *  shows it as it is, never as "Kissflow could not complete the request". */
export class PlainError extends Error {}

/** The text without its closing full stops and spaces, so a sentence can go on after it. */
export const trimEnd = (s: string): string => s.trim().replace(/[.\s]+$/, "");

const REFUSED = /\b0503\d\d\b|KISSFLOW_ERROR_0503\d\d|PermissionDeniedToUpdate|permission|not authori[sz]ed|forbidden|access denied|\b403\b/i;
/** 050312: Kissflow's validation (a mandatory field left empty, a value it does not take), not a refusal. */
const INVALID = /\b050312\b|validation failed|invalid (value|date|datetime)|is not a valid/i;
const NOT_FOUND = /\b01015\b|not found|\b404\b/i;
const NETWORK = /failed to fetch|networkerror|network error|load failed|err_[a-z_]+|connection (was )?(reset|refused|closed)/i;
const ASK_ADMIN = "Reload and try again; if it stays, tell your CIQ administrator.";

/** A failure's cause in plain words, as a clause ("Kissflow did not answer in time"), and what to do about it. */
function plain(e: unknown): { why: string; then: string } {
  const t = errorText(e);
  if (isRateLimited(e)) return { why: "Kissflow is busy right now", then: "Wait a minute, then try again." };
  if (/did not answer within/i.test(t)) return { why: "Kissflow did not answer in time", then: "Reload to see whether it went through." };
  if (e instanceof VerifyError || /^Kissflow did not keep /.test(t)) return { why: "Kissflow did not keep every value", then: "Reload and check the result." };
  if (leftQueue(e)) return { why: "this is no longer one of your open tasks in Kissflow", then: "Reload to see its current state." };
  if (kfCode(e) === "050312" || INVALID.test(t)) return { why: /mandatory|required/i.test(t) ? "Kissflow still needs some required information" : "Kissflow did not accept one of the values", then: ASK_ADMIN };
  if ((kfCode(e) ?? "").startsWith("0503") || isDataRefusal(e) || REFUSED.test(t)) return { why: "Kissflow did not allow this for your role", then: "" };
  if (NOT_FOUND.test(t)) return { why: "Kissflow could not find this item any more", then: "Reload to see the current state." };
  if (NETWORK.test(t)) return { why: "the connection to Kissflow was interrupted", then: "Try again." };
  // a fault of the app itself (a TypeError not from fetch): not Kissflow's
  if (e instanceof TypeError || e instanceof ReferenceError || e instanceof RangeError) return { why: "something went wrong in CIQ Digital", then: ASK_ADMIN };
  return { why: "Kissflow could not complete the request", then: "" };
}

const own = (e: unknown): string | undefined => (e instanceof PlainError ? e.message : errorText(e) === NOT_IN_APP ? NOT_IN_APP : undefined);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A failure as the production toast says it: one or two plain sentences, no code, id or Kissflow message. */
export function plainError(e: unknown): string {
  const mine = own(e);
  if (mine) return mine;
  const p = plain(e);
  return `${cap(p.why)}.${p.then ? ` ${p.then}` : ""}`;
}

/** What production says after "Not finished:" when part of a job reached Kissflow (C12): the plain cause, then "Reload to
 *  see the current state." unless the cause already says to reload (a timeout, a task that moved on). */
export function unfinishedText(e: unknown): string {
  const t = plainError(e);
  return /\breload\b/i.test(t) ? t : `${t} Reload to see the current state.`;
}

/** The cause alone, to go inside a sentence ("… was not linked to the case (<cause>)."). */
export function plainCause(e: unknown): string {
  const mine = own(e);
  return mine ? trimEnd(mine) : plain(e).why;
}

/** The cause of `e` for this environment, without its closing full stop: raw in dev, plain in prod. In prod the raw
 *  cause goes into `details` (the Writes log keeps it). */
export function causeFor(env: AppEnv | undefined, e: unknown, details?: string[]): string {
  const raw = trimEnd(errorText(e));
  if (env !== "prod") return raw;
  const shown = plainCause(e);
  if (shown !== raw) details?.push(raw);
  return shown;
}

/** A thrown error's toast text for this environment (raw in dev). */
export const errorFor = (env: AppEnv | undefined, e: unknown): string => (env === "prod" ? plainError(e) : errorText(e));

// ---------------------------------------------------------------------------------- the shell and the boot pages

/** HH:MM of an ISO time, in the browser's time zone. */
export const hhmm = (iso: string): string => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** C1: the one line production shows when a load could not read everything. */
export const SOME_NOT_LOADED = "Some data could not be loaded, so this page may be incomplete.";
export const SOME_KEPT = (at: string) => `Some data could not be refreshed; parts of the page show the state of ${hhmm(at)}.`;
export const CASE_NOT_LISTED = (code: string) => `Case ${code} could not be loaded and is not listed.`;
/** C2: a re-read failed after a good load. */
export const REFRESH_FAILED = (at: string) => `Couldn't refresh from Kissflow. You are seeing the data from ${hhmm(at)}.`;
/** C3: the first load failed. */
export const LOAD_FAILED = "Kissflow did not answer or did not allow the request. Try again in a moment; if it keeps happening, tell your CIQ administrator.";
/** C4: the handshake failed (before the environment is known, so in both). */
export const CONNECT_FAILED = "Kissflow did not answer. Reload the page; if this keeps happening, tell your CIQ administrator.";
/** C5: a render error while the app starts. */
export const START_FAILED = "Something went wrong while opening the app. Reload the page; if it stays, tell your CIQ administrator.";
/** C6: a render error in one page. */
export const PAGE_FAILED = "Something on this page could not be shown. Other pages and cases are not affected. Reload the page; if it stays, tell your CIQ administrator which page you opened.";
/** C7: a signed-in user without a CIQ persona. */
export const NO_ROLE = (email: string) => `Your Kissflow account${email ? ` (${email})` : ""} has no CIQ Digital role. Ask your CIQ administrator for one.`;
/** C8: a case whose questionnaire this role could not read. */
export const CASE_UNREADABLE = "The questionnaire of this case could not be loaded for your role. You see its header, reviews and open points. If you need the answers, tell your CIQ administrator.";

// ---------------------------------------------------------------------------------- the store

/** C13: a hand-off POST that failed after its save. */
export const HANDOFF_PROBLEM = "Saved. The supplier portal could not be updated just now, so the supplier may not see this change yet. Tell your CIQ administrator.";
/** C15: Kissflow's Mandatory gate stopped an item after its save. */
export const STILL_NEEDS = (what: string, outcome = "it did not move on") => `${what} was saved, but Kissflow still needs some required information, so ${outcome}. Reload and try again; if it stays, tell your CIQ administrator.`;
/** C15: Diagnostics' Send found required fields still empty. */
export const STILL_EMPTY = "Some required fields are still empty, so nothing was sent.";
/** C16: Complete review read the review gate blank. */
export const GATE_NOT_OK = "Kissflow does not see this review as ready yet (an open point is still open, or the decision is missing). Nothing was completed; reload and check.";
/** C17: Complete review's fresh read kept a part from an earlier load. */
export const NOT_READ_AGAIN_PLAIN = "Not completed: part of this case could not be read again just now, so the review could not be checked. Nothing was saved; try again.";
/** C21: the pinned release can't give the supplier's bundle. */
export const RELEASE_UNUSABLE = "This questionnaire version can't be used to start a case. Ask the Business administrator.";
/** C21: no WebCrypto for the bundle's fingerprint. */
export const NO_WEBCRYPTO = "This browser can't start a case. Use a current browser.";
/** C21+, noPortalContact: no active contact has a portal user. TEST-GUIDE-PROD quotes its first sentence; the end says
 *  what to do, since the app can't link a portal user (a CIQ administrator sets it in Kissflow). The guard says it
 *  before anything is written (write/guards.ts); caseStartPayload's backstop reads the same through startText. */
export const NO_PORTAL_CONTACT = "None of the active supplier contacts has a portal user yet, so nobody would get the questionnaire. Ask your CIQ administrator to link a contact to its supplier-portal user, then start the case.";

/** A supplier file this page could not open (27 Oct, app-live/docOpener.ts): production's toast; dev names the reason. */
export const FILE_NOT_OPENED = (name: string) => `${name} can't be opened here. It can be opened in the supplier portal.`;
export const fileNotOpenedText = (env: AppEnv | undefined, name: string, why: string): string => (env === "prod" ? FILE_NOT_OPENED(name) : `${name} can't be opened here: ${trimEnd(why)}.`);

const NO_PORTAL_START = "None of the active supplier contacts has a portal user yet";
/** C21: why caseStartPayload could not build a case's Start fields, for this environment. Its no-portal-user reason
 *  reads as the guard's in both (shared/ is the portal session's, so its own text stays as it is: "… Invite a contact
 *  to the portal first."); production names no JSON or WebCrypto. */
export const startText = (env: AppEnv | undefined, raw: string): string =>
  raw.startsWith(NO_PORTAL_START) ? NO_PORTAL_CONTACT : env !== "prod" ? raw : /WebCrypto/.test(raw) ? NO_WEBCRYPTO : RELEASE_UNUSABLE;

/** C26: production's "What could not be loaded" on Diagnostics, in plain words; the raw list is folded away under
 *  "Technical details (for support)". */
export const DIAG_ALL_LOADED = "Everything was loaded.";
export const DIAG_NOT_LOADED = "Some data could not be loaded, so some pages may be incomplete.";
export const DIAG_KEPT = (at: string) => `Some data could not be refreshed; parts of the pages show the state of ${hhmm(at)}.`;
export const DIAG_SUPPORT = "If it stays after a reload, tell your CIQ administrator: the technical details below show what failed.";

/** A1: the items that reached Kissflow but were not sent on, and where they are sent or discarded (the shell's banner). */
export const UNSENT_ITEMS = "Unsent items";
export const USE_UNSENT = "Use Unsent items at the top of the page to send or discard it.";

// ---------------------------------------------------------------------------------- load-time effects (C14)

/** One case's load-time effect, as the store groups them per effect and load (A13). */
export interface EffectTally {
  effect: "ensureRmes";
  caseId: string;
  ok: boolean;
  message?: string;
  tone?: "success" | "info" | "warning" | "danger";
  /** What it did for the case: ["created"]. */
  done?: string[];
  /** What failed for the case (the same kinds of labels). */
  failed?: string[];
}

const joinList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const AGAIN = "CIQ Digital tries again the next time you open it.";

/** The production sentence of one effect's results on one load; undefined: nothing a tester needs (an RMES record
 *  created). */
function plainEffect(rows: EffectTally[]): { tone: "warning"; text: string } | undefined {
  const failed = rows.filter((r) => !r.ok || r.failed?.length);
  const ids = (xs: EffectTally[]) => joinList([...new Set(xs.map((r) => r.caseId))]);
  return failed.length ? { tone: "warning", text: `The RMES record of ${ids(failed)} could not be created just now. ${AGAIN}` } : undefined;
}

const DEV_FALLBACK: Record<EffectTally["effect"], string> = { ensureRmes: "the RMES record" };

/**
 * The toasts of one load's effects (A13, C14): one per effect, in the order they ran. Dev joins the effects' own texts
 * (raw causes, item ids); production says what failed in plain words and nothing about housekeeping (an RMES record
 * created).
 */
export function effectToasts(rows: EffectTally[], env: AppEnv | undefined): { tone: "success" | "info" | "warning" | "danger"; text: string }[] {
  const order = [...new Set(rows.map((r) => r.effect))];
  const out: { tone: "success" | "info" | "warning" | "danger"; text: string }[] = [];
  for (const effect of order) {
    const mine = rows.filter((r) => r.effect === effect);
    if (env === "prod") {
      const t = plainEffect(mine);
      if (t) out.push(t);
      continue;
    }
    const shown = mine.filter((r) => r.message || !r.ok);
    if (!shown.length) continue;
    // the gravest tone of the cases joined (each case's own: its tone, else info when it went through, danger if not)
    const tones = shown.map((r) => r.tone ?? (r.ok ? "info" : "danger"));
    const tone = (["danger", "warning", "success", "info"] as const).find((x) => tones.includes(x)) ?? "info";
    out.push({ tone, text: shown.map((r) => r.message || `${r.caseId}: ${DEV_FALLBACK[effect]} could not be saved.`).join(" ") });
  }
  return out;
}
