// The live extras the shell and Diagnostics read beside the StoreApi (DESIGN §3.3). Owner D; LiveAppStore provides
// them. Load state (when, loading / saving, the last refresh error, warnings and notes, the parts kept from an earlier
// load, the cases left out, every read rung tried), who is signed in
// and the persona they act in, the per-case "could not read the questionnaire" reason (the shell writes the sentence
// around it) and configuration pin problem, the unsent drafts with Send / Discard, this session's writes with their hand-offs, the webhook slots, whether the
// page runs in CIQ_Digital_A00, the build stamp, and (27 Oct) the colleague directory of the @mentions.
import { createContext, useContext } from "react";
import type { InternalPersonaId } from "@/domain/types";
import type { ColleagueDirectory } from "./colleagues";
import type { HandoffCode } from "./shared/handoff";
import type { Acting, HandoffStatus, Identity, ProcessKey, ReadReport } from "./types";

export interface LiveAppExtras {
  loadedAt: string;
  /** A read or a write is in flight. */
  busy: boolean;
  /** A read is in flight (the header's "Loading…"). */
  loading?: boolean;
  /** A write is in flight (the header's "Saving…"). */
  saving?: boolean;
  loadError: string | null;
  /** What could not be read on the last load (data is missing). */
  warnings: string[];
  /** How odd rows were mapped (dev only: the dev shell and Diagnostics list them). */
  notes?: string[];
  /** The oldest load whose data parts of the page still show (load.ts keptSince); absent when all is fresh. */
  keptAt?: string;
  /** Codes of cases left out because they could not be mapped. */
  dropped?: string[];
  reads: ReadReport[];
  reload(): Promise<boolean>;
  identity: Identity;
  acting: Acting;
  setPersona(id: InternalPersonaId): void;
  /** Only the reason ("no read route for this role", Kissflow's refusal); undefined when the case was read in full. */
  caseBanner(caseId: string): string | undefined;
  /** The case's configuration pin problem (a warning banner on its pages), undefined when its pin is fine. */
  casePin?(caseId: string): string | undefined;
  drafts: { flow: ProcessKey; itemId: string; act: string; label: string }[];
  /** Rejects with the reason when the draft could not be sent (Diagnostics shows it under the draft). */
  sendDraft(itemId: string): Promise<void>;
  discardDraft(itemId: string): Promise<void>;
  /** `note`: a load-time effect that wrote nothing and left only this line (e.g. the reads it needs failed). */
  /** `detail`: the raw causes production's message put in plain words. */
  writeLog: { at: string; method: string; ok: boolean; message?: string; detail?: string; handoffs: HandoffStatus[]; note?: boolean }[];
  webhooks: Partial<Record<HandoffCode, string>>;
  containerOk: boolean;
  build: string;
  /** 27 Oct: the colleague directory for @mentions (app-live/colleagues.ts): its reads and why nobody is listed. */
  colleagues?: ColleagueDirectory;
}

export const AppExtrasContext = createContext<LiveAppExtras | null>(null);

/** The live extras, or null outside LiveAppStore. */
export function useAppExtras(): LiveAppExtras | null {
  return useContext(AppExtrasContext);
}
