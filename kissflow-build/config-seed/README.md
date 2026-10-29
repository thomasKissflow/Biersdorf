# CIQ configuration: the first-time upload

**Kissflow-internal.** These are the rows that put the questionnaire, the rules and the settings into Kissflow, plus the two scripts that make and upload them. They go into the form **CIQ Config Version** (`CIQ_Config_Version_A00`) in the app CIQ Digital.

**State on 20 Oct:** all 12 rows are already live in the dev sandbox and **identical to these files**. The dry run compares every `Content_Hash` and reports `12 same`. Nothing needs uploading in dev. The steps below are for a new account (UAT or production) and for later checks.

## What you hand over: the 12 rows

One file per row in `rows/` (exactly what is sent), and the same row with its JSON opened up for reading in `readable/`.

| Row (`Config_Key`) | Kind | State | What it holds |
|---|---|---|---|
| `TPL:CIQ-2026 v1` | Template | Published | **The questionnaire, version 1:** 44 sections and 52 questions, each with its title, its meaning, its lead and co-departments, and its questions (id, label, type, required or optional, options, help text) |
| `RS:RS-2026.1` | Rule set | Published | **The rules, version RS-2026.1:** 24 rules (R-80 dropped on 28 Oct, matrix v0.6). Each says when it applies (a metadata answer, or always), which sections it opens and whether mandatory or optional, which documents it requests, and which departments review |
| `REL:RS-2026.1 + v1` | Release | Published | **The pair a case uses:** RS-2026.1 + v1, with the fingerprints of both and the full bundle. A new case pins this row |
| `TPL:CIQ-2026 v2`, `RS:RS-2026.2`, `REL:RS-2026.2 + v2` | Template, Rule set, Release | Draft | The prepared next version from the prototype, not in use until published |
| `OWN:current` | Section ownership | Published | The lead and co-departments per section |
| `REM:current` | Reminders | Published | The reminder settings (rem-1 … rem-6) |
| `SET:current` | Settings | Published | Origins without rules, default reviewers, basis labels |
| `RMES:current` | RMES criteria | Published | **Obsolete since 28 Oct 2026:** the placeholder RMES assessment criteria. BDF's e-mail of 28 Oct scoped the RMES to 8 fields filled automatically from the CIQ, without criteria; the row stays, unused. Don't re-export the rows for it: `export.mjs` rebuilds the retired sync service's domain bundle, and since the domain's criteria are deleted it would write this row with no criteria and a new hash |
| `LIM:current` | Limit set | Published | The heavy-metal and MOAH limits (placeholders until Beiersdorf shares its own) |
| `REG:current` | Regression set | Published | The 8 reference materials for "Test rules" |

**Every row** has `Config_Key`, `Config_Kind`, `Version_Label`, `Config_State`, `Payload_JSON` (the content as JSON text), `Content_Hash` (its SHA-256 fingerprint), `Published_At`, `Change_Note` and `Evaluator_Version`. A Release row carries `Release_Manifest_JSON` and `Release_Bundle_JSON` instead of a payload.

**Where the content comes from:** the prototype's own domain code. So what Kissflow runs is exactly what the prototype ran: the same questions, the same rules, the same scope.

## First-time upload (a new account), over the API

Prerequisites:
- the app's flows exist in the account;
- `.env` holds an access key for that account (never print it or paste it anywhere).

From the project folder:
1. **Make the files** (only needed when the prototype's content changed):
   ```bash
   node kissflow-build/config-seed/export.mjs
   ```
   This rebuilds the domain bundle, writes `rows/` and `readable/`, and prints the 12 rows.
2. **Check what would happen** (writes nothing):
   ```bash
   node kissflow-build/config-seed/upload.mjs
   ```
   Every row reports `same`, `would create` or `DIFFERENT`.
3. **Upload:**
   ```bash
   node kissflow-build/config-seed/upload.mjs --apply
   ```
   It creates the missing rows one at a time, in the right order (rule sets and questionnaires before the release that pairs them, settings last), and reads every row back to check its fingerprint.
4. **Run step 2 again.** All 12 rows should report `same`.

**What the script never does:**
- It never changes a **Published** row. A change to a published questionnaire or rule set is always a new version with a new key (e.g. `RS:RS-2026.3`), and running cases keep the version they started with.
- It doesn't overwrite a live **Draft** row unless you add `--replace-drafts`.
- If Kissflow answers with a rate limit, it stops and writes nothing more.

## Later: through the screens

After the first upload, the Business administrator maintains the configuration in the app's configuration screens:
1. "Create new version" makes a draft;
2. they edit rules or questions;
3. "Test rules" checks the change against the 8 reference materials;
4. "Check & publish", with a change note, writes the new rows and a new Release row, and retires the old Release.

The API upload is only for the first time, for a new account, or to restore a known state.

## Cleanup

The dev sandbox also holds a test row from 8 Oct, `ZZT-1008-1843-G-CFG` (Settings, Draft). Nothing uses it; delete it in the form's list.
