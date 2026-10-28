# Changelog — app-agents

## 1.6.0 · 2026-08-09
Workflows that show what they do, builds that say how far along they are, and agents that remember.

- **Parallel work is drawn as parallel work.** A fork used to arrive downstream as a bare step name —
  lost in lowering — so the blueprint drew a straight line through it and the BUILT app was linear
  too. Branches now survive, render as labelled lanes wired into the flow at both ends, and every
  step inside every arm appears. A fork written into a step's title ("Review (parallel) — A + B") is
  rejected by `validate` and salvaged by the page, so apps built that way read correctly today.
- **Decision steps show what decides.** The routing expression (`ONLY WHEN Amount > 5000000`) instead
  of the same Approve/Reject pair every step in every app has. That is the part that differs between
  steps and the part that can be wrong.
- **The prototype says how far along it is** — "Building the interface — 4 of 9 pages · usually about
  6 min", counted off the parts on disk rather than narrated, plus the two milestones that exist
  before any page does.
- **A prototype is checked before you are told it is done.** Template placeholders showing as text,
  a script that cannot parse, one role's pages overwriting another's — reported at turn end in the
  chat, by the host, whether or not the builder ran its own checks.
- **Blueprints stopped printing `[object Object]`** under "Success looks like".
- **Agents record what they learn.** Ten agents could read the shared memory and not one could write
  it; the pool had been empty for months. Lessons now reach it, and agent-scoped ones become part of
  the agent's own method.
- **Builds survive a restart.** A turn is a queued job with a lease: if the process running it dies,
  another picks it up instead of the build stopping mid-sentence and waiting for someone to notice.
- **Fair share.** Three concurrent builds per person and a rate limit, counted centrally, so one
  runaway client cannot hold the whole fleet.
- **`/kf-update`, and a notice when your copy is behind.** The agents, commands and engine ship as
  one version; an old copy runs last month's rules against this month's builder and looks like the
  product being wrong.

> Note: 1.3.x–1.5.x shipped without changelog entries. This file resumes at 1.6.0 rather than
> reconstructing them from memory.

## 1.2.4 · 2026-07-17
- **Geolocation & Sequence Number fields handled** — a shared type canonicalizer normalizes ~30
  common aliases ("Sequence Number", "Auto Number", "Geo", "location", "dropdown"…) onto the
  Kissflow canon before build; genuinely unknown types get a legible validator warning instead of
  an opaque publish 500.
- **Seeding 500s tamed** — chunked list writes (50/batch with pacing), GET-only transport retries,
  and a mandatory write discipline for seed scripts (throttle, verify-by-key before any write-500
  retry, rejects captured with full response bodies).

## 1.2.2 · 2026-07-17
- **Roles are never recreated on re-apply.** Role matching is normalized (trim + case-fold), a failed
  role-list read now aborts instead of blind-creating the whole set, and a duplicate-name rejection
  recovers by re-listing and reusing. Fixes duplicated roles when regenerating a changed app.
- **Engine version stamping** — every published version records the engine that made it; appbuilder
  project cards show "⚙ v1.2.2" or an amber "old engine" warning so stale plugins are visible at a glance.

## 1.2.0 · 2026-07-16
The review a customer can sign off in, and artifacts that upload from anywhere.
- **Review page redesigned** — Lando-grounded design language (warm canvas, white hairline cards,
  royal-blue accent, Inter, translucent header/panels), zero AI-slop tells in copy or chrome, and
  Kissflow-builder-style vertical workflow diagrams with a per-process jump-nav.
- **Real screenshots in Pages & Nav** — /author-review captures every role's prototype screen
  headlessly (legacy prototypes now supported) into a full-bleed, viewport-height review canvas:
  filmstrip thumbnails, approve/request-changes, click-to-pin comments.
- **Prototype theming** — kf-ux-architect emits a research-grounded theme (accent/radius/sidebar)
  per domain; the shadcn shell lowers it mechanically. No more one-violet-fits-all.
- **publish.mjs uploads through the control plane** (cp mode, default) — no gcloud or bucket IAM
  needed in builder sessions; register-only is explicit-only and loud. Pairs with the control
  plane's new POST /projects/:id/artifacts.
- **Faster sessions** — /author-setup fast path (one probe, straight to connect), connect.mjs
  announces project switches and flags a stale runs/current.

## 1.0.0 · 2026-07-14
The milestone release: the pipeline, the console, and the memory are one system, proven in the field.
- **16-agent authoring pipeline** (BRD → live Kissflow app) with adversarial gates and per-role
  clickable prototypes; express fast-path builds a single-flow app in ~3 minutes.
- **appbuilder.zingworks.com** — projects, versions (review/prototype open from the project page),
  Google SSO, one-paste session connect, reusable dev environments (Secret Manager; edit/rotate/
  delete guarded), owner project delete, connected badge.
- **Server-backed team memory** — four layers (canonical / workspace / server-synced / hive), memory
  proxy with project-token auth, session-start sync, semantic recall, and the **suspicion check**:
  impossibility claims quarantine until owner-confirmed.
- **Fast-edit layer** (`engine/patch.mjs`) — 15 one-command graft verbs for live apps: branch ·
  condition · add-step · step-actor · step-permission · add-field (incl. Reference/Select) ·
  field-type · field-set · formula · rename · list-items (--append) · add-role · grant ·
  case-members · kanban-view.
- **First-class workflow conditions** — `steps[].condition` compiles to the verified
  Activity::Expression AST and survives rebuilds.
- Engine: 193 tests · golden exports in `golden-references/` · list options auto-published
  (the §15 "closed API" impossibility, disproven in the field) · KF_*/full-host env support ·
  `.env`/`.kf-env` autoload.

## 0.7.x · 2026-07-13 → 14
0.7.0 connect handshake + device flow · 0.7.1 identity delivery, board-connector fix ·
0.7.2 list items writable, env unification · 0.7.3 one-and-done connect (canonical cred names,
no URLs for env-less projects) · 0.7.4 first-class conditions + patch layer · 0.7.5 branch verb,
ref/select add-field · 0.7.6 patch second wave (7 more verbs).

## 0.6.0 · 2026-07-08
Interactive review page (roles dropdown, screens review), prototype pipeline, express fast-path.
