// Entry for the vendored prototype domain (plan v5 §11.4: one engine). build-vendor.mjs bundles this file with the
// prototype's own esbuild into vendor/domain.mjs. Nothing here adds logic: it only re-exports the prototype's pure
// domain functions, read-only, so the service's results match the prototype by construction.

export * as A from "../../prototype/src/domain/actions";
export { wasRefused, audit as auditCase, setPhase, getCase, mapCase, logEvent } from "../../prototype/src/domain/core";
export {
  BUILTIN_SECTIONS,
  BUILTIN_FIELDS,
  CONFIG_QUESTIONS,
  DEPT_LABEL,
  DEPT_SHORT,
  HEAVY_METAL_LIMITS,
  LIMIT_SET_VERSION,
  REVIEW_DEPTS,
  REVIEW_TRACK_DEPTS,
  builtinTemplateData,
  fieldOf,
  sectionOf,
  templateSections,
} from "../../prototype/src/domain/catalog";
export { deriveScope, diffScope, growScope, syncRegistry, ruleSet, undefinedOrigins, hasUndefinedOrigin, UNDEFINED_ORIGINS, EVIDENCE_FIELDS } from "../../prototype/src/domain/rules";
export { RS1, RS2, BASE_RULE_DATA, TURKEY_RULE_DATA } from "../../prototype/src/domain/builtinRules";
export { FIRST_PAIR, currentPair, pairLabel, preparedDraft, publishDraft } from "../../prototype/src/domain/configActions";
export { requestedDocuments, requestedDocStatus, isSlotKey, slotKey, storableSlots } from "../../prototype/src/domain/requestedDocs";
export {
  BDF_SET_FIELDS,
  MESSAGE_ACTION_LABEL,
  NOW_ISO,
  PHASE_LABEL,
  SUPPLIER_MESSAGE_TEXT,
  canReactivate,
  closedByCancellation,
  completenessBlockers,
  fmtDate,
  hasValue,
  isClosed,
  releaseBlockers,
  reviewBlockers,
  unresolved,
} from "../../prototype/src/domain/selectors";
export { buildFinalDocument, verifyFinalDocument, pointResult, threadRounds } from "../../prototype/src/domain/finalDocument";
export { runReminders } from "../../prototype/src/domain/reminders";
export { sendMail, supplierMail, internalMail, noteMentionMails, caseContactIds, reviewLink, caseLink, supplierLink } from "../../prototype/src/domain/mail";
export { parseMentions, mentionRecipients } from "../../prototype/src/domain/mentions";
export { check, raiserOf, userOf, isActiveUser } from "../../prototype/src/domain/permissions";
export { checkInvariants, internalStrings } from "../../prototype/src/domain/invariants";
export { buildSeed, baseState, makeUser, ROLE_HOLDERS, SUPPLIER_DEFS, contactsOfDef, supplierOf } from "../../prototype/src/domain/seed";
export { updateContact, setContactActive, validateCaseContacts } from "../../prototype/src/domain/suppliers";
export { REFERENCE_MATERIALS } from "../../prototype/src/domain/referenceMaterials";
export { buildRichFixture } from "../../prototype/src/domain/richFixture";
