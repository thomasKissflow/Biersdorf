// Deterministic ids + helpers. Ids MUST be stable across runs (same IR → same ids)
// so reconcile diffs stay minimal and dev references don't break.

/** Stable short hash (djb2) → base36, for deterministic suffixes. */
export function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** A safe Kissflow id from a human name (PascalCase-ish, alnum + underscore). */
export function slug(name) {
  return String(name)
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_") || "Field";
}

/** Deterministic entity id: `<Prefix>_<hash(seed)>` — stable for a given seed. */
export const eid = (prefix, seed) => `${prefix}_${hash(seed)}`;

export const SYSTEM_FIELDS = [
  "_id", "Name", "_created_by", "_modified_by", "_created_at", "_modified_at", "_is_deleted",
  "_deleted_at", "_deleted_by", "_flow_name", "_application_id", "_flow_type", "_doc_version",
  "_visited", "_is_draft", "_is_public_form", "_expire_at",
];

/** Field types that need a QueryDefinition (reference/user lookups). */
export const REF_TYPES = new Set(["Reference", "ReferenceList", "User", "MultiUser", "UserList", "UserAndGroup"]);

// ── canonical Kissflow field types + alias resolution ─────────────────────────
// Golden-export canon; agents write variants ("Sequence Number", "Geo", "dropdown") that the API
// 500s on at publish. canonicalFieldType returns the canonical name, or null if unknown.
export const CANON_FIELD_TYPES = ["Text","Textarea","Number","Currency","Date","DateTime","Select","Multiselect","Boolean","Checkbox","Checklist","Reference","User","Attachment","Image","Email","Signature","Slider","StarRating","SequenceNumber","Geolocation","Table"];
const _tkey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const _ALIAS = {};
for (const t of CANON_FIELD_TYPES) _ALIAS[_tkey(t)] = t;
Object.assign(_ALIAS, {
  yesno: "Boolean", yesorno: "Boolean", toggle: "Boolean",
  dropdown: "Select", singleselect: "Select", picklist: "Select",
  multiselectdropdown: "Multiselect", multipleselect: "Multiselect",
  longtext: "Textarea", multiline: "Textarea", paragraph: "Textarea", richtext: "Textarea",
  string: "Text", textfield: "Text", shorttext: "Text", phone: "Text", phonenumber: "Text",
  integer: "Number", decimal: "Number", float: "Number",
  sequence: "SequenceNumber", sequenceno: "SequenceNumber", autonumber: "SequenceNumber",
  autoincrement: "SequenceNumber", serialnumber: "SequenceNumber", serialno: "SequenceNumber", autoid: "SequenceNumber",
  geo: "Geolocation", location: "Geolocation", gps: "Geolocation", latlong: "Geolocation", maplocation: "Geolocation",
  rating: "StarRating", stars: "StarRating",
  file: "Attachment", document: "Attachment", upload: "Attachment",
  photo: "Image", picture: "Image",
  lookup: "Reference", ref: "Reference",
});
export const canonicalFieldType = (t) => _ALIAS[_tkey(t)] || null;
