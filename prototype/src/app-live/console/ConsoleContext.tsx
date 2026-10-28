// What the data console's pages share: its own app client (26 Oct: the console's limiter of 2 calls in flight and its
// longer rate-limit backoff, kf/client.ts consoleClientOptions; the one-draft-per-form queue is the CIQ screens'), the
// session's reads (session.ts: every list read once, kept steps), who is signed in, and whether the console sits beside
// the CIQ screens (the user also acts in a CIQ persona) or is the user's whole app (Admin / Developer only). The console
// reads and writes on its own, not through the store: a user without a persona has no store. After a write the CIQ
// screens are stale, so the shell has them read again when the console is left (DataShell).
import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import type { AppClient, Identity } from "../types";
import { createRateSignal, type RateSignal } from "./rateSignal";
import { ConsoleSession } from "./session";

export interface DataConsole {
  client: AppClient;
  /** This session's reads (lists, kept steps). */
  session: ConsoleSession;
  /** The client's waits for rate-limited calls (DataShell says so while one lasts). */
  rate: RateSignal;
  identity: Identity;
  /** The CIQ screens are there too (a persona is held): the pane offers the way back. */
  besideCiq: boolean;
  /** Called after every write. */
  changed(): void;
  /** Whether anything was written since the last call; resets it. */
  takeChanged(): boolean;
}

const ConsoleContext = createContext<DataConsole | null>(null);

export function DataConsoleProvider({ client, rate, identity, besideCiq, children }: { client: AppClient; rate?: RateSignal; identity: Identity; besideCiq: boolean; children: ReactNode }) {
  const dirty = useRef(false);
  const changed = useCallback(() => {
    dirty.current = true;
  }, []);
  const takeChanged = useCallback(() => {
    const was = dirty.current;
    dirty.current = false;
    return was;
  }, []);
  // one session per client: a new client (a dev role switch) reads everything again
  const session = useMemo(() => new ConsoleSession(client), [client]);
  const ownRate = useMemo(() => createRateSignal(), []);
  const value = useMemo<DataConsole>(() => ({ client, session, rate: rate ?? ownRate, identity, besideCiq, changed, takeChanged }), [client, session, rate, ownRate, identity, besideCiq, changed, takeChanged]);
  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useDataConsole(): DataConsole {
  const v = useContext(ConsoleContext);
  if (!v) throw new Error("useDataConsole outside DataConsoleProvider");
  return v;
}
