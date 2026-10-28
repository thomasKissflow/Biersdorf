// FE-CLEANUP (22 Oct): what production tells a tester. plainError maps every raw cause the client, the writers and the
// SDK give (the inventory's C-store table) to a plain sentence with no Kissflow code, flow or item id; the app's own
// texts pass unchanged; dev keeps the raw cause; one toast per load-time effect.
import { describe, expect, it } from "vitest";
import { LIVE_FEATURES, PROTOTYPE_FEATURES, type LiveFeatures } from "@/components/liveFeatures";
import { AppError, NOT_IN_APP } from "./kf/client";
import { ROOT_OPTIONS } from "./rootOptions";
import { NO_PORTAL_CONTACT, NO_WEBCRYPTO, PlainError, RELEASE_UNUSABLE, causeFor, effectToasts, errorFor, plainCause, plainError, startText, trimEnd, unfinishedText, type EffectTally } from "./userText";
import { VerifyError } from "./write/verify";

/** What a tester must never read in production (the harness's TECH, for strings). */
const TECH = /KISSFLOW_ERROR|\b05\d{4}\b|_A00\b|\b[A-Z][A-Za-z]*_[A-Z][A-Za-z_]*\b|\((SDK|REST|fetch)\)|\[unverified\]|Diagnostics|\{|\bkeys?:|WebCrypto|JSON|\.\./;

const RAW: [string, unknown, string][] = [
  ["a field refusal (050313)", new AppError(`KISSFLOW_ERROR_050313 You don't have permission to update the following fields: {"CIQ_Open_Point_A00": ["OP_Outcome"]}.`), "Kissflow did not allow this for your role."],
  ["an item refusal (050302)", new AppError("KISSFLOW_ERROR_050302 You don't have permission to access this item."), "Kissflow did not allow this for your role."],
  ["PermissionDeniedToUpdate", new AppError("PermissionDeniedToUpdate"), "Kissflow did not allow this for your role."],
  ["a 403", new AppError("Request failed with status 403"), "Kissflow did not allow this for your role."],
  ["a rate limit (status 429)", { status: 429, message: "Too Many Requests" }, "Kissflow is busy right now. Wait a minute, then try again."],
  ["a rate limit (text)", new AppError("429 Too Many Requests"), "Kissflow is busy right now. Wait a minute, then try again."],
  ["the 30 s bound", new AppError("Kissflow did not answer within 30 s. If you were saving or sending, reload to see whether it went through."), "Kissflow did not answer in time. Reload to see whether it went through."],
  ["the webhook's bound", new AppError("The webhook did not answer within 30 s. If you were saving or sending, reload to see whether it went through."), "Kissflow did not answer in time. Reload to see whether it went through."],
  ["a task that moved on (050201)", new AppError("KISSFLOW_ERROR_050201 This item has moved out of your queue."), "This is no longer one of your open tasks in Kissflow. Reload to see its current state."],
  ["a VerifyError", new VerifyError(["OP_Outcome", "Closed_At"], 3), "Kissflow did not keep every value. Reload and check the result."],
  ["a network error", new TypeError("Failed to fetch"), "The connection to Kissflow was interrupted. Try again."],
  ["SDK then REST", new AppError("Kissflow answered without the item. (SDK); KISSFLOW_ERROR_00500 Try again later. (REST)"), "Kissflow could not complete the request."],
  ["fetch then SDK", new AppError("TypeError: Failed to fetch (fetch); This page has no Kissflow API route (not available). (SDK)"), "The connection to Kissflow was interrupted. Try again."],
  ["the SDK's JSON fallback", { odd: true, nested: { x: 1 } }, "Kissflow could not complete the request."],
  ["a list in an unknown shape", new Error("Kissflow answered a list in an unknown shape (keys: rows, size)."), "Kissflow could not complete the request."],
  ["a different item", new AppError("Kissflow answered with a different item (PkOther)."), "Kissflow could not complete the request."],
  ["a list too long", new AppError("More than 10000 items: the list was not read completely."), "Kissflow could not complete the request."],
  ["a draft without its step", new AppError("Kissflow created CIQ_Case_A00 item PkCase9 without naming its step. It waits as a draft under My items."), "Kissflow could not complete the request."],
  // not a role refusal: Kissflow's validation (050312), an item it no longer finds, a fault of the app itself
  ["a mandatory field at submit (050312)", new AppError("KISSFLOW_ERROR_050312 Validation failed for the following fields: {'OP_Outcome': ['This field is mandatory']}"), "Kissflow still needs some required information. Reload and try again; if it stays, tell your CIQ administrator."],
  ["a value Kissflow does not take (050312)", new AppError("KISSFLOW_ERROR_050312 Validation failed for the following fields: {'Response_Decision': ['Invalid value']}"), "Kissflow did not accept one of the values. Reload and try again; if it stays, tell your CIQ administrator."],
  ["an item not found (01015)", new AppError("KISSFLOW_ERROR_01015 Item not found"), "Kissflow could not find this item any more. Reload to see the current state."],
  ["a 404", new AppError("Request failed with status 404"), "Kissflow could not find this item any more. Reload to see the current state."],
  ["a fault of the app (TypeError)", new TypeError("Cannot read properties of undefined (reading 'Case_Item_Id')"), "Something went wrong in CIQ Digital. Reload and try again; if it stays, tell your CIQ administrator."],
  ["a fault of the app (ReferenceError)", new ReferenceError("x is not defined"), "Something went wrong in CIQ Digital. Reload and try again; if it stays, tell your CIQ administrator."],
];

describe("plainError (C-store table)", () => {
  for (const [what, e, want] of RAW)
    it(`${what} → “${want}”`, () => {
      expect(plainError(e)).toBe(want);
      expect(plainError(e)).not.toMatch(TECH);
    });

  it("passes the app's own words unchanged: a PlainError and the not-in-the-app text", () => {
    expect(plainError(new PlainError("This case is no longer loaded. Reload and try again."))).toBe("This case is no longer loaded. Reload and try again.");
    expect(plainError(new AppError(NOT_IN_APP))).toBe(NOT_IN_APP);
  });

  it("a role refusal is said only for a refusal: never for a validation, a missing item or the app's own fault", () => {
    const role = /did not allow this for your role/;
    for (const [what, e] of RAW.slice(-6)) expect(plainError(e), what).not.toMatch(role);
    for (const [what, e] of RAW.slice(0, 4)) expect(plainError(e), what).toMatch(role);
  });

  it("the cause alone, to go inside a sentence (no closing full stop)", () => {
    expect(plainCause(new AppError("KISSFLOW_ERROR_050302 You don't have permission to access this item."))).toBe("Kissflow did not allow this for your role");
    expect(plainCause(new TypeError("Failed to fetch"))).toBe("the connection to Kissflow was interrupted");
    expect(plainCause(new PlainError("The draft is no longer listed."))).toBe("The draft is no longer listed");
  });
});

describe("trimEnd, causeFor, errorFor (A2, A15)", () => {
  it("drops the cause's own full stops, so a sentence can go on after it", () => {
    expect(trimEnd("You don't have permission to access this item. ")).toBe("You don't have permission to access this item");
    expect(trimEnd("…has no RMES record..")).toBe("…has no RMES record");
    expect(trimEnd("no stop")).toBe("no stop");
  });

  it("dev keeps the raw cause; prod says it plainly and keeps the raw one for the Writes log", () => {
    const e = new AppError("KISSFLOW_ERROR_050302 You don't have permission to access this item.");
    const dev: string[] = [];
    expect(causeFor("dev", e, dev)).toBe("KISSFLOW_ERROR_050302 You don't have permission to access this item");
    expect(causeFor(undefined, e, dev)).toBe("KISSFLOW_ERROR_050302 You don't have permission to access this item");
    expect(dev).toEqual([]);
    const prod: string[] = [];
    expect(causeFor("prod", e, prod)).toBe("Kissflow did not allow this for your role");
    expect(prod).toEqual(["KISSFLOW_ERROR_050302 You don't have permission to access this item"]);
    expect(errorFor("dev", e)).toBe("KISSFLOW_ERROR_050302 You don't have permission to access this item.");
    expect(errorFor("prod", e)).toBe("Kissflow did not allow this for your role.");
  });

  it("C21: caseStartPayload's reasons, as production says them; dev keeps them", () => {
    expect(startText("prod", "The release's bundle is not valid JSON.")).toBe(RELEASE_UNUSABLE);
    expect(startText("prod", "The release does not name its rule set and questionnaire versions.")).toBe(RELEASE_UNUSABLE);
    expect(startText("prod", "This browser can't compute the questionnaire fingerprint (no WebCrypto).")).toBe(NO_WEBCRYPTO);
    expect(startText("dev", "The release's bundle is not valid JSON.")).toBe("The release's bundle is not valid JSON.");
    for (const t of [RELEASE_UNUSABLE, NO_WEBCRYPTO, NO_PORTAL_CONTACT]) expect(t).not.toMatch(TECH);
  });

  it("C21+: the backstop's no-portal-user reason (shared/, the portal session's file, unchanged) reads as the guard's in both environments", () => {
    // the text shared/caseStartPayload.ts throws (its own end names an action RMM can't take in any screen)
    const backstop = "None of the active supplier contacts has a portal user yet, so nobody would get the questionnaire. Invite a contact to the portal first.";
    for (const env of ["dev", "prod", undefined] as const) expect(startText(env, backstop)).toBe(NO_PORTAL_CONTACT);
    expect(NO_PORTAL_CONTACT.startsWith("None of the active supplier contacts has a portal user yet, so nobody would get the questionnaire.")).toBe(true); // TEST-GUIDE-PROD quotes it
    expect(NO_PORTAL_CONTACT).toMatch(/Ask your CIQ administrator to link a contact to its supplier-portal user, then start the case\.$/);
  });

  it("C12: a partial save's “Not finished:” says to reload once: its own words when the cause already says it", () => {
    expect(unfinishedText(new AppError("KISSFLOW_ERROR_050302 You don't have permission to access this item."))).toBe("Kissflow did not allow this for your role. Reload to see the current state.");
    expect(unfinishedText(new AppError("Kissflow did not answer within 30 s. If you were saving or sending, reload to see whether it went through."))).toBe("Kissflow did not answer in time. Reload to see whether it went through.");
    expect(unfinishedText(new AppError("KISSFLOW_ERROR_050201 This item has moved out of your queue."))).toBe("This is no longer one of your open tasks in Kissflow. Reload to see its current state.");
    for (const [what, e] of RAW) expect(unfinishedText(e).match(/\breload\b/gi), what).toHaveLength(1);
  });
});

describe("effectToasts (A13, C14)", () => {
  // the RMES record is the one load-time effect since 22 Oct (the reviews and the release request are the integrations')
  const rmes = (caseId: string, failed = false, message = failed ? `Not started: ${caseId} Safety RMES record (KISSFLOW_ERROR_050302 no permission).` : `Started in Kissflow: ${caseId} Safety RMES record (12 criteria).`): EffectTally => ({ effect: "ensureRmes", caseId, ok: !failed, message, tone: failed ? "warning" : "info", done: failed ? [] : ["created"], failed: failed ? ["failed"] : [] });

  it("one toast per effect and load, however many cases (four cases were four toasts, and the toaster keeps four)", () => {
    const rows = ["ZZT-1", "ZZT-2", "ZZT-3", "ZZT-4"].map((c) => rmes(c, true));
    expect(effectToasts(rows, "dev")).toHaveLength(1);
    expect(effectToasts(rows, "prod")).toEqual([{ tone: "warning", text: "The RMES record of ZZT-1, ZZT-2, ZZT-3 and ZZT-4 could not be created just now. CIQ Digital tries again the next time you open it." }]);
  });

  it("dev joins the effects' own texts, with the gravest tone", () => {
    const ok = rmes("ZZT-1");
    const bad = rmes("ZZT-2", true);
    expect(effectToasts([ok, bad], "dev")).toEqual([{ tone: "warning", text: `${ok.message} ${bad.message}` }]);
    // a result without a message that failed: the store's plain fallback
    expect(effectToasts([{ effect: "ensureRmes", caseId: "ZZT-3", ok: false }], "dev")).toEqual([{ tone: "danger", text: "ZZT-3: the RMES record could not be saved." }]);
  });

  it("prod: what failed and that it is tried again; no item id, no cause; a record created is housekeeping", () => {
    expect(effectToasts([rmes("ZZT-1")], "prod")).toEqual([]);
    expect(effectToasts([rmes("ZZT-1", true)], "prod")).toEqual([{ tone: "warning", text: "The RMES record of ZZT-1 could not be created just now. CIQ Digital tries again the next time you open it." }]);
    // an effect that threw (runLoadEffects' catch): no tally, not ok
    expect(effectToasts([{ effect: "ensureRmes", caseId: "ZZT-9", ok: false, message: "ZZT-9: the RMES record could not be created (boom)." }], "prod")).toEqual([{ tone: "warning", text: "The RMES record of ZZT-9 could not be created just now. CIQ Digital tries again the next time you open it." }]);
  });
});

describe("LiveFeatures (D2 kept honest, A7)", () => {
  it("the prototype's default does everything it shows; the live app lacks exactly the flagged features", () => {
    const keys = Object.keys(PROTOTYPE_FEATURES) as (keyof LiveFeatures)[];
    expect(keys.every((k) => PROTOTYPE_FEATURES[k])).toBe(true);
    expect(keys.every((k) => !LIVE_FEATURES[k])).toBe(true);
    expect(Object.keys(LIVE_FEATURES).sort()).toEqual([...keys].sort());
  });
});

describe("the React root (console)", () => {
  it("a crash a boundary caught is logged once, by the boundary: React's own onCaughtError logs nothing", () => {
    const seen: unknown[] = [];
    const real = console.error;
    console.error = (...a: unknown[]) => void seen.push(a);
    try {
      ROOT_OPTIONS.onCaughtError();
    } finally {
      console.error = real;
    }
    expect(typeof ROOT_OPTIONS.onCaughtError).toBe("function");
    expect(seen).toEqual([]);
  });
});
