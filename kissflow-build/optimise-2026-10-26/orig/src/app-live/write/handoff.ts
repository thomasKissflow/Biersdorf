// The hand-offs a screen starts (plan v6 §4.1; payload types: ../shared/handoff.ts, the portal session's). Owner C.
// Each hand-off is one webhook integration; its URL comes from the Settings row (SET:current Payload_JSON.webhooks,
// shape {[HandoffCode]: url}, https only). A hand-off without one is "pending": the audit row and the Writes log say
// so, the toast does not (FE-CLEANUP A10, 22 Oct: no system passes a pending hand-off on). A payload carries app item
// ids only (20 Oct): the integration reads the portal target and the values from Kissflow, so the case item id
// (CaseRef.itemId, from the item or from the audit rows' Case_Item_Id when the role can't read the case) is all a
// sender needs, and the old risk R-7 (no portal request id for a role that can't read the case) is gone. A payload is
// null (pending) only when even that id is unknown. The POST is fire-and-forget, as the portal's
// (portal/data/liveActions.ts handoff): it never holds the save or the store's serial chain (kf/client.ts bounds it at
// 30 s), so the status is "sent" ("handed over") once it went out, and the audit row records that; a later failure
// never undoes the Kissflow writes before it and only reaches WriteCtx.onHandoffProblem (the store's warning toast and
// write log). Every POST carries an `idempotencyKey` (also on the hand-off's status), so the receiver can drop a repeat
// (a retry, a second sender).
// Production (Thomas, 21 Oct): SET:current is copied verbatim from the dev sandbox; production differs in both its
// Kissflow domain and its account id, the webhook tokens are the same. So a stored URL gives only its token (the last
// segment of exactly /integration/2/<account>/webhook/<token>, as the portal's hookToken), and the screen builds
// https://<host>/integration/2/<account>/webhook/<token> from where it runs: the handshake's account (kf.account._id)
// and the Kissflow page around the frame (env.ts hookHostOf). Without an acceptable page the URL is the relative path,
// which kf/client.ts postWebhook sends by kf.api (the SDK posts it to the account's own domain). The portal builds its
// URLs the same way (portal/kf/portal.ts, agreed 21 Oct). No host is named in this file (scripts/workbench-deny.mjs
// DENY_HOSTS).
import type { CiqCase, User } from "@/domain/types";
import { errorText } from "@/portal/kf/sdk";
import { KISSFLOW_HOST } from "../env";
import { questionsHistory } from "../shared/questionsHistory";
import type { HandoffCode, HandoffPayloads } from "../shared/handoff";
import type { HandoffStatus, WriteCtx } from "../types";
import { nameOfIn, rand } from "./encode";

/** Every hand-off code (a Record, so the compiler checks that none of shared/handoff.ts is missing). */
const CODES: Record<HandoffCode, true> = {
  "case.started": true,
  "op.round": true,
  "op.edited": true,
  "op.closed": true,
  "release.requested": true,
  "review.reopened": true,
  "change.received": true,
  "case.cancelled": true,
  "case.reactivated": true,
  "history.updated": true,
  "scope.extended": true,
  "case.contacts": true,
};
export const HANDOFF_CODES = Object.keys(CODES) as HandoffCode[];

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** Where the screen runs, for the hand-off URLs: the handshake's account and the host of the Kissflow page around the
 *  frame (env.ts hookHostOf; absent: none acceptable, so the URL is relative). */
export interface HookBase {
  accountId: string;
  host?: string;
}

/** The characters of a webhook token and of an account id as Kissflow writes them (none needs escaping in a path). */
const ID_CHARS = /^[A-Za-z0-9_-]+$/;
/** A hook path: /integration/2/<account>/webhook/<token> (the portal's HOOK_PATH, portal/kf/portal.ts). */
const HOOK_PATH = /^\/integration\/2\/[A-Za-z0-9_-]+\/webhook\/([A-Za-z0-9_-]+)$/;

/** The token of a stored hook URL: the last segment of its path, which must be exactly /integration/2/<account>/
 *  webhook/<token> (HOOK_PATH; its host is not checked, it is never used). undefined, so that hand-off stays pending,
 *  for anything else: not https, another path (".../webhook" without a token, a REST path, any other kind of URL),
 *  user info, a query or fragment (even an empty "?" or "#"), or a space, tab or newline (the URL parser drops them).
 *  A token is never guessed from the wrong segment. */
export function hookToken(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" || u.username || u.password || /[?#\s]/.test(url)) return undefined;
  return HOOK_PATH.exec(u.pathname)?.[1];
}

/** The URL of a webhook token where the screen runs: https://<host>/integration/2/<account>/webhook/<token>, or the
 *  relative path without a host or with one that is not a Kissflow host (env.ts KISSFLOW_HOST). undefined for an
 *  account id that is not ID_CHARS. */
export function hookUrl(token: string, at: HookBase): string | undefined {
  if (!ID_CHARS.test(at.accountId) || !ID_CHARS.test(token)) return undefined;
  const path = `/integration/2/${at.accountId}/webhook/${token}`;
  return at.host && KISSFLOW_HOST.test(at.host) ? `https://${at.host}${path}` : path;
}

