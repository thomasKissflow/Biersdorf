# CIQ Digital: Beiersdorf prototype (by Kissflow)

A clickable prototype with no backend, showing **our understanding** of Beiersdorf's CIQ (Cosmetic Ingredient Questionnaire) process. It covers every role, the external supplier portal, dashboards and reports. All data is synthetic: fictional people and suppliers, real ingredient names. Nothing leaves the browser.

## Run it

```bash
cd prototype
npm install      # first time only
npm run dev      # → http://127.0.0.1:5310
```

Other commands: `npm test` (domain tests), `npm run typecheck`, `npm run build`.

- **Role switcher:** top right. Switch roles to see the app as each person.
- **Our understanding:** lists the assumptions, and has the live toggle for the disputed ending (overall Beiersdorf approval on or off).
- **Reset demo data:** bottom of the left sidebar. It restores the seed.

## Roles

| Role | Lands on | What to show |
|---|---|---|
| Raw Material Manager (RMM) | Dashboard | Needs-action list, pipeline, bottlenecks, create case, case 360, scope check and release |
| Regulatory / Safety / QM / Microbiology / Sustainability reviewer | My reviews | Review workspace, query pinned to a field, accept or return answers, RMES (Safety, Regulatory), complete review |
| Customs & Trade Compliance, Legal / IP | Informed cases | Read-only, informed (no review step defined yet) |
| Overall approver | Approvals | Only when the "overall approval" toggle is on |
| Business administrator | Rule table | Versioned rules, scope simulator, regression check, publish v2, section owners, reminders |
| Auditor | Audit trail | Search everything; reconstruct a case |
| Business owner | Reports | Lead time, supplier vs Beiersdorf time, workload, hotspots, supplier performance |
| Supplier, primary and second contact | Supplier portal | Requests, tasks, configuration questions, questionnaire, completeness, answering queries, final release |

## 10-minute demo script (call with Beiersdorf)

1. **Our understanding** (RMM, sidebar): walk the process map and flip the ending toggle. Ask: "Is this right?"
2. **RMM dashboard:** what needs action today, including the CCU ethanol case where no rules exist yet (manual scope check). Open **CIQ-2026-0150**, look at the Scope tab, then release.
3. **Supplier portal** (switch to *Supplier — primary contact*):
   - **CIQ-2026-0154:** answer the configuration questions and watch the questionnaire preview change live.
   - **CIQ-2026-0143:** fill a section; switch to *Supplier — second contact* and see who answered what.
4. **Safety reviewer:**
   - Open **CIQ-2026-0134**: MOAH above limit gives a blocking finding, and "Complete review" stays blocked with the reasons listed.
   - Ask the supplier on a field.
   - Switch to the supplier, answer, switch back, accept.
5. **Business administrator:** rule table, then the simulator ("mineral oil entered as Mineral"), then the regression check, then publish v2. Running cases keep v1.
6. **Business owner:** reports: where lead time goes, supplier vs Beiersdorf time, where queries cluster.
7. **Auditor:** reconstruct a completed case: who assessed what, on which version.

## Structure

```
src/domain/     types, catalog (sections, fields, personas), rules (+tests), actions, selectors, metrics, seed (+tests)
src/store/      React store: binds actions to the current persona, localStorage persistence
src/components/ UI kit (ui/) and status badges
src/layout/     internal console shell, supplier portal shell, role switcher, assumptions drawer
src/features/   supplier · rmm (incl. case 360) · review (incl. RMES) · admin · reports (incl. audit) · understanding
```

The seed replays the real actions with historic timestamps, so audit trails, confirmations and reports are consistent. Background analysis: `../context/INDEX.md`.
