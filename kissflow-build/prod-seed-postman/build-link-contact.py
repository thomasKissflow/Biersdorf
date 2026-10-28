# Builds the Postman collection that links ONE supplier contact to its Kissflow (portal) user in PROD (26 Oct): New case
# needs Contacts_Portal_User_Id on the CIQ Supplier's Contacts row, and the custom UI has no screen for it yet. Variables:
# host, account_id, access key, supplier_code, contact_email. No credentials stored here.
import json
APP, FORM = "CIQ_Digital_A00", "CIQ_Supplier_A00"
H = [{"key": "X-Access-Key-Id", "value": "{{access_key_id}}"}, {"key": "X-Access-Key-Secret", "value": "{{access_key_secret}}"}, {"key": "Content-Type", "value": "application/json"}]
form = "https://{{host}}/form/2/{{account_id}}/" + FORM
q = "?_application_id=" + APP
def req(name, method, url, body=None, test=""):
    r = {"name": name, "request": {"method": method, "header": H, "url": url}, "event": [{"listen": "test", "script": {"type": "text/javascript", "exec": test.strip("\n").split("\n")}}]}
    if body is not None: r["request"]["body"] = {"mode": "raw", "raw": body, "options": {"raw": {"language": "json"}}}
    return r
same = 'const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();'
items = [
 req("1 find the user by e-mail", "GET", "https://{{host}}/user/2/{{account_id}}?page_number=1&page_size=500", test=f"""
{same}
pm.test("status 200", () => pm.response.to.have.status(200));
const body = pm.response.json();
const users = Array.isArray(body) ? body : (body.Data || body.items || []);
const u = users.find((x) => same(x.Email, pm.collectionVariables.get("contact_email")));
pm.test("a Kissflow user has this e-mail (" + users.length + " users listed)", () => pm.expect(u, "no user with this e-mail: invite it to the portal first, or it is past the first 500 users").to.be.ok);
if (u) {{ pm.collectionVariables.set("user_id", u._id); console.log("user", u._id, u.Name); }}"""),
 req("2 find the supplier by code", "POST", form + "/list" + q + "&page_number=1&page_size=200&q={{supplier_code}}", "{}", test=f"""
{same}
pm.test("status 200", () => pm.response.to.have.status(200));
const body = pm.response.json();
const rows = Array.isArray(body) ? body : (body.Data || []);
const s = rows.filter((r) => same(r.Supplier_Code, pm.collectionVariables.get("supplier_code")));
pm.test("exactly one supplier has this code", () => pm.expect(s.length, "suppliers with this code: " + s.length).to.eql(1));
if (s.length === 1) pm.collectionVariables.set("supplier_id", s[0]._id);"""),
 req("3 read the supplier and find the contact row", "GET", form + "/{{supplier_id}}" + q, test=f"""
{same}
pm.test("status 200", () => pm.response.to.have.status(200));
const it = pm.response.json();
const rows = it["Table::Contacts"] || it.Contacts || [];
const c = rows.filter((r) => same(r.Contacts_Email, pm.collectionVariables.get("contact_email")));
pm.test("exactly one contact row has this e-mail (" + rows.length + " contacts)", () => pm.expect(c.length).to.eql(1));
if (c.length === 1) {{
  pm.collectionVariables.set("contact_row_id", c[0]._id);
  console.log("contact row", c[0]._id, "portal user now:", c[0].Contacts_Portal_User_Id || "(none)", "active:", c[0].Contacts_Active);
  pm.test("the contact is active", () => pm.expect(String(c[0].Contacts_Active || "")).to.not.match(/^no$/i));
}}"""),
 req("4 link the contact to the user", "POST", form + "/{{supplier_id}}" + q,
     '{"Table::Contacts": [{"_id": "{{contact_row_id}}", "Contacts_Portal_User_Id": "{{user_id}}"}]}', test="""
pm.test("status 200", () => pm.response.to.have.status(200));"""),
 req("5 read back", "GET", form + "/{{supplier_id}}" + q, test="""
pm.test("status 200", () => pm.response.to.have.status(200));
const it = pm.response.json();
const rows = it["Table::Contacts"] || it.Contacts || [];
const c = rows.find((r) => r._id === pm.collectionVariables.get("contact_row_id"));
pm.test("the contact row now holds the user id", () => pm.expect(c && c.Contacts_Portal_User_Id).to.eql(pm.collectionVariables.get("user_id")));"""),
]
col = {"info": {"name": "CIQ prod: link a supplier contact to its portal user", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        "description": "New case needs at least one chosen, active contact whose CIQ Supplier Contacts row holds Contacts_Portal_User_Id (the contact's Kissflow user id). Fill host, account_id, the access key, supplier_code and contact_email, then run 1 to 5 in order. Repeat per contact. Kissflow-internal."},
       "variable": [{"key": k, "value": v} for k, v in [("host", "beiersdorf.kissflow.eu"), ("account_id", ""), ("access_key_id", ""), ("access_key_secret", ""), ("supplier_code", ""), ("contact_email", ""), ("user_id", ""), ("supplier_id", ""), ("contact_row_id", "")]],
       "item": items}
json.dump(col, open("CIQ-prod-link-contact.postman_collection.json", "w"), indent=1)
print("ok", len(items))
