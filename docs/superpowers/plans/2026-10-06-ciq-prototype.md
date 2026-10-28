# CIQ Digital prototype: spec and implementation plan

> **For agentic workers:** built with superpowers:subagent-driven-development (parallel feature agents, then review). Steps use checkbox (`- [ ]`) syntax.

**Goal:** A clickable, backend-free prototype in Beiersdorf branding. It shows our understanding of the CIQ process for every planned role (internal console and external supplier portal), with dashboards, reports and working core flows, so we can ask Beiersdorf "is this right?".

**Architecture:**
- **Stack:** React 19 + TypeScript + Vite 5 + Tailwind 4 + Recharts, run locally (`npm run dev`, port 5310).
- **Domain layer:** a pure domain layer (`src/domain`) holds types, the CIQ catalogue, the rule engine, actions, selectors, metrics and the seed.
- **Store:** a React store (`src/store/store.tsx`) binds the actions to the current persona and persists to localStorage.
- **Screens:** feature folders (`src/features/*`) hold the screens.
- **Seed:** the seed replays real actions with historic timestamps, so every audit trail and report is consistent.

**Tech stack:** react 19.3, react-router-dom 6 (HashRouter), recharts 3, lucide-react, clsx, @fontsource IBM Plex, vitest.

**Spec (approved in chat, 2026-10-06):**
- **Roles:** 13 roles plus a second supplier contact, switched with the role switcher.
- **Ending toggle:** an assumptions toggle switches the overall-approval ending on or off.
- **Supplier portal:** basic data and configuration, derived scope, field-matrix v0.6 forms, completeness, queries, final release.
- **RMM:** dashboard, cases, create case, case 360.
- **Reviewers:** queue, workspace, queries, RMES, complete.
- **Admin:** rule table with simulator, questionnaire versions, ownership, reminders.
- **Reports, auditor, and an "Our understanding" process page.**
- **Data:** synthetic seed of 36 cases and 10 fictional suppliers.

## Global constraints
- **Styling:** use semantic colour classes only (`bg-surface`, `text-ink`, `border-line`, `bg-brand`, `text-ok` …). No hex values or raw Tailwind palette colours in components. Light and dark themes come from `src/styles.css`.
- **UI building blocks:** reuse `@/components/ui` (Button, Badge, Card, CardHeader, PageHeader, StatCard, Table/Tr/Td, Tabs, Modal, Drawer, Field, TextInput, TextArea, Select, Segmented, Toggle, ChipMulti, Checkbox, FileDrop, ProgressBar, TrafficLight, Stepper, Timeline, KeyValue, EmptyState, BarsChart, LinesChart, DonutChart, Legendary, DemoNote) and `@/components/status`.
- **Logic and data:** state changes go only through `useStore()` actions. Derived logic comes only from `@/domain/selectors` and `@/domain/metrics`; don't re-implement rules in screens.
- **No dead controls.** Anything not functional carries `<DemoNote>` with an honest label.
- **Supplier confidentiality:** supplier screens never show internal notes, RMES, findings, reviewer comments or department statuses.
- **Data:** fictional people and suppliers only. Beiersdorf branding is allowed (user request).
- **Quality gate:** `npm run typecheck`, `npm test` and `npm run build` must pass; no console errors on any route.

## Tasks
- [x] **T0 Foundation:** scaffold, tokens, domain (types, catalog, rules + 9 tests, actions, selectors, seed + 10 tests, metrics), store, UI kit, shells, router, placeholders.
- [x] **T1 Supplier portal:** `src/features/supplier/*` (SupplierHome, SupplierTasks, SupplierCase wizard, SupplierHelp).
- [x] **T2 RMM and case 360:** `src/features/rmm/*` (RmmDashboard, CaseList, NewCase, CaseDetail).
- [x] **T3 Review:** `src/features/review/*` (ReviewQueue, ReviewWorkspace with queries and RMES, InformedList, ApprovalQueue).
- [x] **T4 Admin:** `src/features/admin/*` (RuleTable + simulator, TemplateManager, OwnershipMatrix, ReminderSettings).
- [x] **T5 Reports and audit:** `src/features/reports/*` (Reports, AuditTrail).
- [x] **T6 Our understanding:** `src/features/understanding/*` (process map, assumptions, decisions to confirm).
- [x] **T7 Integration QA:** typecheck, tests and build; browser walk-through of every role and route; design review (impeccable) and fixes.
