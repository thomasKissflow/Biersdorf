// Read-only: a ZZT CIQP Query created by the op.round test (and remember it for clean-up).   zzt-query.mjs <queryId>
import { call, A, load, save } from "./integ-lib.mjs";
const id = process.argv[2];
const s = load(); s.zzt = s.zzt || {}; s.zzt.queries = [...new Set([...(s.zzt.queries || []), id])]; save(s);
const q = (await call("GET", `/process/2/${A}/admin/CIQP_Query_A00/${id}?_application_id=CIQ_Supplier_Portal_A00`)).body;
const pick = (ks) => Object.fromEntries(ks.map((k) => [k, q?.[k] ?? null]));
console.log(JSON.stringify({ ...pick(["_id", "_status", "_current_step", "Query_Key", "Round_No", "App_Open_Point_Id", "Case_Code", "Kind_Label", "Responsible_Department", "Ref_Kind", "Ref_Section_Key", "Ref_Label", "Question_Text", "Supplier_Justification", "Supplier_Due_Date", "Edited_At"]), Assigned_Contacts: (q?.Assigned_Contacts || []).map((u) => u._id), assignedNow: (q?._current_assigned_to || []).map((u) => `${u.Kind}:${u.Name}`) }, null, 1));
