// Hand-off webhooks for the suites (SPEC §2 "Hand-offs"): the URL of each code, looked up the way the screens do —
// app codes from SET:current → Payload_JSON.webhooks through the app's own webhooksOf (the config form read through the
// client, the singleton picked as src/app-live/map/config.ts does), portal codes from src/portal/kf/portal.ts
// webhooksFor(DEV_ACCOUNT) — and registered with the guard, which lets a POST go only to a known URL naming ledger
// items. The URLs are never printed, logged or stored: callers use codes. post() goes through the client, so through
// the queue, the guards and the log (offline: the fake integrations). pollUntil waits on the queue's clock (offline: no
// real wait) and reads through the client. checkIntegrations is the run's read-only start check: all 12 ON.
import { APP_ID } from "@/app-live/ids";
import { settingsOf } from "@/app-live/map/config";
import type { HandoffCode } from "@/app-live/shared/handoff";
import { webhooksOf } from "@/app-live/write/handoff";
import { PORTAL_ID, type Webhooks } from "@/portal/kf/portal";
import { errorText, rowsOf } from "@/portal/kf/sdk";
import { GuardError, PORTAL_CODES, type Guard, type HookCode, type LiveAppClient, type PortalCode } from "./liveClient";
import type { LivePortalClient } from "./livePortalClient";
import { StopError, type Clock } from "./queue";

export type { HookCode, PortalCode };

/** The 12 hand-off integrations (both containers) by code; the four unbuilt app codes have none. */
export const INTEGRATIONS: Record<HookCode, { id: string; app: string } | undefined> = {
  "case.started": { id: "CIQ_I_1_Case_to_supplier_request_A00", app: APP_ID },
  "review.reopened": { id: "CIQ_Review_reopened_to_supplier_re_A00", app: APP_ID },
  "op.round": { id: "CIQ_op_round_Open_point_question_t_A00", app: APP_ID },
  "op.edited": { id: "CIQ_op_edited_Open_point_question__A00", app: APP_ID },
  "op.closed": { id: "CIQ_op_closed_Open_point_closed_A00", app: APP_ID },
  "release.requested": { id: "CIQ_release_requested_Final_releas_A00", app: APP_ID },
  "history.updated": { id: "CIQ_history_updated_Questions_hist_A00", app: APP_ID },
  "case.cancelled": { id: "CIQ_case_cancelled_Case_cancelled_A00", app: APP_ID },
  requestChanged: { id: "CIQP_Request_changed_to_case_A00", app: PORTAL_ID },
  completenessConfirmed: { id: "CIQP_Completeness_confirmed_to_cas_A00", app: PORTAL_ID },
  queryAnswered: { id: "CIQP_Query_answered_to_open_point_A00", app: PORTAL_ID },
  releaseGiven: { id: "CIQP_Final_release_to_case_A00", app: PORTAL_ID },
  "change.received": undefined,
  "case.reactivated": undefined,
  "scope.extended": undefined,
  "case.contacts": undefined,
};
/** The 8 app codes SET:current must carry (S-FORMS "Config"). */
export const APP_HOOK_CODES = (Object.keys(INTEGRATIONS) as HookCode[]).filter((c): c is HandoffCode => INTEGRATIONS[c]?.app === APP_ID);

const isPortalCode = (c: HookCode): c is PortalCode => (PORTAL_CODES as readonly string[]).includes(c);

export interface Hooks {
  /** The codes that have a URL (never the URLs themselves). */
  codes(): { app: HandoffCode[]; portal: PortalCode[] };
  /** Built integrations whose URL is missing (an empty list when SET:current is complete). */
  missing(): HookCode[];
  /** The URLs for wiring the screens' own code (WriteCtx.webhooks, liveActions opts.webhooks); never print them. */
  urls(): { app: Partial<Record<HandoffCode, string>>; portal: Partial<Webhooks> };
  /** POSTs a payload the way the screens do (with an idempotencyKey), through the guarded client. */
  post(code: HookCode, payload: Record<string, unknown>): Promise<void>;
  /** pollUntil on the world's clock. */
  poll<T>(read: () => Promise<T>, test: (v: T) => boolean, o?: { everyMs?: number; maxMs?: number }): Promise<Polled<T>>;
}

