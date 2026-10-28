// Thomas approved (22 Oct, "ok"): add or remove Thomas in one app role for the phase-1/2 tests; keeps the role's name,
// description and other members; verifies by GET.   node role-member.mjs <roleId> add|remove
import { call, A } from "./integ-lib.mjs";
const [ROLE, op] = process.argv.slice(2), APP = "CIQ_Digital_A00";
const THOMAS = { _id: "UsEJUfjYLM8Y", Name: "Thomas", Kind: "User" };
const get = async () => (await call("GET", `/app_role/2/${A}/${ROLE}?_application_id=${APP}`)).body || {};
const g = await get();
const users = (g.Members || g.Users || []).map((u) => ({ _id: u._id, Name: u.Name, Kind: u.Kind || "User" }));
const next = op === "remove" ? users.filter((u) => u._id !== THOMAS._id) : users.some((u) => u._id === THOMAS._id) ? users : [...users, THOMAS];
const r = await call("PUT", `/app_role/2/${A}/${ROLE}?_application_id=${APP}`, { Name: g.Name, Description: g.Description || "", _application_id: APP, Users: next });
const back = await get();
console.log(g.Name, op, "PUT", r.status, "| members now:", (back.Members || []).map((u) => u.Name).join(", ") || "(none)");
