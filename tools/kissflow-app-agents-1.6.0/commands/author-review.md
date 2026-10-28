---
description: STAGE 3 (review) — render the current plan as an INTERACTIVE review page (data models, logic, workflows, roles, permissions, pages, decisions) + a per-role clickable PROTOTYPE of the intended UI. The team reviews and flags changes. Changes nothing.
argument-hint: "[optional focus — a flow / role / area | blank = the whole plan]"
---

**Stage 3: review.** Make the proposed design something the team can *see and judge* before anything
is built. Read-only — never edits the IR.

Pre-req: `/author-plan` produced `runs/current/app-spec.json` + `decisions.md`.

## Do
1. **Render the interactive review page:**
   `node engine/review.mjs runs/current/app-spec.json runs/current/decisions.md runs/current/open-questions.md > runs/current/review.html`
   (the third arg is optional — `open-questions.md` is auto-detected next to `decisions.md`).
   It has every entity / field / workflow / permission / page / decision as an item with a stable
   `#id` and **✓ ok / ✎ change / ? ask** + a comment; a panel tallies flags and **Copy change-list**
   exports them. The **Decisions** step has two sub-tabs: *Your decisions* — each open question as an
   answerable card (accept the proposed default / decide differently / discuss; answers export as
   `[DECIDED]` lines) — and *Decision log* — the design log as reference cards (plain-language stage
   names, one-line why, folded rationale, Q-code chips linking back to the question cards).
   **Automations** render as Kissflow-style trigger→action canvases; the **BRD** step opens with a
   masthead + colorful stat tiles and reads as a sign-off-ready document.
   Tell the user to open `runs/current/review.html` (share it with the team).
2. **Visual identity FIRST — `kf-design-director` runs on EVERY build, comprehensive included.**
   This step was mandated only on the express path (CONDUCTOR.md) for a month, and every
   comprehensive app shipped as bare Beacon — no accent, no chart ramp, default corners, two apps
   built the same week visually identical. Nothing failed, because Beacon alone looks complete;
   that IS the "old look". Before either prototype agent spawns:
   ```bash
   node engine/language-catalog.mjs design beacon --app-id <slug> --app-name "<name>" \
     --rationale "<one line: why this accent/archetype fits THIS domain>" \
     --record runs/current \
     [--archetype rail-left|rail-dark|top-bar|rail-right] [--density compact|comfortable|airy] [--hue-shift N]
   ```
   `--record` appends the layout + palette choice to `decisions.md` as the next `D<n>` — the nav
   position is a design decision the customer signs off on, not a CLI flag; `design-verify` fails
   a run whose decision log has no design entry.
   `--rationale` is REQUIRED — the command refuses to print without it, and `design-verify.mjs`
   rejects a placeholder-length one. Ground it in the domain from `/author-brief`, and never repeat
   an (hueShift, archetype) pair from a recent run. The printed `design` slice (palette, type,
   shape, density, shell) goes into `experience-spec.json` VERBATIM — `kf-ux-architect` designs
   structure on top of it and must not fight it, and `theme-from-design.mjs` later emits the app's
   identity CSS from it. No `design` slice in the spec = `scripts/theme-check.mjs` fails the build.
3. **Build the per-role PROTOTYPE (two agents, see `reference/EXPERIENCE-SPEC.md`):**
   - **`kf-ux-architect`** — designs the richest appropriate experience per role (nav + a curated set
     of rich widgets from their *jobs*, not a template) → enriched `experience-spec.json`.
   - **`kf-prototype-builder`** — generates the self-contained, **seed-data-driven** clickable prototype
     from that spec (stat cards w/ sparklines, charts, approval queues, kanban, timelines, progress
     lists, create-form popups) → `runs/current/prototype/index.html`.
   This shows the *intended UX* per role, is Kissflow-agnostic, and translates to the live Kissflow UI
   (Pipeline B) via the shared Experience Spec. Tell the user how to open it.
4. **Embed the REAL screens in the review** (local/dev; skip silently in a headless sandbox):
   `node engine/capture-screens.mjs runs/current/prototype/index.html` then re-run the review render
   from step 1. With captures present, the Pages & Nav step becomes a filmstrip of actual per-role
   screenshots (approve / request-changes / comment pins) instead of wireframe mocks.
5. **Snapshot + PUBLISH to appbuilder** — `node engine/runs.mjs snapshot "review"`, then
   `node engine/publish.mjs runs/current --label "review"`. Publish pushes the review page + prototype to
   the project and returns a **hosted appbuilder link the team opens directly** — no local server, no
   file-passing. If the project isn't linked yet, publish SELF-CONNECTS (one-time browser approval —
   surface the link, they approve once, it pushes and won't ask again). Prefer the hosted links over the
   local file paths when you report back.
6. **Narrate the highlights** in chat: what will be built, the key decisions (choice · why · rejected
   alternative), and the **risks/gaps** worth scrutinising (thin entities, single-step processes,
   unresolved open questions, dashboards with weak data).

## Output
Point to `review.html` + the prototype, summarise the highlights + a short "decisions I'd double-check"
list. Next: *"Flag items in the page, Copy the change-list, and run `/author-refine \"<paste it>\"` —
repeat until it's right, then `/author-preview`."*
