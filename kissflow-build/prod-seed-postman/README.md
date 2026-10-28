# Prod seed with Postman: CIQ Config Version (12 rows)

**Kissflow-internal.** This collection creates the 12 configuration rows of CIQ Digital in **production**, using your own prod access key. Without them New case refuses with "Questionnaire RS-2026.1 + v1 has no published version". The rows are the same as in `CIQ-prod-seed-config-version-INTERNAL.xlsx`. Background: `../CONFIGURATION-GUIDE.md`.

## 28 Oct: rebuilt after the matrix v0.6 check

What changed since the 26 Oct collection:

- **Questionnaire v1 and v2 (`TPL:` rows) and the releases (`REL:` rows):** section leads as the matrix approval column (K2.1 RMM, Annex 1 Regulatory, Annex 2 RMM), Feedstock and its two Content % fields moved from Annex 1 into K2.3, new fields FLD-A1-105 (read-only Country of origin), FLD-A1-209 (certificate of the other certification) and FLD-A4-104 (viscosity analytical data), and some labels, help texts and field owners. Last change (28 Oct, 18:27 IST): FLD-A1-206 RSPO help adds "The RSPO number must be on the certificate of analysis (CoA) you upload in K1."
- **Rules (`RS:` rows):** R-80 (palm, SF-08) is gone, so RS-2026.1 has 24 rules and the RS-2026.2 draft 25; R-10 and R-14 name the new reviewing departments.
- **`OWN:current`** (section owners) and **`REG:current`** (the Test rules materials, without SF-02 and SF-08).
- **Unchanged:** `SET:current` (byte for byte, it carries the webhook tokens), `REM:current`, `RMES:current` and `LIM:current`.

Before you run it:

1. **Push the new app UI and portal UI first** (or together with the rows): app `ciq-app-ui-87002b74ba`, portal `ciq-portal-ui-b88be34e73`, Live in dev since 28 Oct, 18:50 IST. Fixed copies: `../optimise-2026-10-26/rollback-zips/matrix-fixes-2026-10-28/`. The UIs before them: `../optimise-2026-10-26/rollback-zips/before-matrix-fixes/`. The old UIs would show the three new fields without their conditions, and the two new uploads would then always be required.
2. **Delete the 12 old rows in prod** (CIQ Config Version), as you planned. If you don't, request 00 lists the keys that are still there and their requests are skipped, so the old rows stay.
3. Cases started before the new rows keep their old configuration in the portal. Start new test cases after the import.
4. Re-paste `../final-pdf/apps-script/Bundle.gs` into the prod Apps Script project.
5. Give the client testers the updated `../CIQ-UAT-test-cases.xlsx` (TC-05, -07, -08, -09, -12, -15, -17, -30 and -44 follow the 28 Oct build; script `../night-2026-10-21/uat-matrix-v0.6-2026-10-28.py`, backup in `../night-2026-10-21/backups/`).

## Steps (about 5 minutes)

1. **Postman → Import →** `CIQ-prod-seed-config-version.postman_collection.json`.
2. **Fill the collection variables** (collection → Variables). Never paste the key into a request, a file or a chat.
   - `host`: `beiersdorf.kissflow.eu` (preset).
   - `account_id`: the prod account id (the `Ac…` id in Kissflow's admin pages or URLs).
   - `access_key_id`, `access_key_secret`: your prod access key. It must be allowed to create items in the app form CIQ Config Version.
3. **Run the collection once, in order:** collection → Run → Run. Keep the order; don't run requests in parallel. Kissflow keeps one draft per user per form, so each row is created and submitted before the next.
4. **Read the results.** Every request should be green:
   - **00 check:** the form holds none of the 12 keys yet. If some exist, they are listed, and their requests are skipped in the run, so a second run never duplicates rows.
   - **NNa create / NNb submit:** status 200, a draft id, then the item id.
   - **NNc read back:** each long field (`Payload JSON`, `Release Bundle JSON`, …) stored exactly. Its SHA-256 equals the seed file's.
5. **In the app,** reload as RMM and start a case. "Questionnaire … has no published version" should be gone.

## If something is red

- **401/403:** the key or its rights. The key's user must be able to create CIQ Config Version items.
- **A "stored exactly" check fails:** Kissflow cut or changed a long field. Stop and send me the request's name and the "chars" number it shows. Don't edit the rows by hand.
- **The run stopped halfway:** run it again. Request 00 lists the rows already there, and their creates are skipped.

## What's in it

- 37 requests: 1 check, then create, submit and read back for each of the 12 rows.
- Built by `build-collection.py` from `../night-2026-10-21/prod-seed/config-version.json`.
- **Tests run:** the collection's scripts parse, the create bodies equal the seed rows, and its read-back checks pass against rows equal to the seed and fail on a cut field (dry run, 28 Oct). Rechecked after the last rebuild (18:27 IST): all 12 create bodies equal `config-version.json`, every read-back hash matches, and both xlsx seeds match cell by cell.
- **Not run:** the collection itself, against dev or prod. Prod is yours to run. **Dev is updated** (28 Oct, 18:48 IST, `../config-seed/update-dev-from-seed.mjs`): the 8 changed rows were rewritten in place and read back OK, with backups in `../config-seed/backups/`; `SET:current` was not written.
- No credentials are stored in the collection.
