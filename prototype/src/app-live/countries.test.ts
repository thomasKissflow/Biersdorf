// The supplier's country (26 Oct, Thomas): Kissflow's list CIQ_Country_Code_A00 (exactly the 32 codes read live on
// 26 Oct), one canonical English name per code that the mapper reads back and the writer maps to the code again, older
// spellings, a country the list does not hold (the form marks it and asks for a listed one), and the list's items read
// once a session at run time (a code Thomas adds appears without a rebuild; a failure keeps the built-in 32).
// Fictional suppliers only.
import { afterEach, describe, expect, it } from "vitest";
import { countryProblem, notListedLabel, type CountryList } from "@/components/countryList";
import type { Kf } from "@/portal/kf/sdk";
import type { RawItem } from "@/portal/data/raw";
import { COUNTRY_NAMES, LIVE_COUNTRY_CODES, countryCode, countryOptions, countrySource, listedCountry, loadCountryList, parseCountryCodes, resetCountryList } from "./countries";
import { APP_ID, LIST, LISTS, TABLES } from "./ids";
import { createAppClient } from "./kf/client";
import { Directory } from "./map/people";
import { suppliersFromRows } from "./map/suppliersMap";
import { GUARD_TEXT } from "./write/guards";
import { supplierFields } from "./write/encode";

afterEach(() => resetCountryList());

/** The live form's list as LiveAppStore provides it. */
const live = (): CountryList => ({ options: countryOptions(), listed: listedCountry, source: countrySource(), load: () => {} });

const row = (code: string): RawItem =>
  ({ _id: `PkSup${code}`, Supplier_Code: `SUP-ZZT-${code}`, Supplier_Legal_Name: `ZZT Fictional ${code}`, DUNS_Number: "900000017", Supplier_Kind: LIST.supplierKind.manufacturer, Supplier_Country_Code: code, Supplier_Active: LIST.yes, [`Table::${TABLES.contacts}`]: [] }) as RawItem;
const mapped = (code: string) => suppliersFromRows([row(code)], new Directory({ id: "UsMe", name: "Me", email: "me@zzt.example", side: "internal", title: "", initials: "M" }, "UsMe"), []).suppliers[0]!;

describe("the built-in list (CIQ_Country_Code_A00, read 26 Oct)", () => {
  it("is exactly the 32 live codes, each with one canonical English name", () => {
    expect(LIVE_COUNTRY_CODES.join(" ")).toBe("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE GB TR CN US CA");
    expect(Object.keys(COUNTRY_NAMES).sort()).toEqual([...LIVE_COUNTRY_CODES].sort());
    const names = Object.values(COUNTRY_NAMES);
    expect(new Set(names).size).toBe(32);
    expect([COUNTRY_NAMES.GB, COUNTRY_NAMES.US, COUNTRY_NAMES.CZ, COUNTRY_NAMES.TR]).toEqual(["United Kingdom", "United States", "Czechia", "Turkey"]);
  });

  it("offers the 32 countries by name, in alphabetical order (the form's options; the value is the name)", () => {
    const o = countryOptions();
    expect(o).toHaveLength(32);
    expect(o.map((x) => x.name)).toEqual([...o.map((x) => x.name)].sort((a, b) => a.localeCompare(b, "en")));
    expect(o[0]).toEqual({ code: "AT", name: "Austria" });
    expect(countrySource()).toBe("built-in");
  });

  it("round trip: the stored code → the name the mapper gives → the code the writer sends", () => {
    for (const code of LIVE_COUNTRY_CODES) {
      const s = mapped(code);
      expect(s.country, code).toBe(COUNTRY_NAMES[code]);
      expect(countryCode(s.country), code).toBe(code);
      expect(listedCountry(code), code).toBe(COUNTRY_NAMES[code]);
      expect(supplierFields(s).Supplier_Country_Code, code).toBe(code);
    }
  });

  it("reads older spellings and bare codes as the same country", () => {
    for (const [typed, code] of [["Czech Republic", "CZ"], ["czechia", "CZ"], ["USA", "US"], ["united states of america", "US"], ["UK", "GB"], ["Great Britain", "GB"], ["Türkiye", "TR"], ["The Netherlands", "NL"], [" spain ", "ES"], ["es", "ES"], ["gb", "GB"]] as const) {
      expect(countryCode(typed), typed).toBe(code);
      expect(listedCountry(typed), typed).toBe(COUNTRY_NAMES[code]);
    }
  });

  it("a country outside the list has no code: the form marks it and asks for a listed one; the guard is the backstop", () => {
    for (const x of ["Brazil", "BR", "Switzerland", "Malaysia", "Norway", ""]) expect(countryCode(x), x).toBe("");
    // a code Kissflow no longer lists still reads as its name (Intl), and is not in the list
    expect(mapped("BR").country).toBe("Brazil");
    expect(listedCountry("Brazil")).toBe("");
    expect(countryProblem(live(), "Brazil")).toBe("Brazil is not in the country list. Choose a country from the list.");
    expect(notListedLabel(" Brazil ")).toBe("Brazil (not in the country list)");
    expect(countryProblem(live(), "Spain")).toBeUndefined();
    expect(countryProblem(live(), "")).toBeUndefined(); // empty: the domain's "Choose the country."
    // the prototype has no list: no such check
    expect(countryProblem(null, "Brazil")).toBeUndefined();
    expect(GUARD_TEXT.country("Brazil")).toBe("“Brazil” is not in the country list. Choose a country from the list.");
    expect(supplierFields({ ...mapped("ES"), country: "Brazil" })).not.toHaveProperty("Supplier_Country_Code");
  });
});

