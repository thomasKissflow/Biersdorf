// What the supplier screens may offer the signed-in contact. The clickable prototype provides nothing, so the
// defaults keep its behaviour (everyone may act). The live supplier portal answers from real Kissflow tasks: a contact
// may confirm or release only when that item is their own open task, and upload only into a section that is.
import { createContext, useContext } from "react";

export type CaseTask = "completeness" | "final-release";

export interface PortalCaps {
  /** The case's confirmation or release is this contact's open task. */
  canAct(caseId: string, task: CaseTask): boolean;
  /** Who can do it instead (names), for the explanation shown when this contact can't. */
  whoCanAct(caseId: string, task: CaseTask): string[];
  /** A document for this catalog section can be stored now: its portal section is this contact's open task. */
  canUpload(caseId: string, sectionId: string): boolean;
  /** The live portal: a "Report a change" is still on its way to Beiersdorf (no receipt yet), so a second one waits. */
  changeReportPending(caseId: string): boolean;
  /** Files of this section still uploading (the live portal shows "Uploading…" on the section). */
  uploadsIn(caseId: string, sectionId: string): number;
  /** The document is stored in Kissflow and can be opened in Kissflow's own preview. */
  canPreview(docId: string): boolean;
  /** Opens Kissflow's preview of the document. */
  preview(docId: string): void;
  /** The signed-in contact uploaded this document and the questionnaire is editable: it can be removed (soft delete). */
  canRemove(docId: string): boolean;
  /** Removes the document from the questionnaire; resolves true once Kissflow kept it. */
  remove(docId: string): Promise<boolean>;
  /** The live portal (27 Oct): a file picked for an answer is stored in Kissflow at once, so it can be previewed before
   *  it is sent. False in the prototype (the file stays in the browser until Send). */
  stagesAnswerFiles: boolean;
  /** Stores a file picked for the answer to this question (nothing is written to the questionnaire yet); resolves true
   *  once Kissflow stored it, false when it could not (the store says why; the answer then uploads it on Send). */
  stageAnswerFile(caseId: string, opId: string, file: File): Promise<boolean>;
  /** Opens Kissflow's preview of a file stored by stageAnswerFile. */
  previewAnswerFile(file: File): void;
}

const PROTOTYPE: PortalCaps = {
  canAct: () => true,
  whoCanAct: () => [],
  canUpload: () => true,
  changeReportPending: () => false,
  uploadsIn: () => 0,
  canPreview: () => false,
  preview: () => undefined,
  canRemove: () => false,
  remove: async () => false,
  stagesAnswerFiles: false,
  stageAnswerFile: async () => false,
  previewAnswerFile: () => undefined,
};

export const PortalCapsContext = createContext<PortalCaps>(PROTOTYPE);
export const usePortalCaps = () => useContext(PortalCapsContext);
/** True inside the live supplier portal (real Kissflow tasks), false in the clickable prototype. */
export const useIsLivePortal = () => useContext(PortalCapsContext) !== PROTOTYPE;
