import { describe, expect, it } from "vitest";
import { denyHits } from "../../scripts/workbench-deny.mjs";
import { DEV_ACCOUNT, KISSFLOW_HOST, envOf, hookHostOf, type PageLike } from "./env";

describe("envOf (Thomas, 20 Oct: the dev sandbox → role switcher; production → no top bar)", () => {
  it("the dev sandbox account is dev", () => {
    expect(envOf(DEV_ACCOUNT)).toBe("dev");
  });
  it("every other account, or none, is production", () => {
    expect(envOf("AcPRODHARNESS")).toBe("prod");
    expect(envOf("")).toBe("prod");
    expect(envOf(undefined)).toBe("prod");
  });
});

describe("hookHostOf (Thomas, 21 Oct: the hand-off URLs are built on the Kissflow page around the frame)", () => {
  const page = (ancestors: string[] | undefined, referrer = ""): PageLike => ({ location: ancestors ? { ancestorOrigins: ancestors } : {}, document: { referrer } });

  it("the parent's origin: the dev sandbox's host, or production's on another Kissflow domain", () => {
    expect(hookHostOf(page(["https://dev-beiersdorf.kissflow.eu"]))).toBe("dev-beiersdorf.kissflow.eu");
    expect(hookHostOf(page(["https://ciq-prod.kissflow.com"], "https://dev-beiersdorf.kissflow.eu/"))).toBe("ciq-prod.kissflow.com");
  });

  it("without ancestorOrigins (Firefox), or with none, the origin of the referrer", () => {
    expect(hookHostOf(page(undefined, "https://ciq-prod.kissflow.com/view/app/CIQ_Digital_A00?x=1#y"))).toBe("ciq-prod.kissflow.com");
    expect(hookHostOf(page([], "https://dev-beiersdorf.kissflow.eu/"))).toBe("dev-beiersdorf.kissflow.eu");
  });

  it("neither, or a parent that is not an https Kissflow page: no host (the hand-off goes by kf.api on a relative path)", () => {
    expect(hookHostOf(page(undefined))).toBeUndefined();
    expect(hookHostOf({})).toBeUndefined();
    expect(hookHostOf()).toBeUndefined(); // vitest's node: no window
    for (const parent of ["http://dev-beiersdorf.kissflow.eu", "https://hooks.example", "https://kissflow.eu", "https://dev-beiersdorf.kissflow.eu.attacker.example", "https://evil-kissflow.com", "https://dev-beiersdorf.kissflow.eu:8443", "null", ""]) {
      expect(hookHostOf(page([parent]))).toBeUndefined();
      expect(hookHostOf(page(undefined, parent))).toBeUndefined();
    }
    expect(hookHostOf(page(["https://u:p@dev-beiersdorf.kissflow.eu"]))).toBeUndefined(); // an origin carries no user info
    // a known parent that is not acceptable is not second-guessed from the referrer
    expect(hookHostOf(page(["http://127.0.0.1:5340"], "https://dev-beiersdorf.kissflow.eu/"))).toBeUndefined();
  });

  it("names no host in the bundle: the pattern's own text is no deny-list hit (scripts/workbench-deny.mjs)", () => {
    expect(denyHits(String(KISSFLOW_HOST))).toEqual([]);
  });
});
