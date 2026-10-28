# CIQ Supplier Portal: build folder for the external portal (`CIQ_Supplier_Portal_A00`)

Holds the build scripts, request logs (no secrets) and read-back snapshots for the supplier portal. The internal app has its own folder: `../ciq-digital/`.

**Status (7 Oct 2026):** nothing built yet.

## How we build

- A Kissflow portal is built like an app. The only differences are its own app ID and its own user management.
- Thomas handles the portal's user management: inviting the synthetic supplier users and giving them portal roles.
- Route, credentials and order are the same as for the app (see `../ciq-digital/README.md`).

## Inputs

- Design: `../../docs/kissflow-data-model/kissflow-data-model-plan.md`, §3.1 (the portal) and the airlock rules. Only supplier-safe data crosses into the portal.
