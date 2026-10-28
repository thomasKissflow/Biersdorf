# CIQ Digital: build folder for the internal app (`CIQ_Digital_A00`)

Holds the build scripts, request logs (no secrets) and read-back snapshots for the internal app. The supplier portal has its own folder: `../ciq-supplier-portal/`.

**Status (7 Oct 2026):** nothing built yet.

## How we build

- **Route:** the App Builder plugin (`/app-builder:*`), from the session "App Builder - CIQ Digital".
  - Connect with `/app-builder:connect https://dev-beiersdorf.kissflow.eu` and pick CIQ Digital.
  - Give `author-brief` the data-model plan as the requirement.
  - Check `author-plan`/`author-review` against plan §3.2 before `author-generate`.
- **Portal and integrations:** the portal and the cross-container integrations (I-1, I-3, I-6) are built over REST by the portal session.
- **Changes after generating:** App Builder 1.0.0 can't edit the app afterwards. Later fixes go through REST/patch verbs, coordinated with the portal session.
- **Order:** follow §11 of the plan (`../../docs/kissflow-data-model/kissflow-data-model-plan.md`).
  - Read-only inventory first.
  - Thomas approves the exact change list before the first write.
  - Every write is read back.

## Inputs

- Design: `../../docs/kissflow-data-model/kissflow-data-model-plan.md` (§3.2 onwards).
- Requirements: `../../context/sources/02b-business-requirements-matrix-mvp-v2-changes.md` (v2 supersedes v1), plus `05` (the field-level matrix).
