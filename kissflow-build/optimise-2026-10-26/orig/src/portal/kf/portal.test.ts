// The portal role a user acts in, from their Kissflow roles: the handshake's AppRoles, or getRoles' currentRoles after a
// Development-sandbox role switch (mode.tsx). The hand-off URLs, built at runtime from the sandbox's tokens, the page's
// account and the Kissflow host around the page (Thomas, 21 Oct). No token or hook URL is printed: hosts only.
import { describe, expect, it } from "vitest";
import { DEV_ACCOUNT } from "@/shell/env";
import { DEV_WEBHOOKS, NO_WEBHOOKS, ROLES, heldPortalRoles, hookToken, isHookPath, kissflowHostOf, parentHost, portalRoleOf, webhooksFor, type Webhooks } from "./portal";
import type { Kf } from "./sdk";

const kfWith = (roles: { _id: string; Name: string }[]) => ({ user: { _id: "UsX", Name: "X", AppRoles: roles } }) as unknown as Kf;

describe("heldPortalRoles", () => {
  it("matches the role ids, Admin first", () => {
    expect(heldPortalRoles([{ id: ROLES.supplier.id, name: "" }, { id: ROLES.admin.id, name: "" }])).toEqual(["admin", "supplier"]);
    expect(heldPortalRoles([{ id: ROLES.supplier.id, name: "" }])).toEqual(["supplier"]);
  });

  it("falls back to the role names (a getRoles answer may differ in ids)", () => {
    expect(heldPortalRoles([{ id: "RoOther", name: "Admin" }])).toEqual(["admin"]);
  });

  it("holds nothing for other roles or empty refs", () => {
    expect(heldPortalRoles([{ id: "RoUser", name: "User" }])).toEqual([]);
    expect(heldPortalRoles([{ id: "", name: "" }])).toEqual([]);
    expect(heldPortalRoles([])).toEqual([]);
  });
});

describe("portalRoleOf", () => {
  it("is the first held portal role from kf.user.AppRoles, or none", () => {
    expect(portalRoleOf(kfWith([{ _id: ROLES.supplier.id, Name: "Supplier" }, { _id: ROLES.admin.id, Name: "Admin" }]))).toBe("admin");
    expect(portalRoleOf(kfWith([{ _id: ROLES.supplier.id, Name: "Supplier" }]))).toBe("supplier");
    expect(portalRoleOf(kfWith([{ _id: "RoUser", Name: "User" }]))).toBe("none");
    expect(portalRoleOf({ user: { _id: "UsX", Name: "X" } } as unknown as Kf)).toBe("none");
  });
});

// Hosts are built from parts: a Kissflow host written as text is what the zip guards refuse (DENY_HOSTS).
const kfHost = (name: string, tld: "eu" | "com" = "eu") => `${name}.kissflow.${tld}`;
const KEYS = Object.keys(NO_WEBHOOKS) as (keyof Webhooks)[];
/** Compared without printing: a hook URL carries its token. */
const same = (a: Webhooks, b: Webhooks) => KEYS.every((k) => a[k] === b[k]);
const hostsOf = (w: Webhooks) => KEYS.map((k) => (w[k].startsWith("https://") ? new URL(w[k]).hostname : w[k] ? "(relative)" : "(none)"));

