# Beiersdorf CIQ MVP (Kissflow-internal)

This is Kissflow's MVP for Beiersdorf's (BDF) CIQ digitalisation. CIQ is the Cosmetic Ingredient Questionnaire that BDF uses to qualify suppliers' raw materials. The MVP competes in a bake-off against one other vendor, and BDF tests both MVPs after the build. Everything in this folder is Kissflow-internal.

## Where things are

- **Knowledge base:** start at `context/INDEX.md`. Terms are in `context/00-glossary.md`.
- **Requirements:**
  - The v2 matrix, `context/sources/02b-…`, supersedes v1.
  - Field-level matrix: `context/sources/05-…`.
  - Requirements PDF: `context/sources/01-…`.
- **Kissflow design:**
  - `docs/kissflow-data-model/plan-v3-supplier-portal-one-role.md` (current: roles, portal, app changes, integrations).
  - `docs/kissflow-data-model/kissflow-data-model-plan.md` (fields, configuration, RMES; §0 = BRM v2).
  - As-built portal: `kissflow-build/ciq-supplier-portal/BUILD-LOG.md`.
- **Clickable prototype of our understanding:** `prototype/`. Run it with `npm run dev`; it serves on port 5310.
- **Builds:** all in the Development sandbox `https://dev-beiersdorf.kissflow.eu` ("Beiersdorf kf-dev", account `AcDOSunMEpSA`). Never touch the parent production account `beiersdorf.kissflow.eu`. Build files for each container live in its own folder:

  | Folder | Container | App ID |
  |---|---|---|
  | `kissflow-build/ciq-digital/` | Internal app | `CIQ_Digital_A00` |
  | `kissflow-build/ciq-supplier-portal/` | Supplier portal | `CIQ_Supplier_Portal_A00` |

  The portal builds like an app. Thomas handles its user management.
- **Portal rule (Thomas, 7 Oct; plan v3):**
  - The portal has **one role, `Supplier`**, for external users only. Beiersdorf staff are app users only.
  - Portal processes have supplier steps only; every Beiersdorf decision is an app step.
  - Every portal item has an app twin.
  - Design: `docs/kissflow-data-model/plan-v3-supplier-portal-one-role.md`.
- **REST tooling:**
  - Engine: the old `app-agents` 1.6.0 plugin, kept at `tools/kissflow-app-agents-1.6.0/` (`engine/cli.mjs`, `engine/patch.mjs`).
  - Client: `kissflow-build/lib/kf.mjs` (read-only unless asked).
  - Credentials: `.env` (gitignored, chmod 600).

## Rules

- **Who builds what** (Thomas, 2026-10-20; replaces the 7 Oct split). Everything is written over REST with the old engine and `kissflow-build/lib/meta.mjs`. App Builder 1.0.0 is no longer used to write the app.

  | Container | Who builds it | How |
  |---|---|---|
  | Supplier portal `CIQ_Supplier_Portal_A00` | The portal session ("App Builder - CIQ Supplier Portal") | Leads both containers: it owns the plan and the build order |
  | Internal app `CIQ_Digital_A00` | The portal session, plus the app session ("App Builder - CIQ Digital") for the app parts the portal session assigns to it | |
  | Cross-container integrations, the configuration seed | The portal session | |

  - **One writer per flow at a time.** The two sessions agree by message which session writes which flow, before any write.
  - **Before a graft, re-read the live draft** and keep Thomas's manual changes, especially the per-step field permissions.
  - **Pacing:** keep at least 1.2 s between calls on the shared key. On a 429 or a Cloudflare HTML challenge, both sessions stop for 20 min.

- **One design for both containers:** `docs/kissflow-data-model/kissflow-data-model-plan.md` is the contract.
  - Use its flow and field names exactly.
  - Flow names are unique across the whole account: app flows start `CIQ `, portal flows start `CIQP `.
  - Change a shared name or field in the plan first, then tell the other session.
- **App Builder history:** the app was generated with App Builder 1.0.0 on 8 Oct. That plugin can't edit an app after generating, so every later app change goes through REST/patch verbs, coordinated between the two sessions.
- **Don't run `/app-agents:connect`.** It rewrites `.env`.
- **Credentials:** read them only from `.env`. Never print, log or commit them, and never put them in code, bundles, docs or chat.
- **Writes:** published Kissflow flows can't be deleted.
  - Do read-only checks first.
  - Before the first write to each container, show Thomas exactly what will be created and get approval.
    - **Portal:** Thomas approved directly in the portal session on 2026-10-07 (an unattended overnight build).
    - **App:** Thomas approved on 2026-10-20 ("do the necessary changes in app as well … build according to our plan"), for the unattended overnight build of 20 Oct.
  - Verify every write by reading it back.
- **Demo and seed data:** people and suppliers stay fictional.
- **Internal files:** never cite them to Beiersdorf. That covers the Knowledge Baseline, the App Builder setup guide, `docs/` and `context/analysis/`.
- **Platform reference:** `~/Downloads/master.md`. Its §1.3 plugin section is outdated.
