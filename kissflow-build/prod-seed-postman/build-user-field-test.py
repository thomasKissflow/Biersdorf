# 26 Oct: PROD test (Thomas runs it) of how a portal (external) user must be written into a CIQP Request user field.
# I-1's "Create and submit" fails in prod with "This user does not exist in the account" for the contacts' portal users.
# Reads the portal user's details, then creates a DRAFT request (never submitted: no task, no mail) with the user written
# in 4 ways, and deletes each draft at once. Tells which shape Kissflow accepts. No credentials stored here.
import json
H = [{"key": "X-Access-Key-Id", "value": "{{access_key_id}}"}, {"key": "X-Access-Key-Secret", "value": "{{access_key_secret}}"}, {"key": "Content-Type", "value": "application/json"}]
P = "CIQ_Supplier_Portal_A00"; F = "CIQP_Request_A00"
base = "https://{{host}}/process/2/{{account_id}}/" + F
def req(name, method, url, body=None, pre="", test=""):
    r = {"name": name, "request": {"method": method, "header": H, "url": url}, "event": []}
    if body is not None: r["request"]["body"] = {"mode": "raw", "raw": body, "options": {"raw": {"language": "json"}}}
    if pre: r["event"].append({"listen": "prerequest", "script": {"type": "text/javascript", "exec": pre.strip("\n").split("\n")}})
    if test: r["event"].append({"listen": "test", "script": {"type": "text/javascript", "exec": test.strip("\n").split("\n")}})
    return r
items = [
 req("1 portal: model id", "GET", "https://{{host}}/portal/2/{{account_id}}/" + P, test="""
const b = pm.response.json(); console.log("portal answer keys:", Object.keys(b).join(", "));
const found = []; const walk = (o, p) => { for (const [k, v] of Object.entries(o || {})) { if (v && typeof v === "object") walk(v, p + k + "."); else if (/model/i.test(k)) found.push([p + k, v]); } }; walk(b, "");
console.log("model-like keys:", JSON.stringify(found));
if (found.length && !pm.collectionVariables.get("model_id")) pm.collectionVariables.set("model_id", String(found[0][1]));"""),
 req("2 portal user details", "GET", "https://{{host}}/user/2/{{account_id}}/portal/" + P + "/{{model_id}}/{{user_id}}", test="""
console.log("portal user:", pm.response.code, pm.response.text().replace(/[\\w.+-]+@[\\w.-]+/g, "<email>").slice(0, 600));
if (pm.response.code === 200) { const u = pm.response.json(); pm.collectionVariables.set("user_obj", JSON.stringify({ _id: u._id, Name: u.Name, Kind: u.Kind })); console.log("user kind:", u.Kind); }"""),
]
shapes = [
 ("A only _id (what I-1 sends today)", '[{"_id": "{{user_id}}"}]'),
 ("B _id + Name + Kind User", '[{"_id": "{{user_id}}", "Name": "{{user_name}}", "Kind": "User"}]'),
 ("C the user object as step 2 returned it", '[{{user_obj}}]'),
 ("D _id + Kind ExternalUser", '[{"_id": "{{user_id}}", "Kind": "ExternalUser"}]'),
]
for i, (label, users) in enumerate(shapes):
    n = "ABCD"[i]
    pre = 'if (' + ('!pm.collectionVariables.get("user_obj")' if n == "C" else "false") + ') { console.log("skipped: step 2 gave no user object"); pm.execution.skipRequest(); }'
    body = '{"Request_Key": "ZZT-USERFIELD-' + n + '|1", "Case_Code": "ZZT-USERFIELD-' + n + '", "Assigned_Contacts": ' + users + ', "Release_Contacts": ' + users + '}'
    items.append(req(f"3{n} create a draft: {label}", "POST", base + "?_application_id=" + P, body, pre=pre, test=f"""
const ok = pm.response.code >= 200 && pm.response.code < 300;
let id = ""; try {{ id = pm.response.json()._id || ""; }} catch (e) {{}}
pm.collectionVariables.set("draft_{n}", ok ? id : "");
console.log("SHAPE {n}: " + (ok ? "ACCEPTED" : "REFUSED") + " (" + pm.response.code + ") " + (ok ? "draft " + id : pm.response.text().slice(0, 220)));"""))
    items.append(req(f"4{n} delete that draft", "DELETE", "https://{{host}}/process/2/{{account_id}}/admin/" + F + "/{{draft_" + n + "}}?_application_id=" + P,
        pre='if (!pm.collectionVariables.get("draft_' + n + '")) { pm.execution.skipRequest(); }', test="""
console.log("draft deleted:", pm.response.code);"""))
col = {"info": {"name": "CIQ prod test: portal user in a request's user field", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        "description": "Fill host, account_id, the SERVICE ACCOUNT's access key (the user I-1's connection acts as), user_id (one contact's portal user id, e.g. UsEKGUxWj18y) and user_name. Run 1 to 4D in order. Each 3x creates a DRAFT CIQP Request (never submitted) with the user written one way and 4x deletes it. Send me the Console lines (SHAPE A..D ACCEPTED/REFUSED, the user kind), never the key."},
       "variable": [{"key": k, "value": v} for k, v in [("host", "beiersdorf.kissflow.eu"), ("account_id", ""), ("access_key_id", ""), ("access_key_secret", ""), ("model_id", ""), ("user_id", "UsEKGUxWj18y"), ("user_name", "12343 Thomas"), ("user_obj", ""), ("draft_A", ""), ("draft_B", ""), ("draft_C", ""), ("draft_D", "")]],
       "item": items}
json.dump(col, open("CIQ-prod-user-field-test.postman_collection.json", "w"), indent=1)
print("ok", len(items))