/** The webhook URLs of the Settings payload (its `webhooks` object; a bare {code: url} map is read too). Only https
 *  URLs of known codes are read: a hook URL carries a token, which must not travel in clear text. With `at` (the
 *  screens) each becomes its token's URL where the screen runs (hookUrl: the stored host and account are not used), and
 *  one without a token (hookToken: not exactly a hook URL) is dropped (its hand-off is pending); without it (the live
 *  suites, which post to the dev sandbox's URLs, or their offline fakes, through their own client) each is kept as
 *  stored. */
export function webhooksOf(settings: Record<string, unknown>, at?: HookBase): Partial<Record<HandoffCode, string>> {
  const src = isObj(settings.webhooks) ? settings.webhooks : settings;
  const out: Partial<Record<HandoffCode, string>> = {};
  for (const code of HANDOFF_CODES) {
    const v = src[code];
    if (typeof v !== "string" || !/^https:\/\/\S+$/i.test(v.trim())) continue;
    const stored = v.trim();
    const token = at ? hookToken(stored) : undefined;
    const url = !at ? stored : token && hookUrl(token, at);
    if (url) out[code] = url;
  }
  return out;
}

// Saved on the audit row (Notify_Recipient), which Kissflow's own item view shows: they say what happened, and promise
// no system that passes the change on (C30, 22 Oct; rows written before keep their text)
export const PENDING_NO_TARGET = "Not sent to the supplier portal: this screen does not know the case's Kissflow item.";
export const PENDING_NO_URL = "No webhook is configured for this hand-off yet.";
export const PENDING_PARTIAL_HISTORY = "Not sent to the supplier portal: this screen could not read every open point of the case.";

/** A fresh idempotency key for one hand-off (HO-<code>-<time>-<rand>). */
export const handoffKey = (code: HandoffCode): string => `HO-${code}-${Date.now().toString(36)}-${rand(6)}`;

/** The detail of a hand-off that went out (its route and outcome come later, after the save). */
export const HANDED_OVER = "handed over";

/** Sends one hand-off: null payload or no URL → pending; otherwise the POST starts and the status is "sent" at once
 *  (never thrown, never awaited); a later failure goes to `onHandoffProblem`. The payload goes out with
 *  `idempotencyKey` (`key`, else a fresh one), the same on whichever route postWebhook takes. */
export async function handoff<K extends HandoffCode>(ctx: Pick<WriteCtx, "client" | "webhooks" | "onHandoffProblem">, code: K, payload: HandoffPayloads[K] | null, key?: string): Promise<HandoffStatus> {
  if (!payload) return { code, status: "pending", detail: PENDING_NO_TARGET };
  const url = ctx.webhooks[code];
  if (!url) return { code, status: "pending", detail: PENDING_NO_URL };
  const idempotencyKey = key ?? handoffKey(code);
  let posted: Promise<unknown>;
  try {
    posted = ctx.client.postWebhook(url, { ...payload, idempotencyKey });
  } catch (e) {
    posted = Promise.reject(e); // a client that throws at once fails like one that rejects later
  }
  void posted.catch((e: unknown) => {
    try {
      ctx.onHandoffProblem?.(code, idempotencyKey, errorText(e));
    } catch {
      // the report is best effort: it must not become an unhandled rejection
    }
  });
  return { code, status: "sent", detail: HANDED_OVER, key: idempotencyKey };
}

/** The CIQ Case item of a case (CaseRef.itemId: every listed case has one, readable or not), the id a case hand-off sends. */
export const caseItemOf = (ctx: Pick<WriteCtx, "index">, caseId: string): string | undefined => ctx.index.cases.get(caseId)?.itemId || undefined;

/**
 * `history.updated` after any open-point change: the case's supplier-visible thread, which the integration writes onto
 * the case's portal request. The payload REPLACES the portal's whole history, so it goes out only when every unresolved
 * point of the case was read live on this load (a point known only from an audit snapshot lacks the supplier's latest
 * answer); `fresh` names the points this write itself created or holds. Otherwise it is pending (M3) until the portal
 * session changes the contract.
 */
export function historyHandoff(ctx: Pick<WriteCtx, "client" | "webhooks" | "index" | "onHandoffProblem">, c: CiqCase, users: readonly User[], fresh: readonly string[] = []): Promise<HandoffStatus> {
  const partial = c.openPoints.some((p) => p.status !== "closed" && !fresh.includes(p.id) && ctx.index.ops.get(p.id)?.live !== true);
  if (partial) return Promise.resolve({ code: "history.updated", status: "pending", detail: PENDING_PARTIAL_HISTORY });
  const caseItemId = caseItemOf(ctx, c.id);
  return handoff(ctx, "history.updated", caseItemId ? { caseItemId, questionsHistoryJson: questionsHistory(c, nameOfIn({ users: [...users] })) } : null);
}
