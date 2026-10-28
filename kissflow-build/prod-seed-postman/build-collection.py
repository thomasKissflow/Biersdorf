# Builds the Postman collection that creates the 12 CIQ Config Version rows in PROD with Thomas's own access key
# (26 Oct: the app runs a custom UI, so Kissflow's form import is out of reach). No credentials in here: the key, the
# account id and the host are collection variables Thomas fills in Postman. Per row: create (a draft), submit, read back
# with a SHA-256 of every long field compared to the seed file. Run it once, in order, with the Collection Runner.
import hashlib, json
SRC = "../night-2026-10-21/prod-seed/config-version.json"
rows = json.load(open(SRC))
FORM, APP = "CIQ_Config_Version_A00", "CIQ_Digital_A00"
base = "https://{{host}}/form/2/{{account_id}}/" + FORM
q = "?_application_id=" + APP
H = [{"key": "X-Access-Key-Id", "value": "{{access_key_id}}"}, {"key": "X-Access-Key-Secret", "value": "{{access_key_secret}}"}, {"key": "Content-Type", "value": "application/json"}]
def req(name, method, url, body=None, pre=None, test=None):
    r = {"name": name, "request": {"method": method, "header": H, "url": url}, "event": []}
    if body is not None: r["request"]["body"] = {"mode": "raw", "raw": json.dumps(body, ensure_ascii=False), "options": {"raw": {"language": "json"}}}
    if pre: r["event"].append({"listen": "prerequest", "script": {"type": "text/javascript", "exec": pre.split("\n")}})
    if test: r["event"].append({"listen": "test", "script": {"type": "text/javascript", "exec": test.split("\n")}})
    return r
items = []
# 00: the form must not hold these keys yet (a second run would duplicate them)
keys = [r["Config_Key"] for r in rows]
items.append(req("00 check: the form holds none of the 12 keys yet", "POST", base + "/list" + q + "&page_number=1&page_size=200", {}, test="""
const body = pm.response.json();
const rows = Array.isArray(body) ? body : (body.Data || []);
const want = %s;
const there = rows.map(r => r.Config_Key).filter(k => want.includes(k));
pm.collectionVariables.set("existing_keys", JSON.stringify(there));
pm.test("status 200", () => pm.response.to.have.status(200));
pm.test("none of the 12 keys exists yet (else the rows that exist are skipped)", () => pm.expect(there, "already there: " + there.join(", ")).to.eql([]));""" % json.dumps(keys)))
for i, r in enumerate(rows, 1):
    k = r["Config_Key"]; n = f"{i:02d}"
    skip = """const there = JSON.parse(pm.collectionVariables.get("existing_keys") || "[]");
if (there.includes(%s)) { console.log("skipped, exists: " + %s); pm.execution.skipRequest(); }""" % (json.dumps(k), json.dumps(k))
    items.append(req(f"{n}a create {k}", "POST", base + q, r, pre=skip, test=f"""
pm.test("status 200", () => pm.response.to.have.status(200));
const id = pm.response.json()._id;
pm.test("a draft id", () => pm.expect(id).to.be.a("string").and.not.empty);
pm.collectionVariables.set("draft_{n}", id);"""))
    items.append(req(f"{n}b submit {k}", "POST", base + "/{{draft_" + n + "}}/submit" + q, {}, pre=skip, test=f"""
pm.test("status 200", () => pm.response.to.have.status(200));
let id = pm.collectionVariables.get("draft_{n}");
try {{ const b = pm.response.json(); if (b && typeof b._id === "string" && b._id) id = b._id; }} catch (e) {{ const t = pm.response.text().trim(); if (t && !t.startsWith("{{")) id = t.replace(/"/g, ""); }}
pm.collectionVariables.set("item_{n}", id);"""))
    sums = {f: hashlib.sha256(str(v).encode("utf-8")).hexdigest() for f, v in r.items()}
    items.append(req(f"{n}c read back {k}", "GET", base + "/{{item_" + n + "}}" + q, pre=skip, test="""
pm.test("status 200", () => pm.response.to.have.status(200));
const it = pm.response.json();
const want = %s;
for (const [f, sum] of Object.entries(want)) {
  const v = it[f] === undefined || it[f] === null ? "" : (typeof it[f] === "string" ? it[f] : String(it[f]));
  pm.test(f + " stored exactly (" + v.length + " chars)", () => pm.expect(CryptoJS.SHA256(v).toString(), f + " differs from the seed file").to.eql(sum));
}""" % json.dumps({f: s for f, s in sums.items() if f.endswith("_JSON") or f in ("Config_Key", "Config_State", "Content_Hash", "Manifest_Hash")})))
col = {
  "info": {"name": "CIQ prod seed: CIQ Config Version (12 rows)", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
           "description": "Creates the 12 configuration rows of CIQ Digital in PRODUCTION. Fill the collection variables (host, account_id, access_key_id, access_key_secret), then run the whole collection once, in order, with the Collection Runner. Every row is created, submitted and read back; each long field is compared by SHA-256 with the seed file. Request 00 stops a second run from duplicating rows (existing keys are skipped). Kissflow-internal."},
  "variable": [{"key": "host", "value": "beiersdorf.kissflow.eu"}, {"key": "account_id", "value": ""}, {"key": "access_key_id", "value": ""}, {"key": "access_key_secret", "value": ""}, {"key": "existing_keys", "value": "[]"}],
  "item": items,
}
json.dump(col, open("CIQ-prod-seed-config-version.postman_collection.json", "w"), ensure_ascii=False, indent=1)
print(len(items), "requests")
