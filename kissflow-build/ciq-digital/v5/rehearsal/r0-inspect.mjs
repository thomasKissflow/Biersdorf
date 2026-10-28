// R0 (read-only): snapshot the original drafts of the two ZZ test processes and the two ZZ lists,
// summarise their steps, and read the published field lists. Writes originals/ and r0-inspect-result.json.
import { w, CASE, POINT, L_YESNO, L_DEC, snapshot, steps, publishedFields, save, kinds } from "./lib.mjs";

const out = { at: new Date().toISOString() };
for (const id of [CASE, POINT]) {
  const d = await snapshot("process", id, "original");
  const pf = await publishedFields(id);
  out[id] = {
    publishedAt: d.PublishedAt, meta: d._meta_version, kinds: kinds(d), steps: steps(d),
    fields: (d[d.Root]["Model::Field"] || []).map((f) => `${f}:${d[f]?.Type}`),
    publishedFieldsStatus: pf.status,
    publishedFieldIds: Array.isArray(pf.body) ? pf.body.map((f) => f.Id || f._id || f.FieldId).filter(Boolean) : typeof pf.body,
  };
}
for (const id of [L_YESNO, L_DEC]) {
  const r = await w.getListItems(id);
  out[id] = { status: r.status, items: r.body };
  if (r.status < 300) save(`originals/${id}.items.original.json`, r.body);
}
save("r0-inspect-result.json", out);
console.log(JSON.stringify(out, (k, v) => (k === "publishedFieldIds" && Array.isArray(v) ? `${v.length} ids` : v), 1));
