// Ids of the live CIQ Supplier Portal (v5, as built 14 Oct 2026: kissflow-build/ciq-supplier-portal/NIGHT-2026-10-14.md,
// portal-spec.mjs). The ONLY place the UI knows Kissflow ids. Role ids are matched first, names as a fallback (master.md §6.7).
import type { Kf } from "./sdk";

export const PORTAL_ID = "CIQ_Supplier_Portal_A00";

export const ROLES = {
  supplier: { id: "RoEK4XPKXCvH", name: "Supplier" },
  admin: { id: "RoEK3_yhR4wx", name: "Admin" },
} as const;

/**
 * Every portal flow. `v5: false` marks the flows plan v5 §3.5 no longer uses (the Supplier grant was removed; they stay
 * published because the API can't delete them). The supplier screens never read them; the builders' admin pages
 * still list them, read-only in practice.
 */
export const FLOWS = {
  request: { id: "CIQP_Request_A00", name: "CIQP Request", kind: "process", v5: true },
  query: { id: "CIQP_Query_A00", name: "CIQP Query", kind: "process", v5: true },
  /** Not used since 16 Oct: the final release is a step of CIQP Request (Thomas). Its Supplier grant is still on. */
  finalRelease: { id: "CIQP_Final_Release_A00", name: "CIQP Final Release", kind: "process", v5: false },
  helpArticle: { id: "CIQP_Help_Article_A00", name: "CIQP Help Article", kind: "form", v5: true },
  section: { id: "CIQP_Section_A00", name: "CIQP Section", kind: "process", v5: false },
  completeness: { id: "CIQP_Completeness_Confirmation_A00", name: "CIQP Completeness Confirmation", kind: "process", v5: false },
  notice: { id: "CIQP_Notice_A00", name: "CIQP Notice", kind: "process", v5: false },
  changeRequest: { id: "CIQP_Change_Request_A00", name: "CIQP Change Request", kind: "process", v5: false },
} as const;

/** The supplier steps (activity ids as built; S-5 read them back). */
export const STEPS = {
  /** CIQP Request "Supplier: fill in the CIQ": submitting it is the completeness confirmation (B-10). */
  fill: { flow: "request", activity: "Activity_15rz7z2", name: "Supplier: fill in the CIQ" },
  /** CIQP Request "Supplier: keep the CIQ up to date": held through the review. Once Beiersdorf requested the final
   *  release (Release_Flag "Requested") the screen submits it while loading, without writing a field (Thomas, 21 Oct: a
   *  REST/SDK submit ignores Mandatory fields, proven live; Keep_Open_Gate is a formula), and the request moves on to
   *  "give the final release" (liveActions.ts moveAtReleaseSteps). */
  keep: { flow: "request", activity: "Activity_1mhx3t7", name: "Supplier: keep the CIQ up to date" },
  /** CIQP Query "Supplier: respond". */
  respond: { flow: "query", activity: "Activity_qohzey", name: "Supplier: respond" },
  /** CIQP Request "Supplier: give the final release" (built 16 Oct): assigned from Release_Contacts (the contacts who
   *  may confirm); every field is ReadOnly there except Release_By_Name, Release_At and (added 21 Oct, REQ-PROC-042)
   *  Release_By_Email and Release_By_Role, so Kissflow itself locks the questionnaire. After it, a go-to step returns the
   *  request to "keep up to date" when Release_Flag is "Reopened"; otherwise it is held at "view the released CIQ".
   *  After a reopen the screen submits it while loading, without the release fields, so the go-to returns the request
   *  to editing (Thomas, 21 Oct; liveActions.ts moveAtReleaseSteps). */
  release: { flow: "request", activity: "Activity_wlo2cfxnqa", name: "Supplier: give the final release" },
  /** CIQP Request "Supplier: view the released CIQ" (built 20 Oct, plan v6 D-11): held after the release; the screen
   *  never submits it, so the released request stays the supplier's task; every answer is ReadOnly there, only the
   *  change-report fields are editable ("Report a change"). */
  released: { flow: "request", activity: "Activity_vngcws1q8w", name: "Supplier: view the released CIQ" },
} as const;

export type StepKey = keyof typeof STEPS;