describe("Kissflow's list, read at run time (once a session; never blocks the form)", () => {
  it("parses a JSON array of codes (an envelope or rows with a Name too); nothing usable → null", () => {
    expect(parseCountryCodes(["AT", " be ", "AT", "x", 3, "NO"])).toEqual(["AT", "BE", "NO"]);
    expect(parseCountryCodes({ Data: [{ Name: "DE" }, { name: "FR" }] })).toEqual(["DE", "FR"]);
    for (const bad of [null, {}, [], ["Austria"], "AT", { error_code: "KISSFLOW_ERROR_050302" }]) expect(parseCountryCodes(bad), JSON.stringify(bad)).toBeNull();
  });

  it("a code Thomas added to the Kissflow list appears without a rebuild (named by Intl) and is written as its code", async () => {
    let reads = 0;
    const read = async () => (reads++, [...LIVE_COUNTRY_CODES, "NO"]);
    expect(await loadCountryList(read)).toBe(true);
    expect(await loadCountryList(read)).toBe(true); // once a session: the same answer, no second read
    expect(reads).toBe(1);
    expect(countrySource()).toBe("kissflow");
    expect(countryOptions()).toHaveLength(33);
    expect(countryOptions().find((o) => o.code === "NO")).toEqual({ code: "NO", name: "Norway" });
    expect(countryCode("Norway")).toBe("NO");
    expect(mapped("NO").country).toBe("Norway");
    expect(supplierFields(mapped("NO")).Supplier_Country_Code).toBe("NO");
  });

  it("a code the Kissflow list no longer holds is not offered and not written", async () => {
    await loadCountryList(async () => LIVE_COUNTRY_CODES.filter((c) => c !== "TR"));
    expect(countryOptions().some((o) => o.code === "TR")).toBe(false);
    expect(countryCode("Turkey")).toBe("");
    expect(mapped("TR").country).toBe("Turkey"); // still named on screen
    expect(countryProblem(live(), "Turkey")).toBe("Turkey is not in the country list. Choose a country from the list.");
  });

  it("a refused read or an answer without codes keeps the built-in 32 and says why (the Writes log)", async () => {
    const why: string[] = [];
    expect(await loadCountryList(async () => Promise.reject(new Error("KISSFLOW_ERROR_050302 You don't have permission")), (w) => why.push(w))).toBe(false);
    expect(countrySource()).toBe("built-in");
    expect(countryOptions()).toHaveLength(32);
    expect(why).toEqual(["KISSFLOW_ERROR_050302 You don't have permission"]);
    resetCountryList();
    expect(await loadCountryList(async () => ({ items: [] }), (w) => why.push(w))).toBe(false);
    expect(why[1]).toMatch(/no country code/);
    resetCountryList();
    expect(await loadCountryList(undefined)).toBe(false); // a client without the route: nothing is read
  });

  it("the client reads the list's items by kf.api GET on the account's list route of the app", async () => {
    const calls: { url: string; method?: string }[] = [];
    const kf = { user: { _id: "UsZzt", Name: "ZZT" }, account: { _id: "AcTEST" }, app: { _id: APP_ID }, api: async (url: string, o?: { method?: string }) => (calls.push({ url, method: o?.method }), [...LIVE_COUNTRY_CODES]) } as unknown as Kf;
    const c = createAppClient(kf, { sleep: async () => {} });
    expect(await c.listItems!(LISTS.country)).toEqual([...LIVE_COUNTRY_CODES]);
    expect(calls).toEqual([{ url: `/flow/2/AcTEST/list/CIQ_Country_Code_A00/items?_application_id=${APP_ID}`, method: "GET" }]);
    const refused = createAppClient({ ...kf, api: async () => ({ error_code: "KISSFLOW_ERROR_050302", en_message: "You don't have permission" }) } as unknown as Kf, { sleep: async () => {} });
    await expect(refused.listItems!(LISTS.country)).rejects.toThrow(/permission/);
  });
});
