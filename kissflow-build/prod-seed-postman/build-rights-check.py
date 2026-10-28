# 26 Oct: read-only rights check for PROD, run with the SERVICE ACCOUNT's access key (the user the integrations'
# connections act as). Each request is one admin read the integrations make; 200 = allowed, 403 = that right is missing.
import json
H = [{"key": "X-Access-Key-Id", "value": "{{access_key_id}}"}, {"key": "X-Access-Key-Secret", "value": "{{access_key_secret}}"}, {"key": "Content-Type", "value": "application/json"}]
P, APP = "CIQ_Supplier_Portal_A00", "CIQ_Digital_A00"
CHECKS = [
  ("portal · CIQP Request (I-1 step 3, E-B, I-2, I-7, request.changed)", "GET", f"/process/2/{{{{account_id}}}}/admin/CIQP_Request_A00/item?page_number=1&page_size=1&_application_id={P}"),
  ("portal · CIQP Query (op.round, op.edited, op.closed, query.answered)", "GET", f"/process/2/{{{{account_id}}}}/admin/CIQP_Query_A00/item?page_number=1&page_size=1&_application_id={P}"),
  ("app · CIQ Case (I-1 step 1, I-2, E-B, I-7, case.cancelled)", "GET", f"/process/2/{{{{account_id}}}}/admin/CIQ_Case_A00/item?page_number=1&page_size=1&_application_id={APP}"),
  ("app · CIQ Review (I-2, E-B, I-6)", "GET", f"/process/2/{{{{account_id}}}}/admin/CIQ_Review_A00/item?page_number=1&page_size=1&_application_id={APP}"),
  ("app · CIQ Open Point (op.*, query.answered)", "GET", f"/process/2/{{{{account_id}}}}/admin/CIQ_Open_Point_A00/item?page_number=1&page_size=1&_application_id={APP}"),
  ("app · CIQ Audit Event form (history rows)", "POST", f"/form/2/{{{{account_id}}}}/CIQ_Audit_Event_A00/list?page_number=1&page_size=1&_application_id={APP}"),
]
items = []
for name, method, path in CHECKS:
    r = {"name": name, "request": {"method": method, "header": H, "url": "https://{{host}}" + path}, "event": [{"listen": "test", "script": {"type": "text/javascript", "exec": [
        'const ok = pm.response.code === 200;',
        'console.log((ok ? "ALLOWED " : "MISSING ") + pm.response.code + " · " + pm.info.requestName + (ok ? "" : " · " + pm.response.text().slice(0, 160)));',
        'pm.test("the service account may read this (200)", () => pm.expect(pm.response.code, pm.response.text().slice(0, 160)).to.eql(200));']}}]}
    if method == "POST": r["request"]["body"] = {"mode": "raw", "raw": "{}", "options": {"raw": {"language": "json"}}}
    items.append(r)
col = {"info": {"name": "CIQ prod: service account rights check", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        "description": "Read-only. Use the SERVICE ACCOUNT's access key (the user the integration connections act as). Each request is an admin read the integrations make: 200 = allowed, 403 = missing (give the service account the portal 'Admin' role for the CIQP flows, and Admin rights on the CIQ app processes). Writes and the I-2 approval also need the app role 'Integration service'."},
       "variable": [{"key": k, "value": v} for k, v in [("host", "beiersdorf.kissflow.eu"), ("account_id", ""), ("access_key_id", ""), ("access_key_secret", "")]],
       "item": items}
json.dump(col, open("CIQ-prod-service-account-rights.postman_collection.json", "w"), indent=1)
print("ok", len(items))