/**
 * The hand-offs the supplier's screen starts (plan v6 §4, §4.1, §4.2): one webhook integration each in the portal,
 * built, step-tested and switched on in the Development sandbox on 20 Oct. Each payload carries only the id of the item
 * the screen acted on (plus an idempotency key); the integration reads everything else from Kissflow and refuses what
 * does not hold there, so a forged call can do no harm.
 * - `requestChanged`: after each successful save, upload, removal or change report ({portalRequestItemId}): the
 *   request's supplier data onto its app case.
 * - `completenessConfirmed`: after the submit of "fill in the CIQ" ({portalRequestItemId}): I-2, the confirmation and
 *   the answers onto the case, which moves on to Beiersdorf's review.
 * - `queryAnswered`: after the submit of "respond" ({portalQueryItemId}): I-4, the answer onto the app open point.
 * - `releaseGiven`: after the submit of "give the final release" ({portalRequestItemId}): I-7, the release onto the
 *   case, which completes.
 * Thomas, 21 Oct: production differs from the Development sandbox in BOTH its account id and its domain; the webhook
 * tokens are the same. So the URLs are built at runtime, never written for production:
 * - the TOKENS come from DEV_WEBHOOKS (the sandbox's URLs, kept only for them): each is the last segment of the path
 *   /integration/2/<account>/webhook/<token> (hookToken); a URL without exactly that shape gives no token, and its
 *   hand-off sends nothing;
 * - the ACCOUNT is the page's own (the SDK handshake);
 * - the HOST is the Kissflow page the UI runs in (parentHost: location.ancestorOrigins[0], else the origin of
 *   document.referrer, accepted only when it is https on a Kissflow domain).
 * webhooksFor builds "https://<host>/integration/2/<account>/webhook/<token>" when the host is known, the RELATIVE path
 * "/integration/2/<account>/webhook/<token>" when it is not (the SDK's kf.api sends a relative path to the account's own
 * domain: client.ts postWebhook), and nothing when the account is unknown. On the dev account inside the sandbox each
 * URL is exactly the stored one. No production host or account is written here. postWebhook sends nothing that is
 * not exactly such a URL or path (hookToken, isHookPath), on either route.
 */
export interface Webhooks {
  requestChanged: string;
  completenessConfirmed: string;
  queryAnswered: string;
  releaseGiven: string;
}
export const NO_WEBHOOKS: Webhooks = { requestChanged: "", completenessConfirmed: "", queryAnswered: "", releaseGiven: "" };
/** The Development sandbox's hook URLs: the source of the four tokens only (webhooksFor). */
export const DEV_WEBHOOKS: Webhooks = {
  requestChanged: "https://dev-beiersdorf.kissflow.eu/integration/2/AcDOSunMEpSA/webhook/lZnEnOEqg-kn-0d83re9OCfCB05Q87MHg96E3X7Jy93eKnTehyjJxEOYVNqoFapObe57ZK-Bzc59hMUdJOg",
  completenessConfirmed: "https://dev-beiersdorf.kissflow.eu/integration/2/AcDOSunMEpSA/webhook/AFMME2sIFEad-OF5bDdNLa6jeskmbE3lgFtOx7v5pQI5Rry-lWUifUpZWTiCmgvfIfHrOPSrkre4J2hcUY5lg",
  queryAnswered: "https://dev-beiersdorf.kissflow.eu/integration/2/AcDOSunMEpSA/webhook/Ejk7SzcSYLy0PUnygJXYixx903FbfzdYHb0Hyd4aN-O0aukmFwhcdzRsI2rm-bfm8Jix3zRPj6M3b1zFLGbKg",
  releaseGiven: "https://dev-beiersdorf.kissflow.eu/integration/2/AcDOSunMEpSA/webhook/eJ0HjozJQDqipkuXZRL1lP9hpQEro0WAbZGdSHEDln00YJ4Gou4TdNm-TUxM5PEGt9bpKgcqN-gtAvk2iXE7A",
};

/** A hook path: /integration/2/<account>/webhook/<token>. */
const HOOK_PATH = /^\/integration\/2\/[A-Za-z0-9_-]+\/webhook\/([A-Za-z0-9_-]+)$/;
/** An account id as the handshake carries it (it becomes a path segment). */
const ACCOUNT_ID = /^[A-Za-z0-9_-]+$/;
/** Kissflow's own domains, as a pattern: a host written as text is what the zip guards refuse (DENY_HOSTS). */
const KISSFLOW_HOST = /\.kissflow\.(eu|com)$/i;

/** Whether a path is exactly a hook path /integration/2/<account>/webhook/<token>: nothing before or after it, no
 *  "//" or "/\" (another host), no tab, newline or space (the URL parser drops them), no query and no fragment. The
 *  only paths client.ts postWebhook sends through the SDK. */
export function isHookPath(path: string): boolean {
  return HOOK_PATH.test(path);
}

/** The webhook token of a stored hook URL: the last segment of its path /integration/2/<account>/webhook/<token>. ""
 *  (that hand-off sends nothing) for any URL without exactly that shape: not an https URL, another path, an escaped
 *  character in it, user info, a query or a fragment around it (even an empty "?" or "#"), or anything the URL parser
 *  would rewrite (a tab, newline or space, a default port, a backslash): the URL must be written exactly as it reads. */
