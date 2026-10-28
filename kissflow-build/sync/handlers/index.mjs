// The handler catalogue (plan v5 §8.2): where each of H-00…H-21 lives and what carries it out. Every handler applies
// the prototype's own action (vendor/domain.mjs) and lets reconcile.mjs turn the result into Kissflow writes.

export { processRequest, pendingRequests, HANDLERS, REQUEST_ROLES } from "./requests.mjs";
export { pollCase } from "./portal.mjs";
export { processNotes } from "./notes.mjs";
export { runRemindersFor } from "./reminders.mjs";

export const HANDLER_CATALOG = [
  { id: "H-00", trigger: "every Service Request", impl: "requests.mjs processRequest", prototype: "permissions.ts check + each action's guards" },
  { id: "H-01", trigger: "case.created", impl: "requests.mjs caseCreated", prototype: "createCase" },
  { id: "H-02", trigger: "CIQP Request Answers_Rev changed", impl: "portal.mjs supplierSave", prototype: "saveConfig, setAnswer, setComponents, setJustification, uploadDocument" },
  { id: "H-03", trigger: "CIQP Request at 'keep the CIQ up to date'", impl: "portal.mjs completeness", prototype: "confirmCompleteness" },
  { id: "H-04", trigger: "op.raise (and system points)", impl: "requests.mjs opRaise", prototype: "raiseOpenPoint, findingToQuery" },
  { id: "H-05", trigger: "CIQP Query completed", impl: "portal.mjs queryAnswers", prototype: "supplierRespond" },
  { id: "H-06", trigger: "op.accepted / returned / notaccepted / edited / closed", impl: "requests.mjs opDecide", prototype: "reviewResponse, editOpenPoint, closeOpenPoint" },
  { id: "H-07", trigger: "scope grew in Part 2 (from H-02)", impl: "by construction in saveConfig + reconcile.mjs", prototype: "growScope, activateTracks, raiseOpenPoint(system)" },
  { id: "H-08", trigger: "CIQ Review completed (item or review.completed)", impl: "requests.mjs reviewCompleted; portal.mjs reviewCompletions", prototype: "rmesDecision, completeReview" },
  { id: "H-09", trigger: "review.reopen or late activation", impl: "requests.mjs + reconcile.mjs (new review item per activation)", prototype: "reopenReview, activateTracks" },
  { id: "H-10", trigger: "release request withdrawn", impl: "reconcile.mjs step 6", prototype: "phase final-release → review" },
  { id: "H-11", trigger: "CIQP Final Release completed", impl: "portal.mjs finalRelease + reconcile.mjs step 7 + attach.mjs + pdf.mjs", prototype: "finalRelease, buildFinalDocument" },
  { id: "H-12", trigger: "case.cancel", impl: "requests.mjs", prototype: "cancelCase" },
  { id: "H-13", trigger: "case.reactivate", impl: "requests.mjs", prototype: "reactivateCase" },
  { id: "H-14", trigger: "review.reassign", impl: "requests.mjs", prototype: "reassignReview" },
  { id: "H-15", trigger: "section.add", impl: "requests.mjs", prototype: "extendScope" },
  { id: "H-16", trigger: "CIQP Request Change_Report_Rev changed", impl: "portal.mjs changeReport", prototype: "reportChange" },
  { id: "H-17", trigger: "new CIQ Internal Note", impl: "notes.mjs processNotes", prototype: "addInternalNote, noteMentionMails" },
  { id: "H-18", trigger: "supplier.changed", impl: "requests.mjs supplierChanged", prototype: "updateContact, setContactActive" },
  { id: "H-19", trigger: "every hour", impl: "reminders.mjs runRemindersFor", prototype: "runReminders" },
  { id: "H-20", trigger: "reminders.run", impl: "requests.mjs remindersRun", prototype: "check(reminders.run) + runReminders" },
  { id: "H-21", trigger: "Part 2 change affecting RMES", impl: "by construction (refreshRmes inside the actions) + reconcile.mjs step 4", prototype: "refreshRmes" },
];