export async function loadHooks(o: { client: LiveAppClient; portal: LivePortalClient; guard: Guard; portalHooks: Webhooks; clock: Clock }): Promise<Hooks> {
  // the screens' own lookup: the config rows, the SET:current singleton, webhooksOf (https URLs of known codes only)
  const app = webhooksOf(settingsOf(await o.client.formList("config")));
  const portal: Partial<Webhooks> = Object.fromEntries(PORTAL_CODES.filter((c) => !!o.portalHooks[c]).map((c) => [c, o.portalHooks[c]]));
  for (const [c, url] of Object.entries(app)) o.guard.knowHook(c as HookCode, url);
  for (const [c, url] of Object.entries(portal)) o.guard.knowHook(c as HookCode, url);
  let seq = 0;
  return {
    codes: () => ({ app: Object.keys(app) as HandoffCode[], portal: Object.keys(portal) as PortalCode[] }),
    missing: () => (Object.keys(INTEGRATIONS) as HookCode[]).filter((c) => INTEGRATIONS[c] && !(isPortalCode(c) ? portal[c] : app[c as HandoffCode])),
    urls: () => ({ app: { ...app }, portal: { ...portal } }),
    async post(code, payload) {
      const url = isPortalCode(code) ? portal[code] : app[code];
      if (!url) throw new GuardError(`no webhook URL is known for ${code}.`);
      const body = { ...payload, idempotencyKey: `HO-${code}-${o.guard.tag}-${o.clock.now().toString(36)}-${++seq}` };
      if (isPortalCode(code)) await o.portal.postWebhook(url, body);
      else await o.client.postWebhook(url, body);
    },
    poll: (read, test, x = {}) => pollUntil(read, test, { ...x, clock: o.clock }),
  };
}

export interface Polled<T> {
  ok: boolean;
  /** The last value read (the one that passed when ok). */
  value?: T;
  polls: number;
  ms: number;
  /** The last read's error, when the last read failed. */
  error?: string;
}

/**
 * Waits for an integration's effect: `everyMs` (6 s), then a read through the client, until `test` passes or `maxMs`
 * (60 s) is over. A read that fails (the item not there yet) is polled again; a StopError or a guard refusal ends it
 * at once. The wait is on `clock` (the queue's: offline it costs no real time).
 */
export async function pollUntil<T>(read: () => Promise<T>, test: (v: T) => boolean, o: { everyMs?: number; maxMs?: number; clock: Clock }): Promise<Polled<T>> {
  const every = o.everyMs ?? 6000;
  const max = o.maxMs ?? 60000;
  const t0 = o.clock.now();
  let polls = 0;
  let value: T | undefined;
  let error: string | undefined;
  while (o.clock.now() - t0 < max) {
    await o.clock.sleep(every);
    polls++;
    try {
      value = await read();
      error = undefined;
      if (test(value)) return { ok: true, value, polls, ms: o.clock.now() - t0 };
    } catch (e) {
      if (e instanceof StopError || e instanceof GuardError) throw e;
      error = errorText(e);
    }
  }
  return { ok: false, ...(value !== undefined ? { value } : {}), polls, ms: o.clock.now() - t0, ...(error ? { error } : {}) };
}

export interface IntegrationState {
  code: HookCode;
  id: string;
  app: string;
  status?: string;
  isActive?: boolean;
}

/** SPEC §2: each run checks, read-only, that all 12 integrations are Live and switched on (both apps' lists). */
export async function checkIntegrations(client: LiveAppClient): Promise<{ ok: boolean; states: IntegrationState[]; problems: string[] }> {
  const lists = new Map<string, Record<string, unknown>[]>();
  for (const app of [APP_ID, PORTAL_ID]) lists.set(app, rowsOf(await client.getRaw(`/flow/2/${client.accountId}/integration/?_application_id=${app}&page_number=1&page_size=300`)) as Record<string, unknown>[]);
  const states: IntegrationState[] = [];
  const problems: string[] = [];
  for (const code of Object.keys(INTEGRATIONS) as HookCode[]) {
    const i = INTEGRATIONS[code];
    if (!i) continue;
    const row = lists.get(i.app)?.find((r) => r._id === i.id);
    const s: IntegrationState = { code, id: i.id, app: i.app, ...(row ? { status: String(row.Status ?? ""), isActive: row.IsActive === true } : {}) };
    states.push(s);
    if (!row) problems.push(`${code}: integration ${i.id} is not listed.`);
    else if (s.status !== "Live" || !s.isActive) problems.push(`${code}: ${i.id} is ${s.status || "?"}, ${s.isActive ? "ON" : "OFF"}.`);
  }
  return { ok: !problems.length, states, problems };
}