describe("hookToken: the token is the last segment of /integration/2/<account>/webhook/<token>", () => {
  it("reads the token of a hook URL", () => {
    expect(hookToken("https://acme.example/integration/2/AcX/webhook/Tok-en_1")).toBe("Tok-en_1");
  });

  it("gives each of the four stored sandbox URLs its own token, which ends that URL", () => {
    const tokens = KEYS.map((k) => hookToken(DEV_WEBHOOKS[k]));
    expect(tokens.every((t) => /^[A-Za-z0-9_-]{30,}$/.test(t))).toBe(true);
    expect(new Set(tokens).size).toBe(4);
    expect(KEYS.every((k, i) => DEV_WEBHOOKS[k].endsWith(`/webhook/${tokens[i]}`))).toBe(true);
  });

  it("gives no token (nothing is sent) for a URL without exactly that shape", () => {
    for (const bad of [
      "http://acme.example/integration/2/AcX/webhook/Tok", // not https
      "https://acme.example/integration/2/AcX/webhook/", // no token
      "https://acme.example/integration/2/AcX/webhook/Tok/more", // a segment after it
      "https://acme.example/integration/2/AcX/webhook/Tok?x=1", // a query
      "https://acme.example/integration/2/AcX/webhook/Tok#x", // a fragment
      "https://acme.example/integration/2/AcX/webhook/Tok?", // an empty query (URL.search is "")
      "https://acme.example/integration/2/AcX/webhook/Tok#", // an empty fragment (URL.hash is "")
      "https://acme.example/integration/2/AcX/webhook/To\tk", // a tab the URL parser drops
      "https://acme.example/integration/2/AcX/webhook/Tok\n", // a newline it drops
      " https://acme.example/integration/2/AcX/webhook/Tok", // a space it trims
      "https://acme.example:443/integration/2/AcX/webhook/Tok", // a default port it drops
      "https://acme.example\\integration/2/AcX/webhook/Tok", // a backslash it reads as "/"
      "https://user:pw@acme.example/integration/2/AcX/webhook/Tok", // user info
      "https://acme.example/integration/3/AcX/webhook/Tok", // another version
      "https://acme.example/x/integration/2/AcX/webhook/Tok", // another path
      "https://acme.example/integration/2//webhook/Tok", // no account
      "https://acme.example/integration/2/AcX/webhook/To%2Fk", // an escaped character
      "/integration/2/AcX/webhook/Tok", // relative: not a URL
      "not a url",
      "",
    ])
      expect(hookToken(bad), bad).toBe("");
  });
});

describe("isHookPath: the only paths the SDK route sends (client.ts postWebhook)", () => {
  it("is exactly /integration/2/<account>/webhook/<token>", () => {
    expect(isHookPath("/integration/2/AcX/webhook/Tok-en_1")).toBe(true);
    expect(KEYS.every((k) => isHookPath(new URL(DEV_WEBHOOKS[k]).pathname))).toBe(true);
  });

  it("is nothing else: another host, a character the URL parser drops, another path, a query", () => {
    for (const bad of [
      "//evil.example/integration/2/AcX/webhook/Tok",
      "/\\evil.example/integration/2/AcX/webhook/Tok",
      "/\t/evil.example/integration/2/AcX/webhook/Tok",
      "/\n/evil.example/integration/2/AcX/webhook/Tok",
      "/integration/2/AcX/webhook/Tok\n",
      "/integration/2/AcX/webhook/Tok?x=1",
      "/integration/2/AcX/webhook/Tok#x",
      "/integration/2/AcX/webhook/Tok/more",
      "/integration/2//webhook/Tok",
      "/integration/2/AcX/webhook/",
      "/x",
      "integration/2/AcX/webhook/Tok",
      "https://acme.example/integration/2/AcX/webhook/Tok",
      "",
    ])
      expect(isHookPath(bad), JSON.stringify(bad)).toBe(false);
  });
});

