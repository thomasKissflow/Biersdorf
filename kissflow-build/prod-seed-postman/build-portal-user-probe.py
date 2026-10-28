# 26 Oct: read-only probe for PROD (Thomas runs it): how Kissflow describes a portal (external) user, so that I-1 and the
# other hand-offs can put portal users into User fields (the prod create failed with "This user does not exist in the
# account"). No credentials stored here.
import json
H = [{"key": "X-Access-Key-Id", "value": "{{access_key_id}}"}, {"key": "X-Access-Key-Secret", "value": "{{access_key_secret}}"}]
def req(name, url, test):
    return {"name": name, "request": {"method": "GET", "header": H, "url": url}, "event": [{"listen": "test", "script": {"type": "text/javascript", "exec": test.strip("\n").split("\n")}}]}
items = [
 req("1 portal: find the model id", "https://{{host}}/portal/2/{{account_id}}/{{portal_id}}", """
pm.test("status 200", () => pm.response.to.have.status(200));
const b = pm.response.json();
console.log("portal keys:", Object.keys(b).join(", "));
// the model id: the first value under a key that names a model (e.g. UserModel, Model, _model_id); else set model_id by hand
const found = [];
const walk = (o, path) => { for (const [k, v] of Object.entries(o || {})) { if (v && typeof v === "object") walk(v, path + k + "."); else if (/model/i.test(k)) found.push([path + k, v]); } };
walk(b, "");
console.log("model-like keys:", JSON.stringify(found));
if (found.length && !pm.collectionVariables.get("model_id")) pm.collectionVariables.set("model_id", String(found[0][1]));
pm.test("a model id is known (found or set by hand)", () => pm.expect(pm.collectionVariables.get("model_id")).to.be.a("string").and.not.empty);"""),
 req("2 portal user 1", "https://{{host}}/user/2/{{account_id}}/portal/{{portal_id}}/{{model_id}}/{{user_id_1}}", """
pm.test("status 200", () => pm.response.to.have.status(200));
const u = pm.response.json();
console.log("user 1 keys:", Object.keys(u).join(", "));
console.log("user 1 _id / Kind / Name / Type:", u._id, "/", u.Kind, "/", u.Name, "/", u.Type || u.UserType || "");"""),
 req("3 portal user 2", "https://{{host}}/user/2/{{account_id}}/portal/{{portal_id}}/{{model_id}}/{{user_id_2}}", """
pm.test("status 200", () => pm.response.to.have.status(200));
const u = pm.response.json();
console.log("user 2 keys:", Object.keys(u).join(", "));
console.log("user 2 _id / Kind / Name / Type:", u._id, "/", u.Kind, "/", u.Name, "/", u.Type || u.UserType || "");"""),
 req("4 the same ids as account users (for comparison)", "https://{{host}}/user/2/{{account_id}}/{{user_id_1}}", """
console.log("account-user lookup of user 1:", pm.response.code, pm.response.text().slice(0, 200));"""),
]
col = {"info": {"name": "CIQ prod probe: portal user details", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        "description": "Read-only. Fill host, account_id, the access key, user_id_1 and user_id_2 (the two contact ids from the failed I-1 run); run 1 to 4; send back what the Console shows (keys, _id, Kind, Name, Type), not the access key. If request 1 finds no model id, set model_id by hand from its response."},
       "variable": [{"key": k, "value": v} for k, v in [("host", "beiersdorf.kissflow.eu"), ("account_id", ""), ("access_key_id", ""), ("access_key_secret", ""), ("portal_id", "CIQ_Supplier_Portal_A00"), ("model_id", ""), ("user_id_1", "UsEKGUxWj18y"), ("user_id_2", "UsERCbHtBilW")]],
       "item": items}
json.dump(col, open("CIQ-prod-portal-user-probe.postman_collection.json", "w"), indent=1)
print("ok")
