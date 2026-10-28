// Portal deadlines (Thomas, 15 Oct: "yes you can set deadlines"). Copies the SLA shape Thomas made in the builder on
// "Supplier: fill in the CIQ" (deadline = a Date field; reminder Notify with the recipient Assigned_Contacts.get(0)).
//   CIQP Request · Supplier: fill in the CIQ → reminder 7 days before (was 1 month) + overdue reminder 1 day after
//   CIQP Query   · Supplier: respond        → deadline = Supplier_Due_Date, reminder 2 days before + 1 day after
// node set-deadlines.mjs            dry run (prints what would change, writes nothing)
// node set-deadlines.mjs --apply    PUT draft → publish → read back, paced 1.2 s
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const w = writer(here("./deadline-requests.jsonl"));
const APPLY = process.argv.includes("--apply");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (fn) => { await sleep(1200); return fn(); };
const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 12)}`;
const ref = (b, id, key, val) => { b[id][key] = [...new Set([...(b[id][key] || []), val])]; };

function addNotify(b, slaId, model, { value, unit, when }) {
  const n = rid("Notify"), e = rid("Expression"), fn = rid("Node"), fld = rid("Node"), st = rid("Node");
  b[n] = { Id: n, Kind: "Notify", SLA: slaId, Type: "Notify", "Notify::Expression": [e], ValueType: "Expression", Value: String(value), Unit: unit, When: when };
  b[e] = { Id: e, Kind: "Expression", ExpressionStr: "Assigned_Contacts.get(0)", Notify: n, "Expression::Node": [fn] };
  b[fn] = { Id: fn, Kind: "Node", Type: "Function", Value: "get", Syntax: "Chain", Expression: e, FieldRefCount: 1, "Node::Node": [fld, st], DataType: "User", Category: "UserList" };
  b[fld] = { Id: fld, Kind: "Node", Type: "Field", Field: "Assigned_Contacts", DataType: "UserList", Node: fn };
  b[st] = { Id: st, Kind: "Node", Type: "Static", Value: "0", DataType: "Number", Node: fn };
  ref(b, "Assigned_Contacts", "Field::Node", fld);
  ref(b, slaId, "SLA::Notify", n);
}

function addSla(b, actId, dateField) {
  const s = rid("SLA"), e = rid("Expression"), nd = rid("Node");
  b[s] = { Id: s, Kind: "SLA", ActivityDefaultSLA: actId, "SLA::Expression": [e], "SLA::Notify": [] };
  b[e] = { Id: e, Kind: "Expression", ExpressionStr: dateField, SLA: s, "Expression::Node": [nd] };
  b[nd] = { Id: nd, Kind: "Node", Type: "Field", Field: dateField, DataType: "Date", Expression: e };
  ref(b, dateField, "Field::Node", nd);
  b[actId]["ActivityDefaultSLA::SLA"] = [s];
  return s;
}

const plans = [
  { id: "CIQP_Request_A00", step: "Supplier: fill in the CIQ", edit(b, act) {
      const slaId = (act["ActivityDefaultSLA::SLA"] || [])[0];
      if (!slaId || !b[slaId]) throw new Error("Thomas's SLA on fill-in is missing");
      const first = b[(b[slaId]["SLA::Notify"] || [])[0]];
      if (!first) throw new Error("no reminder on fill-in");
      Object.assign(first, { Value: "7", Unit: "Days", When: "Before" });
      if (!(b[slaId]["SLA::Notify"] || []).some((x) => b[x]?.When === "After")) addNotify(b, slaId, "CIQP_Request_A00", { value: 1, unit: "Days", when: "After" });
    } },
  { id: "CIQP_Query_A00", step: "Supplier: respond", edit(b, act) {
      if (act["ActivityDefaultSLA::SLA"]?.length) throw new Error("respond already has an SLA: leave it");
      if (b.Supplier_Due_Date?.Type !== "Date" || b.Assigned_Contacts?.Type !== "MultiUser") throw new Error("expected fields missing");
      const s = addSla(b, act.Id, "Supplier_Due_Date");
      addNotify(b, s, "CIQP_Query_A00", { value: 2, unit: "Days", when: "Before" });
      addNotify(b, s, "CIQP_Query_A00", { value: 1, unit: "Days", when: "After" });
    } },
];

const summary = (b, act) => {
  const s = b[(act["ActivityDefaultSLA::SLA"] || [])[0]];
  if (!s) return "no deadline";
  const ex = b[(s["SLA::Expression"] || [])[0]]?.ExpressionStr;
  const ns = (s["SLA::Notify"] || []).map((x) => b[x]).map((n) => `${n.When} ${n.Value} ${n.Unit} → ${b[(n["Notify::Expression"] || [])[0]]?.ExpressionStr}`);
  return `deadline = ${ex}; reminders: ${ns.join(" | ")}`;
};

for (const p of plans) {
  const gd = await call(() => w.getDraft("process", p.id));
  const b = gd.body;
  if (gd.status !== 200 || !b || typeof b !== "object" || !b[p.id]) { console.log(`${p.id}: ABORT, draft not readable (${gd.status}); nothing written`); continue; }
  const act = Object.values(b).find((o) => o && o.Kind === "Activity" && o.Name === p.step);
  if (!act) { console.log(`${p.id}: ABORT, step "${p.step}" not found`); continue; }
  console.log(`${p.id} · ${p.step}\n  before: ${summary(b, act)}`);
  p.edit(b, act);
  console.log(`  after:  ${summary(b, act)}`);
  if (!APPLY) continue;
  const put = await call(() => w.putDraft("process", p.id, b));
  const pub = put.status < 300 ? await call(() => w.publish("process", p.id)) : { status: "skipped", body: "" };
  const back = await call(() => w.getDraft("process", p.id));
  const bb = back.body, ba = bb && Object.values(bb).find((o) => o && o.Kind === "Activity" && o.Name === p.step);
  console.log(`  PUT ${put.status} · publish ${pub.status}${pub.status >= 300 ? " " + JSON.stringify(pub.body).slice(0, 300) : ""}\n  read back: ${ba ? summary(bb, ba) : "step missing!"}`);
}
