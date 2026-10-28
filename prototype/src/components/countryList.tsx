// The countries the supplier form may offer (26 Oct, Thomas). Live, Supplier_Country_Code is a Kissflow Select on the
// list CIQ_Country_Code_A00 and a value outside it is stored EMPTY, so the live app (app-live LiveAppStore, from
// app-live/countries.ts) provides that list and the form shows a Select of exactly those countries. The prototype has
// no Kissflow list: it provides nothing, and the form keeps its free-text country with suggestions.
import { createContext, useContext } from "react";

export interface CountryList {
  /** The countries to offer, by name (the name is the domain's Supplier.country). */
  options: readonly { code: string; name: string }[];
  /** The listed name of a country as the domain holds it (its name, an older spelling or its code); "" when the list
   *  does not hold it. */
  listed(country: string): string;
  /** Where the options come from: Kissflow's list as read this session, or the copy built into this version. */
  source: "kissflow" | "built-in";
  /** Reads Kissflow's list once a session, in the background (the form never waits for it). */
  load(): void;
}

export const CountryListContext = createContext<CountryList | null>(null);

/** The live country list, or null in the prototype. */
export const useCountryList = () => useContext(CountryListContext);

// The texts say "the country list" (FE-CLEANUP C22: a user text names no Kissflow list); the list IS Kissflow's.

/** Why the chosen country can't be saved, else undefined (empty is the domain's "Choose the country."). */
export function countryProblem(list: CountryList | null, country: string): string | undefined {
  const v = country.trim();
  if (!list || !v || list.listed(v)) return undefined;
  return `${v} is not in the country list. Choose a country from the list.`;
}

/** The label of a current country the list does not hold (older data), shown as a selected extra option. */
export const notListedLabel = (country: string) => `${country.trim()} (not in the country list)`;
