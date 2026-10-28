import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, parseParams } from "./params";

describe("host params (§11.2)", () => {
  it("defaults first: dev user, CIQ_Digital_A00, live envelope, participated error, admin list ok, adminStep omit", () => {
    const p = parseParams({});
    expect(p).toEqual(DEFAULT_PARAMS);
    expect(p.appId).toBe("CIQ_Digital_A00");
    expect(p.dev).toBe(true);
  });
  it("dev defaults to on for the dev user only; dev=1 also works for others", () => {
    expect(parseParams({ user: "jo" }).dev).toBe(false);
    expect(parseParams({ user: "jo", dev: "1" }).dev).toBe(true);
    expect(parseParams({ user: "dev", dev: "0" }).dev).toBe(false);
  });
  it("parses race, formDrop and numbers", () => {
    expect(parseParams({ race: "CIQ_Case_A00:1" }).race).toEqual({ target: "CIQ_Case_A00", n: 1 });
    expect(parseParams({ race: "CIQ_Case_A00:always" }).race).toEqual({ target: "CIQ_Case_A00", n: "always" });
    expect(parseParams({ race: "child:2" }).race).toEqual({ target: "child", n: 2 });
    expect(parseParams({ formDrop: "CIQ_Audit_Event_A00:Notify_Recipient" }).formDrop).toEqual({ flow: "CIQ_Audit_Event_A00", field: "Notify_Recipient" });
    expect(parseParams({ writeDelay: "31000", writeDelayOnce: "1" })).toMatchObject({ writeDelay: 31000, writeDelayOnce: true });
  });
  it("throws on a typo, so a scenario never silently runs the kind default", () => {
    expect(() => parseParams({ kwb: "refused" })).toThrow(/kwb/);
    expect(() => parseParams({ racee: "x" })).toThrow(/unknown host param/);
    expect(() => parseParams({ race: "CIQ_Nope_A00:1" })).toThrow(/unknown flow/);
    expect(() => parseParams({ extra: "-1" })).toThrow();
  });
  it("ignores the runner's reload counter, ui and bar", () => {
    expect(() => parseParams(new URLSearchParams("n=3&bar=1&ui=x"))).not.toThrow();
  });
});
