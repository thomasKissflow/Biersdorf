// Plain labels of question types and requiredness, shared by the questionnaire editor and its read-only views.
import { uploadsMandatory } from "@/domain/requestedDocs";
import type { FieldType, Requiredness, SectionData } from "@/domain/types";

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "Short text",
  longtext: "Long text",
  number: "Number",
  decimal: "Decimal number",
  yesno: "Yes / No",
  single: "One choice from a list",
  multi: "Several choices from a list",
  file: "File upload",
  email: "E-mail address",
  range: "Range (min–max %)",
};

/** The order of the answer types in the question form. */
export const EDITOR_FIELD_TYPES: FieldType[] = ["text", "longtext", "yesno", "single", "multi", "number", "decimal", "file", "email", "range"];

/** One line under the type picker: what the supplier gets. */
export const FIELD_TYPE_HINT: Record<FieldType, string> = {
  text: "One line of text, such as a name or a registration number.",
  longtext: "Several lines, for a description or a justification.",
  number: "A whole number. Choose its unit, or “No unit”.",
  decimal: "A number with decimals. Choose its unit, or “No unit”.",
  yesno: "Two buttons: Yes and No.",
  single: "The supplier picks exactly one of your options.",
  multi: "The supplier ticks every option that applies.",
  file: "The supplier uploads a document (PDF).",
  email: "An e-mail address, checked for its format.",
  range: "A minimum and a maximum, in %.",
};

export const REQUIRED_LABEL: Record<Requiredness, string> = {
  mandatory: "Mandatory",
  optional: "Optional",
  conditional: "Mandatory if shown",
};

/** A section's content in the catalogue and its views: a documents-only section says when its upload is mandatory
 *  ("Upload required?", 29 Oct). */
export const documentsContent = (x: Pick<SectionData, "documentsOnly" | "uploads">) => (uploadsMandatory(x) ? "Documents only · mandatory upload" : "Documents only");

/** What "Upload required?" means, for the section form and the read-only views. */
export const UPLOADS_HINT = {
  mandatory: "When the section is mandatory for a case, the supplier must upload at least one document here, or say why they cannot. Until then it blocks the completeness confirmation and the final release.",
  optional: "The supplier may upload the documents this section asks for; the upload itself does not block the completeness confirmation (a document a rule requests here still can).",
} as const;
