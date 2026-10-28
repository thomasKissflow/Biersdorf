// The supplier's country (26 Oct, Thomas): live, CIQ Supplier's Supplier_Country_Code is a Kissflow Select on the list
// CIQ_Country_Code_A00, and Kissflow stores a value outside that list as EMPTY with a 200 answer (live fact). So the
// supplier form offers exactly the list's countries (a Select, components/countryList.tsx), never free text.
// - The list as read on 26 Oct (dev): exactly the 32 codes of LIVE_COUNTRY_CODES. It is built in; LiveAppStore also
//   reads the list's items once a session (kf.api GET /flow/2/{acc}/list/CIQ_Country_Code_A00/items, a JSON array of
//   codes; live with an API key, [unverified] as the user) and, when that answers, the countries Kissflow lists are the
//   ones in force (a code added there appears without a rebuild, named by Intl.DisplayNames). The form never waits for
//   it: until it answers, or when it fails, the built-in 32 stand.
// - The domain keeps a supplier's country as its English name, ONE canonical name per code (COUNTRY_NAMES):
//   map/suppliersMap.ts turns the stored code into it (countryName), the form's options are those names, and
//   write/encode.ts countryCode turns it back into the code. Older spellings ("Czech Republic", "USA", "UK") and a bare
//   code are read as the same country (countryCode, listedCountry).
// Pure apart from the list in force this session (setCountryCodes; tests reset it with resetCountryList).

/** The codes of CIQ_Country_Code_A00 as read on 26 Oct (dev), in the list's order. */
export const LIVE_COUNTRY_CODES: readonly string[] = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "GB", "TR", "CN", "US", "CA"];

/** The one English name the app gives each built-in code (the domain value, the form's option). */
export const COUNTRY_NAMES: Readonly<Record<string, string>> = {
  AT: "Austria", BE: "Belgium", BG: "Bulgaria", HR: "Croatia", CY: "Cyprus", CZ: "Czechia", DK: "Denmark", EE: "Estonia", FI: "Finland", FR: "France",
  DE: "Germany", GR: "Greece", HU: "Hungary", IE: "Ireland", IT: "Italy", LV: "Latvia", LT: "Lithuania", LU: "Luxembourg", MT: "Malta", NL: "Netherlands",
  PL: "Poland", PT: "Portugal", RO: "Romania", SK: "Slovakia", SI: "Slovenia", ES: "Spain", SE: "Sweden", GB: "United Kingdom", TR: "Turkey", CN: "China",
  US: "United States", CA: "Canada",
};

/** Other spellings of the same country (lower case): older data and the names the free-text form used to suggest. */
const ALIASES: Readonly<Record<string, string>> = {
  "czech republic": "CZ", uk: "GB", "great britain": "GB", britain: "GB", "united kingdom of great britain and northern ireland": "GB", "türkiye": "TR", turkiye: "TR",
  usa: "US", "u.s.a.": "US", "united states of america": "US", "the netherlands": "NL", holland: "NL", "people's republic of china": "CN",
};

const CODE = /^[A-Z]{2}$/;
const fold = (s: string) => s.trim().toLowerCase();

let intl: Intl.DisplayNames | null | undefined;
/** The English name Intl gives a region code ("" when it has none). */
function intlName(code: string): string {
  if (intl === undefined) {
    try {
      intl = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      intl = null;
    }
  }
  try {
    const n = intl?.of(code);
    return n && n !== code ? n : "";
  } catch {
    return "";
  }
}

/** Where the countries in force come from: the built-in copy, or Kissflow's list as read this session. */
export type CountrySource = "built-in" | "kissflow";
let inForce: { codes: readonly string[]; source: CountrySource } = { codes: LIVE_COUNTRY_CODES, source: "built-in" };

/** The English name of a code: the app's own for the built-in codes, else Intl's ("" when unknown). */
export function countryName(code: string): string {
  const c = code.trim().toUpperCase();
  if (!CODE.test(c)) return "";
  return COUNTRY_NAMES[c] ?? intlName(c);
}