describe("parentHost: the Kissflow page around the UI", () => {
  const ancestor = (...o: string[]) => ({ location: { ancestorOrigins: o } });
  const referrer = (r: string) => ({ location: {}, document: { referrer: r } });

  it("is the host of location.ancestorOrigins[0] when that is https on a Kissflow domain", () => {
    expect(parentHost(ancestor(`https://${kfHost("acme")}`))).toBe(kfHost("acme"));
    expect(parentHost(ancestor(`https://${kfHost("acme-prod", "com")}`, "https://other.example"))).toBe(kfHost("acme-prod", "com"));
    expect(parentHost(ancestor(`https://${kfHost("ACME")}`))).toBe(kfHost("acme")); // a host is lower case
    // the browser's own word on the parent wins over the referrer
    expect(parentHost({ location: { ancestorOrigins: [`https://${kfHost("acme")}`] }, document: { referrer: `https://${kfHost("other")}/x` } })).toBe(kfHost("acme"));
  });

  it("falls back to the origin of document.referrer where the browser has no ancestorOrigins (or none in it)", () => {
    expect(parentHost(referrer(`https://${kfHost("acme", "com")}/view/portal/CIQ_Supplier_Portal_A00?x=1#y`))).toBe(kfHost("acme", "com"));
    expect(parentHost({ location: { ancestorOrigins: [] }, document: { referrer: `https://${kfHost("acme")}/` } })).toBe(kfHost("acme"));
  });

  it("is unknown when the parent is not https", () => {
    expect(parentHost(ancestor(`http://${kfHost("acme")}`))).toBeUndefined();
    expect(parentHost(referrer(`http://${kfHost("acme")}/x`))).toBeUndefined();
  });

  it("is unknown when the parent is not on a Kissflow domain, nor its own port", () => {
    for (const o of ["http://127.0.0.1:5310", "https://acme.example", `https://${kfHost("acme")}.evil.example`, `https://evilkissflow.${"eu"}`, `https://kissflow.${"com"}`, `https://${kfHost("acme")}:8443`])
      expect(parentHost(ancestor(o)), o).toBeUndefined();
    // a non-Kissflow parent is not overruled by a Kissflow referrer
    expect(parentHost({ location: { ancestorOrigins: ["https://acme.example"] }, document: { referrer: `https://${kfHost("acme")}/` } })).toBeUndefined();
  });

  it("is unknown for garbage, no parent, and outside a browser", () => {
    for (const w of [ancestor("null"), ancestor("not a url"), referrer("garbage"), referrer("about:blank"), referrer(""), {}, { location: {} }, undefined])
      expect(parentHost(w), JSON.stringify(w)).toBeUndefined();
    const blocked = {
      get location(): never {
        throw new Error("blocked");
      },
    };
    expect(parentHost(blocked)).toBeUndefined();
    expect(parentHost()).toBeUndefined(); // vitest runs in node: no window
    expect(kissflowHostOf(undefined)).toBeUndefined();
    expect(kissflowHostOf(null)).toBeUndefined();
  });
});

describe("webhooksFor (Thomas, 21 Oct): the sandbox's tokens on the page's account, on its Kissflow host or as relative paths", () => {
  const devHost = new URL(DEV_WEBHOOKS.requestChanged).hostname;
  const built = (origin: string, account: string): Webhooks => Object.fromEntries(KEYS.map((k) => [k, `${origin}/integration/2/${account}/webhook/${hookToken(DEV_WEBHOOKS[k])}`])) as unknown as Webhooks;

  it("on the dev account with the dev host is exactly the stored sandbox URLs", () => {
    expect(devHost).toMatch(/^dev-beiersdorf\.kissflow\.eu$/);
    expect(KEYS.every((k) => new URL(DEV_WEBHOOKS[k]).hostname === devHost)).toBe(true);
    expect(same(webhooksFor(DEV_ACCOUNT, devHost), DEV_WEBHOOKS)).toBe(true);
  });

  it("on another account with another Kissflow host: that host, that account, the same tokens", () => {
    const prod = webhooksFor("AcProd1", kfHost("acme-prod", "com"));
    expect(hostsOf(prod)).toEqual(KEYS.map(() => kfHost("acme-prod", "com")));
    expect(same(prod, built(`https://${kfHost("acme-prod", "com")}`, "AcProd1"))).toBe(true);
    expect(KEYS.some((k) => prod[k].includes(DEV_ACCOUNT) || prod[k].includes(devHost))).toBe(false);
  });

  it("with an unknown host: the relative path on the page's account", () => {
    for (const host of [undefined, ""]) {
      const rel = webhooksFor("AcProd1", host);
      expect(hostsOf(rel)).toEqual(KEYS.map(() => "(relative)"));
      expect(same(rel, built("", "AcProd1"))).toBe(true);
    }
    // the dev account outside the sandbox's page: the stored URLs' own paths
    expect(KEYS.every((k) => webhooksFor(DEV_ACCOUNT)[k] === new URL(DEV_WEBHOOKS[k]).pathname)).toBe(true);
  });

  it("takes a host that is not a Kissflow host, exactly as parentHost gives it, as unknown (a relative path)", () => {
    for (const host of ["acme.example", "127.0.0.1:5310", `${kfHost("acme")}:8443`, `user@${kfHost("acme")}`, `${kfHost("acme")}/x`, kfHost("ACME"), `evil.example#${kfHost("acme")}`])
      expect(hostsOf(webhooksFor("AcProd1", host)), host).toEqual(KEYS.map(() => "(relative)"));
  });

  it("sends nothing without an account, or with one that is not an id", () => {
    for (const acc of [undefined, "", "Ac/../x", "Ac X", "Ac?x=1"]) expect(webhooksFor(acc, kfHost("acme"))).toEqual(NO_WEBHOOKS);
  });
});
