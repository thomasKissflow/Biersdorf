// Opening a document's stored file from the internal screens (27 Oct, Thomas's prod test: the app showed the
// supplier's files by name only). The clickable prototype provides nothing, so DocName keeps its behaviour there (a link
// for a file dropped in this browser session, else the name). The live app (app-live LiveAppStore, from
// app-live/docOpener.ts) provides an opener: the name becomes a link-styled button that opens Kissflow's own file
// preview, or, when this page can't open the file, the name with a quiet note that the supplier portal can.
import { createContext, useContext } from "react";

/** "ready": opens on a click. "checking": what it needs is being looked up (a click waits for it). "portal": it can't
 *  be opened here; the supplier portal can. */
export type DocOpenStatus = "ready" | "checking" | "portal";

export interface DocOpener {
  /** How the document opens here; undefined when the opener does not know it (DocName's own behaviour). */
  status(docId: string): DocOpenStatus | undefined;
  /** Starts the lookup a "checking" document waits for (idempotent: once per case). */
  prepare(docId: string): void;
  /** Opens the preview on the document (with the case's other files to page through); a failure is told by the app. */
  open(docId: string): Promise<void>;
}

export const DocOpenerContext = createContext<DocOpener | null>(null);

/** The live opener, or null in the prototype and the supplier portal. */
export const useDocOpener = () => useContext(DocOpenerContext);

/** The quiet note next to a file this page can't open. */
export const PORTAL_ONLY_NOTE = "This file can be opened in the supplier portal.";