/** The code a country stands for (its canonical name, an older spelling or the code itself), "" when none. Whether
 *  the list in force holds it is not checked here. */
function codeOf(country: string): string {
  const v = country.trim();
  if (!v) return "";
  if (CODE.test(v.toUpperCase()) && v.length === 2 && (inForce.codes.includes(v.toUpperCase()) || COUNTRY_NAMES[v.toUpperCase()])) return v.toUpperCase();
  const k = fold(v);
  const alias = ALIASES[k];
  if (alias) return alias;
  for (const c of [...inForce.codes, ...Object.keys(COUNTRY_NAMES)]) if (fold(countryName(c)) === k) return c;
  return "";
}

/** The live code of a country for Supplier_Country_Code: "" when the list in force does not hold it (Kissflow would
 *  store it EMPTY). */
export function countryCode(country: string): string {
  const c = codeOf(country);
  return c && inForce.codes.includes(c) ? c : "";
}

/** The canonical name of a country the list in force holds ("" when it holds none): what the form's Select shows. */
export function listedCountry(country: string): string {
  const c = countryCode(country);
  return c ? countryName(c) || c : "";
}

/** The countries in force, by name (the form's options; the value is the name). */
export function countryOptions(): { code: string; name: string }[] {
  return inForce.codes.map((code) => ({ code, name: countryName(code) || code })).sort((a, b) => a.name.localeCompare(b.name, "en"));
}

export const countrySource = (): CountrySource => inForce.source;

/** The codes of a list-items answer (a JSON array of codes; an envelope {Data|items|data: [...]} or rows with a Name
 *  are read too), upper case, each once; null when it names no code (then the built-in list stays). */
export function parseCountryCodes(body: unknown): string[] | null {
  const o = body as Record<string, unknown> | null;
  const rows = Array.isArray(body) ? body : o && typeof o === "object" ? ([o.Data, o.items, o.data].find(Array.isArray) as unknown[] | undefined) : undefined;
  if (!rows) return null;
  const codes: string[] = [];
  for (const r of rows) {
    const v = typeof r === "string" ? r : r && typeof r === "object" ? [(r as Record<string, unknown>).Name, (r as Record<string, unknown>).name, (r as Record<string, unknown>).value].find((x) => typeof x === "string") : undefined;
    const c = typeof v === "string" ? v.trim().toUpperCase() : "";
    if (CODE.test(c) && !codes.includes(c)) codes.push(c);
  }
  return codes.length ? codes : null;
}

/** Puts Kissflow's list (as read this session) in force. */
export function setCountryCodes(codes: readonly string[]): void {
  inForce = { codes: [...codes], source: "kissflow" };
}

/** Tests: the built-in list again, and no read this session. */
export function resetCountryList(): void {
  inForce = { codes: LIVE_COUNTRY_CODES, source: "built-in" };
  loading = undefined;
}

let loading: Promise<boolean> | undefined;
/**
 * Reads Kissflow's list once a session (`read` = the client's list read; absent: nothing is read) and puts it in force
 * when it names codes. Resolves whether Kissflow's list is in force now (the screens then show it, and say so even when
 * it equals the built-in one); never rejects (a failure keeps the built-in list, `onProblem` gets the cause for the
 * Writes log).
 */
export function loadCountryList(read: (() => Promise<unknown>) | undefined, onProblem?: (why: string) => void): Promise<boolean> {
  if (!read) return Promise.resolve(false);
  loading ??= (async () => {
    try {
      const codes = parseCountryCodes(await read());
      if (!codes) {
        onProblem?.("the country list answered no country code; the built-in list stays");
        return false;
      }
      setCountryCodes(codes);
      return true;
    } catch (e) {
      onProblem?.(e instanceof Error ? e.message : String(e));
      return false;
    }
  })();
  return loading;
}
