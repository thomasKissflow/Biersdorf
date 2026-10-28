// The identity contract (pure). One Kissflow user may be BOTH an internal user (member of app roles) and a supplier
// contact (a CIQ Supplier Contacts row naming it as Contacts_Portal_User_Id). In dev that is the rule, not the exception:
// Thomas holds every app role and is the only portal user. The prototype, however, knows a person by one id with one
// side ("internal" or "supplier").
//
// So, in memory only, the supplier side of a SHARED Kissflow user gets its own id `sup:<Supplier_Code>:<uid>`
// (directory.mjs decides who is shared; both parts are URI-encoded, so a Supplier_Code with a space or ':' still gives a
// well-formed id). Minted ids never leave memory: Case Data, the ledger and every Kissflow write carry the real Kissflow
// user id (`kfId`, `unmint`). On the way in, the case's supplier positions are mapped back to the contact (`decodeCase`);
// every other position is an internal one and keeps the Kissflow id.
//
// `kfId` and `unmint` replace only strings that ARE one of the directory's minted ids (`ids`, a Set). A supplier's free
// text that merely looks like `sup:<x>:<y>` is never touched. With no shared uid nothing is minted, `ids` is empty, and
// every function here is the identity.
//
// The input channel decides the side, never an id lookup: Workbench inputs (Service Requests, Notes, Case Start fields,
// CIQ Review / Open Point step submitters) are internal actions; portal inputs (CIQP Request / Query / Final Release
// fields and their modifier) are supplier actions.

export const MINTED = /^sup:([^:\s]+):([^:\s]+)$/;

const enc = (s) => encodeURIComponent(String(s));
const dec = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** The in-memory id of the supplier side of Kissflow user `uid` at supplier `code` (always matches MINTED). */
export const mintId = (code, uid) => `sup:${enc(code)}:${enc(uid)}`;

/** Has this string the shape of a minted id? (Shape only: whether it IS one is a question for the directory's ids.) */
export const isMinted = (v) => typeof v === "string" && MINTED.test(v);

/** The Kissflow user id inside a minted id (its shape only), else undefined. */
export function uidOfMinted(id) {
  const m = typeof id === "string" ? MINTED.exec(id) : null;
  return m ? dec(m[2]) : undefined;
}

/** The Kissflow user id behind an id: a member of `ids` (the directory's minted ids) → its uid; anything else unchanged. */
export function kfId(id, ids) {
  if (typeof id !== "string" || !ids?.size || !ids.has(id)) return id;
  return uidOfMinted(id) ?? id;
}

const isPlain = (v) => v !== null && typeof v === "object" && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/**
 * Deep copy with every string that IS one of the minted ids `ids` (whole string) replaced by its Kissflow id. Values only
 * (keys are never user ids). Unchanged sub-trees are returned as they are, so without a minted id (or with an empty
 * `ids`) this returns `v` itself.
 */
export function unmint(v, ids) {
  if (!ids?.size) return v;
  const walk = (x) => {
    if (typeof x === "string") return kfId(x, ids);
    if (Array.isArray(x)) {
      let changed = false;
      const out = x.map((y) => {
        const z = walk(y);
        if (z !== y) changed = true;
        return z;
      });
      return changed ? out : x;
    }
    if (isPlain(x)) {
      let changed = false;
      const out = {};
      for (const [k, y] of Object.entries(x)) {
        const z = walk(y);
        if (z !== y) changed = true;
        out[k] = z;
      }
      return changed ? out : x;
    }
    return x;
  };
  return walk(v);
}

/** A text (an error message, a Result_Note) with every minted id of `ids` inside it replaced by its Kissflow id. */
export function scrubMinted(text, ids) {
  if (typeof text !== "string" || !ids?.size || !text.includes("sup:")) return text;
  let out = text;
  for (const id of [...ids].sort((a, b) => b.length - a.length)) if (out.includes(id)) out = out.split(id).join(uidOfMinted(id) ?? "");
  return out;
}

/** The first minted id of `ids` found anywhere in a write body (also inside JSON strings), else null. */
export function findMinted(body, ids) {
  if (!ids?.size || body === undefined || body === null) return null;
  const scan = (v) => {
    if (typeof v === "string") {
      if (!v.includes("sup:")) return null;
      for (const id of ids) if (v.includes(id)) return id;
      return null;
    }
    if (Array.isArray(v)) {
      for (const x of v) {
        const f = scan(x);
        if (f) return f;
      }
      return null;
    }
    if (v && typeof v === "object") {
      for (const x of Object.values(v)) {
        const f = scan(x);
        if (f) return f;
      }
    }
    return null;
  };
  return scan(body);
}

/**
 * The canonical case as stored (Kissflow ids) → the case in memory: exactly the SUPPLIER positions are mapped through
 * `dir.supplierIdFor(x, c.supplierId)` (the contact of the case's own supplier; anything else is left alone):
 *   supplierContactIds · answeredBy[*].by · documents[].uploadedBy · confirmations of type completeness / final-release ·
 *   openPoints[].thread[side = supplier].by.
 * Everything else (owner, assignees, raisers, responsible persons, RMES, internal thread entries) is internal.
 */
export function decodeCase(c, dir) {
  if (!c || !dir?.mintedIds?.size) return c;
  const s = (x) => (x === undefined || x === null ? x : dir.supplierIdFor(x, c.supplierId));
  const out = { ...c };
  if (Array.isArray(c.supplierContactIds)) out.supplierContactIds = c.supplierContactIds.map(s);
  if (c.answeredBy && typeof c.answeredBy === "object") out.answeredBy = Object.fromEntries(Object.entries(c.answeredBy).map(([k, v]) => [k, v && typeof v === "object" && "by" in v ? { ...v, by: s(v.by) } : v]));
  if (Array.isArray(c.documents)) out.documents = c.documents.map((d) => (d && "uploadedBy" in d ? { ...d, uploadedBy: s(d.uploadedBy) } : d));
  if (Array.isArray(c.confirmations)) out.confirmations = c.confirmations.map((x) => (x && (x.type === "completeness" || x.type === "final-release") && "by" in x ? { ...x, by: s(x.by) } : x));
  if (Array.isArray(c.openPoints)) out.openPoints = c.openPoints.map((p) => (p && Array.isArray(p.thread) ? { ...p, thread: p.thread.map((m) => (m && m.side === "supplier" && "by" in m ? { ...m, by: s(m.by) } : m)) } : p));
  return out;
}
