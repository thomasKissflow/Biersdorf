# CIQ configuration guide (rules, questionnaire, settings)

**Kissflow-internal.** This guide explains how CIQ Digital gets its configuration and what has to be in Kissflow before a case can start. It also covers how to push the first version, and later ones. *As of 26 Oct, app `ciq-app-ui-780f6539bc` (dev), with the live configuration editor.*

## 1. Where the configuration lives

Everything sits in one app form: **CIQ Config Version** (`CIQ_Config_Version_A00`), one row per piece. A row is found by its **Config Key**. The prod seed holds 12 rows:

| Config Key | Kind | State | What the app does with it |
|---|---|---|---|
| `RS:RS-2026.1` | Rule set | Published | The rules of version 1 (Payload JSON). Checked against the release (fingerprint). |
| `TPL:CIQ-2026 v1` | Template | Published | The questionnaire of version 1 (sections, questions). Checked against the release. |
| `REL:RS-2026.1 + v1` | Release | **Published** | **The pair a case starts on.** Its Release Bundle JSON is the rule set and questionnaire together, copied into every new case. |
| `RS:RS-2026.2`, `TPL:CIQ-2026 v2`, `REL:RS-2026.2 + v2` | Rule set, Template, Release | Draft | A prepared version 2, shown as the draft. No case can start on a draft. |
| `OWN:current` | Section ownership | Published | Which department leads and co-owns each questionnaire section. |
| `REM:current` | Reminders | Published | The reminder and escalation days. |
| `SET:current` | Settings | Published | Undefined origins, default reviewers, the basis labels, the hand-off webhook tokens (`webhooks`) and the mail hook (`mailHook`). The hand-offs and the screens' mails depend on it. |
| `RMES:current` | RMES criteria | Published | **Obsolete since 28 Oct.** BDF's e-mail scoped the RMES to 8 fields filled automatically from the CIQ (no criteria), so nothing reads these placeholder criteria. The row stays in the configuration, unused; don't edit or delete it for the tests. |
| `LIM:current`, `REG:current` | Limit set, Regression set | Published | Stored for completeness and the sync service. The screens don't read them in this version (K2.2's heavy-metal limits are built into the questionnaire). |

**Why New case says "Questionnaire RS-2026.1 + v1 has no published version":**
- The screens show version 1's rules and questionnaire even on an empty form, because version 1 is also built into the app's code.
- Starting a case needs the **Published release row** `REL:RS-2026.1 + v1`, which the case copies and pins. On an empty form that row is missing, so New case refuses.
- Fix: push the 12 rows (§3).

## 2. How a case uses the configuration

- **New case** picks the Published release of the chosen pair. It copies the release bundle into the case: `Config_Bundle_JSON` with its `Config_Bundle_Hash`, and the case's `Rule_Set_Version` and `Template_Version`.
- **The case keeps its copy for its whole life.** A later configuration change never changes a running case.
- **The portal** shows the supplier the questionnaire from the copy on the request, after checking its hash.

**Fingerprints.** Every row carries a `Content_Hash`: SHA-256 of the canonical JSON of its Payload JSON, or of the Release Bundle JSON for a release. A release also carries `Manifest_Hash` and a manifest that names its rule set and questionnaire rows and their hashes.
- On a mismatch the app warns ("…does not match its fingerprint"); it never blocks.
- **Edit a row's JSON by hand only together with its hash.** The console's import and the Postman collection store the rows byte for byte, so the seed's hashes stay valid.
- The app also checks that the stored version 1 equals the version 1 built into its code.

## 3. Pushing the first version into prod

The rows come from the seed. Pick one way and do it once:
- **Postman** (works today): `kissflow-build/prod-seed-postman/CIQ-prod-seed-config-version.postman_collection.json`. See its README. It runs with your own prod access key.
- **The app's Admin / Developer console** (from app `ciq-app-ui-071d9735d2`): Data console → Import, form CIQ Config Version, with the seed `.xlsx` or `.json`.

Both work the same way:
1. Create every row (a draft), then submit it.
2. Read it back in full and compare each long field by SHA-256 with the file.
3. Skip a Config Key that already exists, so a second run doesn't duplicate anything.

**Then check:**
- 12 rows;
- `REL:RS-2026.1 + v1` is Published;
- New case starts.

**Don't change these on the way:**
- **SET:current:** keep it exactly as in the seed. The screens build the prod webhook URLs at runtime from the prod domain, the prod account and the tokens in this row; the tokens are the same in dev and prod.
- **The `Published At` dates:** keep them as in the seed (21 Sep 2026). The release order relies on them.

## 4. Later versions

A new version is a new rule set, questionnaire and release, as new rows, never edits of published ones:
1. Add `RS:<new>` and `TPL:<new>` with their Payload JSON and Content Hash, plus `REL:<rule set> + <questionnaire>` with the bundle, manifest and hashes, all as **Draft**.
2. Test it. The draft appears as the draft version; no case can start on it.
3. Publish: set the three rows to **Published** and fill `Published At`. From then on New case offers the new pair. Running cases stay on the pair they started on.
4. Retire an old pair by setting its release to **Retired**. It keeps its `Published At`, so the cases pinned to it still read it.

**In the screens (app `ciq-app-ui-780f6539bc` and later).** The Business administrator does this in Rules / Questionnaire, with "Create new version", the edits, "Check & publish", then "Publish …". The app writes the rows itself:
- **Create:** the three Draft rows.
- **Each edit:** only the draft rows that changed, with new hashes.
- **Publish:** rule set, then questionnaire, then the **release last**, all set to Published. A stop halfway says what to retry, and new cases keep the old pair until the release is published.
- **Discard:** the draft rows become Retired, without Published At. Rows are never deleted.
- **A history row** (Configuration) for create, discard, publish, owners and reminders. Small draft edits write none; the publish row lists them.
- **The role needs** create and edit on CIQ Config Version. Otherwise the screen says "Not saved: Kissflow refused to save the configuration for your role…".
- **Not yet proven live:** the role's rights, a Retired row keeping a blank Published At, and the Published By write.

**Singletons (`OWN:current`, `REM:current`, `SET:current`).** There is one row each, picked by its key, and you change it in place. Its Content Hash must change with it, or the app warns.