export function hookToken(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "";
  }
  if (u.protocol !== "https:" || u.username || u.password || /[?#]/.test(url) || u.href !== url) return "";
  return HOOK_PATH.exec(u.pathname)?.[1] ?? "";
}

/** The host of a Kissflow page from its origin (or any URL of it): only an https origin on a Kissflow domain, without
 *  a port, counts; anything else (another scheme, another domain, garbage) gives undefined. */
export function kissflowHostOf(origin: string | null | undefined): string | undefined {
  if (!origin) return undefined;
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && !u.port && KISSFLOW_HOST.test(u.hostname) ? u.hostname : undefined;
  } catch {
    return undefined;
  }
}

/** What parentHost reads of a window. */
export interface ParentWindow {
  location?: { ancestorOrigins?: ArrayLike<string> };
  document?: { referrer?: string };
}

/** The host of the Kissflow page this UI runs in (its parent): location.ancestorOrigins[0] where the browser has it,
 *  else the origin of document.referrer; accepted only when it is https on a Kissflow domain (kissflowHostOf).
 *  undefined (unknown: the hand-offs then go as relative paths through the SDK) for anything else, and outside a
 *  browser. */
export function parentHost(w: ParentWindow | undefined = typeof window === "undefined" ? undefined : window): string | undefined {
  try {
    const ancestor = w?.location?.ancestorOrigins?.[0];
    const referrer = w?.document?.referrer;
    return kissflowHostOf(ancestor || (referrer ? new URL(referrer).origin : undefined));
  } catch {
    return undefined;
  }
}

/** The hand-off webhooks of the account the page runs in (Thomas, 21 Oct): each sandbox token on this account's path,
 *  on the Kissflow host around the page when it is known ("https://<host>/integration/2/<account>/webhook/<token>"),
 *  else as the relative path ("/integration/2/<account>/webhook/<token>", which the SDK sends to the account's own
 *  domain); none when the account is unknown (or not an id). A host that is not a Kissflow host, exactly as
 *  parentHost gives it, counts as unknown. */
export function webhooksFor(accountId: string | undefined, host?: string): Webhooks {
  if (!accountId || !ACCOUNT_ID.test(accountId)) return NO_WEBHOOKS;
  const origin = host && kissflowHostOf(`https://${host}`) === host ? `https://${host}` : "";
  const url = (k: keyof Webhooks) => {
    const token = hookToken(DEV_WEBHOOKS[k]);
    return token ? `${origin}/integration/2/${accountId}/webhook/${token}` : "";
  };
  return { requestChanged: url("requestChanged"), completenessConfirmed: url("completenessConfirmed"), queryAnswered: url("queryAnswered"), releaseGiven: url("releaseGiven") };
}

declare const __CIQ_MAIL_TOKEN__: string | undefined;
/** The webhook of "Mail Integration - Thomas" (22 Oct): {To, Subject, Body} in, one e-mail out. Built like the hand-offs
 *  (the page's Kissflow host and account; the token from the build, vite.portal.config.ts); "" when either is unknown. */
export function mailHookFor(accountId: string | undefined, host?: string, token: string = typeof __CIQ_MAIL_TOKEN__ === "string" ? __CIQ_MAIL_TOKEN__ : ""): string {
  if (!accountId || !ACCOUNT_ID.test(accountId) || !/^[A-Za-z0-9_-]+$/.test(token)) return "";
  const origin = host && kissflowHostOf(`https://${host}`) === host ? `https://${host}` : "";
  return `${origin}/integration/2/${accountId}/webhook/${token}`;
}

/** The child table of CIQP Request with one metadata row per supplier file (as built 14 Oct). */
export const UPLOADS_TABLE = "CIQP_Request_A00_Uploads";
/** The header Attachment field holding every supplier file; an upload adds, never replaces (S-2c). */
export const FILES_FIELD = "Supplier_Files";

export type FlowKey = keyof typeof FLOWS;
export type PortalRole = "admin" | "supplier" | "none";
/** A portal role a user can hold. */
export type HeldRole = Exclude<PortalRole, "none">;

/** The portal roles among a user's Kissflow roles (by id, or by name as a fallback), Admin first. */
export function heldPortalRoles(roles: { id: string; name: string }[]): HeldRole[] {
  const has = (r: { id: string; name: string }) => roles.some((x) => (!!x.id && x.id === r.id) || (!!x.name && x.name === r.name));
  return (["admin", "supplier"] as const).filter((k) => has(ROLES[k]));
}

/** The signed-in user's portal role from kf.user.AppRoles (production signal). Admin wins if a user holds both. */
export function portalRoleOf(kf: Kf): PortalRole {
  const roles = (kf.user?.AppRoles ?? []).map((r) => ({ id: r._id, name: r.Name }));
  return heldPortalRoles(roles)[0] ?? "none";
}
