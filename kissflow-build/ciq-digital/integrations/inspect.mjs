// Read-only: one integration's draft, its multi-value user mappings and Run script code length.   inspect.mjs <id>
import { getDraft } from "./integ-lib.mjs";
const b = await getDraft(process.argv[2]);
for (const v of Object.values(b)) {
  if (v?.Kind === "FieldMapping" && v.IsMultiValue && v.Type === "Object") {
    const props = (v["FieldMapping::Property"] || []).map((p) => b[p]?.Field);
    const kids = (v["FieldMapping::FieldMapping"] || []).map((c) => `${b[c]?.Name}=${(b[c]?.["FieldMapping::Property"] || []).map((p) => b[p]?.Field).join(",")}`);
    console.log("users", v.Name, props, kids);
  }
  if (v?.Kind === "Property" && v.Type === "Code") console.log("code", v.Name, (v.Code || "").length, "chars, starts:", (v.Code || "").slice(0, 60).replace(/\n/g, " "));
  if (v?.Kind === "Trigger" || v?.Kind === "Action") console.log(v.Kind, v.Id, "IsTested", !!v.IsTested, "Output", v.Output ? Object.keys(v.Output).slice(0, 6) : null);
}
