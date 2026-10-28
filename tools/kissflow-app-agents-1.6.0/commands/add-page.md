---
description: "Generate app pages with the architect → ui → builder → qa agent pipeline, from the connected app's synced schema."
argument-hint: "[pageId | area | \"a dashboard for X\" | (blank = all pages)]"
---

`/add-page` is the **orchestrator** for a small team of agents that turn the connected
app's synced schema into world-class React pages. You (the main agent) run the pipeline;
each stage is a dedicated subagent (spawn via the Agent tool with the given `subagent_type`).

Pre-req: `/connect` + `/sync` have run, so `lib/kf-context.md`, `kf-schema.json`,
and `lib/pages/*.json` exist. If they don't, tell the user to run `/sync` first and stop.

## Memory — the pipeline evolves
- The shared memory is **`lib/kf-preferences.md`** (learned preferences + overrides).
  Every agent reads it first and applies it; design choices follow
  `agents/design-guidelines.md` (shadcn/ui + semantic tokens).
- **Capture**: whenever the user states or corrects a preference during this run (theme,
  a widget choice, layout, naming, "don't do X", "always do Y"), record it in
  `kf-preferences.md` — right section, dated, scoped `[global]` or `[page:<route>]`. Newest
  wins. Do this as it happens, not only at the end.
- **Consolidate when needed**: if the file grows redundant or contradictory, rewrite it
  tighter (merge/replace duplicates, keep `[HARD]` rules) so it stays short and authoritative.
  This is how the agents get better at matching the user's taste over time.

## Step 0 — theme (DERIVE it, never ask)
**Do not ask the user to pick a colour.** The catalog is one full design anchor, Beacon (not an
accent swap) — its own palette, font pairing, radius, shadow scale, spacing unit and type scale.
(Up to eleven anchors briefly existed and were chosen by domain via `language-catalog.mjs pick`;
all ten non-Beacon ones were retired 2026-08-12 along with that command — an old transcript showing
`pick` is history, not current usage.) Resolve the id in this order:

1. **A `[HARD]` rule in `lib/kf-preferences.md`** naming a theme — that wins, always.
2. **The run's prototype**, if this app came from one: `<runDir>/prototype/experience-spec.json`
   → `design.anchorId`. Reuse it verbatim so the live app matches the prototype the user already
   reviewed and signed off. Diverging here is the single most jarring thing this pipeline can do.
3. **Otherwise, `beacon`** — the only entry the catalog has.

Then upgrade the scaffolded app — **required before any page is generated** (pages designed
against the old token set won't use the theme's fonts/shadows/spacing). Two commands, in order:
```bash
node engine/emit-live-themes.mjs --app <appDir>
node engine/kit-install.mjs --app <appDir> --spec <runDir>/prototype/experience-spec.json
```
The first replaces the scaffold's 7 accent-only presets with the anchor catalog infrastructure
(`src/themes.js`, `agents/theming.md`, the theme-check build gate; `--default` is retired — an
app's identity has one source, the design slice). The second installs the **starter kit**
(`src/components/kit/*` + its token contract) and emits the app's identity from the design slice
in the kit's triplet form — see build-app.md 4b.ii. If the app has no run/prototype, write a
minimal design slice (`{"name": "...", "anchorId": "<picked>"}`) to a file and pass that as
`--spec`. Record the id in `ui-spec.json` (`app.theme`), then **read the regenerated
`agents/theming.md`** before designing.

Design against the semantic TOKENS and ordinary utility classes (`shadow-sm`, `p-4`, `text-xs`,
`bg-primary`) — they are all theme-aware after the upgrade. Never hardcode a colour, size, shadow,
radius or spacing, and avoid arbitrary values (`text-[15px]`, `p-[13px]`), which opt out of the theme.

## Step 1 — Architect (`subagent_type: kf-ui-architect`)
Spawn the architect to read the schema and write `lib/ui-spec.json` — the page
set, the widgets per page (bound to REAL model/field ids), and per-role access. Pass it
the chosen theme and `$ARGUMENTS` (so it can scope to one page/area or plan all pages).

## Step 2 — decide scope
- `$ARGUMENTS` names a page/area → build just that page.
- `$ARGUMENTS` is a free-form ask → architect designed a page for it; build that.
- blank → confirm with the user, then build **every** page in `ui-spec.json`.

## Step 3 — UI → Builder (fan out per page)
For each page in scope, run the two stages in order:
1. `subagent_type: kf-ui-designer` — enrich that page's layout/variants/theme in `ui-spec.json`.
2. `subagent_type: kf-ui-builder` — generate `src/pages/<route>.jsx` + the nav entry.

Pages are independent — spawn the per-page (ui→builder) chains **in parallel** (one Agent
call per page in a single message) so they build concurrently.

## Step 4 — QA (`subagent_type: kf-ui-qa`)
After the builders finish, spawn QA once to validate everything: build passes, only real
ids used, no hardcoded data, role-gating + actions wired, full spec coverage. If QA returns
❌ items, dispatch a `kf-ui-builder` back over just the failing pages with QA's fix list, then
re-run QA. Loop until green (cap ~2 rounds), then report.

## Finish
Summarize: pages generated (with routes), key design choices, and the QA result. Tell the
user to `/run` to preview and `/deploy` when ready. Keep every value SDK-derived and every
action wired (`openForm` / a create form) so it works once deployed in Kissflow.
