---
description: From a BRD/idea, author a whole Kissflow app (data models + roles + workflows) AND build its UI — native Kissflow pages OR a custom shadcn React UI. The end-to-end express.
argument-hint: "\"<BRD or idea>\" [--ui native|custom] [--dry-run]"
---

`/build-app` is the **end-to-end** command: it authors a real Kissflow app from your
requirement, generates it, then builds its UI. It unifies the two halves of this plugin —
Dinesh's **authoring** pipeline (data models, roles, workflows) and our **custom-UI** pipeline
(a shadcn React app deployed as the app's `Application` component). The user picks the UI mode.

Pre-req: creds exported — `KISSFLOW_SUBDOMAIN`, `KISSFLOW_ACCOUNT_ID`, `KISSFLOW_API_KEY`,
`KISSFLOW_API_SECRET` (Step 0 stages the engine itself). Also set the **`KISSFLOW_PROD_*`** creds so
the app shell is created in prod and replicated to dev (see `/author-setup`); without them the app is
created directly in the current account. If creds are missing, tell the user to run `/author-setup` and stop.

## Step 0 — Set up the workspace + pick the UI mode (FIRST, before any build work)

**a. Establish the project directory — NEVER build in a temp/scratch CWD.** Decide where the app
lives before anything else:

- If the user named a folder, use it.
- **In Cowork the CWD is a sandbox `…/mnt/outputs`** — the user's selected folder is a _sibling_
  mount. Find it: `ls -d /sessions/*/mnt/*/ 2>/dev/null | grep -v '/outputs/'`. Use the single match;
  if several (or none), **ask the user which folder to build in**. (Locally: use the given directory,
  or ask.) Then create + enter a workspace there and stage the engine (writable — the cache is
  read-only, so `chmod` or the engine can't write `runs/`):

```bash
WORKDIR="<chosen-folder>/<app-slug>"          # e.g. .../new-app-examples/v6/hrms
mkdir -p "$WORKDIR" && cd "$WORKDIR"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/kissflow/app-agents/*/ 2>/dev/null | sort -V | tail -1)}"
cp -R "$PLUGIN_ROOT/engine" "$PLUGIN_ROOT/reference" "$PLUGIN_ROOT/MEMORY.md" . && chmod -R u+w engine reference MEMORY.md
```

**Everything below runs inside `$WORKDIR`** (author IR, scaffold, generate, deploy) so the app lands
in the user's folder, not a temp dir. Do NOT `cd` to `/tmp` when a mounted folder rejects an op — if a
_delete-heavy_ build step (e.g. `vite build` clearing `dist/`) is blocked, spill only that step's
output to a scratch `--outDir` and keep the source here.

**b. Pick the UI mode UPFRONT** (AskUserQuestion, unless `--ui` was passed): **Native Kissflow pages**
or **Custom React UI (shadcn)**. This decides Step 2's `--no-pages` and which 3a/3b path runs —
**decide NOW** so you never build native pages and then pivot to custom mid-run (a ~25-min waste).

## Step 1 — Author the app (the data layer)

**If the BRD is a PDF, extract its text FIRST** — the Read tool can fail on subsetted-font PDFs
(returns glyph garbage). Get plain text before ingesting: `pdftotext <file> -` (poppler), or
`python3 -c "import pypdf,sys;print('\n'.join(p.extract_text() for p in pypdf.PdfReader(sys.argv[1]).pages))" <file>`
(`pip install pypdf` if missing). Feed the extracted text to the authoring chain.

Run the authoring chain (same as `/author-plan` / `/author-app`), each step `kf-verifier`-gated,
writing the IR blackboard `runs/current/app-spec.json`:
`kf-ba` → `kf-architect` → `kf-data-architect` → `kf-workflow-designer` →
`kf-security-designer` → `kf-coherence-critic`.
(Large BRD → run the staged `/author-brief` + `/author-plan` + `/author-review` loop first, then
resume here at Step 2.)

## Step 2 — Generate (create it in Kissflow)

Apply the IR to the dev account, per the **UI mode chosen in Step 0**:

- **Custom UI** → skip native pages: `node engine/cli.mjs apply runs/current/app-spec.json --no-pages`
- **Native UI** → full apply: `node engine/cli.mjs apply runs/current/app-spec.json`
- `--dry-run` → `build --out runs/current/preview` (nothing applied; show the plan).

`apply` is **resumable** — it checkpoints to `runs/current/apply-state.json` and skips already-done
work on re-run. In an env that caps bash calls (Cowork ~44s) a full apply won't finish in one call:
**run it in the background**, or just **re-run `apply`** — it continues from the checkpoint (no
re-publishing) — until it reports 0 errors. Delete `apply-state.json` to force a clean re-apply.

`apply` auto-handles **account name collisions** (a flow/list name already taken in the dev account) —
it reuses the existing flow or creates an app-prefixed copy; **don't stop to manually rename + re-plan**.

Capture the **created app id** from the apply output (read-after-write via `explore`).

## Step 3 — Build the UI (per the mode chosen in Step 0)

### 3a — NATIVE path (Dinesh's, already built)

`apply` (without `--no-pages`) already created baseline pages + nav. To design richer native
pages, run `kf-experience-designer` → `node engine/cli.mjs apply … ` (see `/author-page`), then
set the app `DefaultPage`. Done — the app opens on native Kissflow pages.

### 3b — CUSTOM path (our shadcn React UI)

1. **Design** the experience: spawn `kf-ux-architect` → writes the Kissflow-agnostic
   `runs/current/experience-spec.json` (semantic binds by meaning — see `reference/EXPERIENCE-SPEC.md`).
   (Optional: `kf-prototype-builder` renders the clickable prototype for review first.)

   **Give that spec a `design` slice with the accent decided** — this is REQUIRED, not advisory.
   `kf-ux-architect` owns structure, not identity, so you MUST spawn `kf-design-director`; without
   it the slice is missing, `src/app-identity.css` is never written, and the app ships wearing bare
   Beacon — indistinguishable from every other app on it. `scripts/theme-check.mjs`
   fails the build in that state, so this is enforced rather than remembered:
   ```bash
   node engine/language-catalog.mjs design beacon --app-id <slug> --app-name "<name>" \
     --rationale "<one line: why this accent fits THIS domain>"
   ```
   `--rationale` is required — the command refuses to print a slice without it (2026-08-13).
   The accent is the app's own (primary, chart ramp, corner — ~15 tokens); Beacon is the GROUND and
   GRAMMAR (canvas, tone map, elevation, type pairing, control geometry — ~130 of ~150). Beacon is the
   only design language now (`node engine/language-catalog.mjs list`, or open
   `engine/proto-kit/gallery.html` to see the kit rendered under it).

   **RETIREMENT NOTE (2026-08-12).** This command used to take `pick "<words>"` first, then `--domain`
   and `--language` on `design`, to choose among up to eleven languages by what the app's work was.
   All ten non-Beacon languages were retired the same day; `pick`, `--domain` and `--language` are
   gone from the CLI along with them (an old transcript showing them is history, not current usage).
   `design-language.mjs shell` still prints `language=<id>(<source>)`, now always `beacon(explicit)`
   or `beacon(default)` — never a warning, since there's nothing left to default away from.
2. **Sync** the created app's real schema: run `kf:sync` (needs the app id + creds) →
   `lib/kf-schema.json` (real model/field/role ids).
3. **Resolve** semantic binds → real ids:
   `node engine/cli.mjs resolve-experience runs/current/experience-spec.json lib/kf-schema.json --out lib/ui-spec.json`
   (drops any widget whose entity/field doesn't resolve — never fabricates; review the warnings).
4. **Scaffold** the React project (if not already) — created **inside `$WORKDIR`** (Step 0), so it
   lands in the user's folder: `npx -y @kissflow/create-app --target app --name <app-slug>
--yes`; set its `.env` `KF_APP_ID` to the created app id. `npm install` is large — in a
   call-capped env run it in the **background** or expect to resume; **if a later build errors with
   missing module files** (a transient partial install — e.g. lucide icons), reinstall that dep and
   rebuild, don't rewrite code.
4b. **Theme the app — BEFORE any page is generated.** Two commands, in this order. **Order matters**
   — pages generated first would be designed against the scaffold's accent-only token set and never
   use the theme's fonts, shadows or spacing.

   **i. Infrastructure.** `create-app` ships 7 accent-only presets (they override `primary` +
   `chart-1..5` and nothing else). Replace them with the anchor catalog (Beacon — the one design
   language since 2026-08-12), the `@theme inline`
   bridge that makes ordinary Tailwind utilities theme-aware, `agents/theming.md`, and the build
   gate:
   ```bash
   node engine/emit-live-themes.mjs --app <appDir>
   ```
   This **sets no default and no `<html data-theme>`** — see ii for why. It also installs
   `scripts/theme-check.mjs` and a `prebuild` hook into the app.

   **ii. The starter kit + identity — the app's components AND its actual look.**
   ```bash
   node engine/kit-install.mjs --app <appDir> \
     --spec <runDir>/prototype/experience-spec.json
   ```
   One command, idempotent. It installs the starter kit (`src/components/kit/` — StatTile,
   Card, charts, Table, StatusChip, ApprovalRow, Modal, PageHeader…), its full token contract
   (`src/shadcn.css` + `src/tokens.css` — the triplet `hsl(var(--token))` bridge and every kit
   `@utility`), the `@kissflow/app-ui`→`app-core` shim + vite alias, `src/kit-compat.css` for
   the scaffold shell, rewires `src/main.jsx` (shadcn.css replaces the themes.css import;
   identity + kit-compat last), emits `src/app-identity.css` in **triplet form**, and stamps
   `<html data-theme>`. Pages then import display components from `@/components/kit/*` — see
   kf-ui-builder.md's composition table.

   ⚠️ Do NOT run `theme-from-design.mjs --out` on a kit-installed app: its CLI emits WHOLE
   colours for the scaffold's raw `var()` bridge, which the kit's `hsl(var())` bridge cannot
   read — the exact contract clash kit-install exists to manage. Re-run kit-install instead.

   `theme-from-design.mjs` remains the identity engine underneath — kit-install calls its
   `identityTokens()` and `setLanguageAttribute()`. `<html data-theme="…">` is stamped `"beacon"`
   for parity/history; it no longer SELECTS anything — Beacon is the contract's bare `:root` and
   its ~130 tokens in `src/tokens.css` apply regardless of the attribute (the other ten languages,
   whose `[data-theme="…"]` blocks the attribute used to activate, were retired 2026-08-12).

   ⚠️ **An app's identity has ONE source: the design slice its prototype was rendered with.**
   `--default`/`--for` on `emit-live-themes` are **retired** and now exit with an error. They used to
   stamp a catalog anchor, which is not the app's design — it drops whatever the design-director
   varied for this app (hue shift, density, shell archetype), so the live app could still differ from
   the reviewed prototype. That divergence is what once shipped a blue prototype beside a
   monochrome live app. `npm run build` now fails unless `src/app-identity.css` was generated
   (`scripts/theme-check.mjs`); a stamped anchor no longer satisfies it. That gate also reads
   `<html data-theme>` in its NEW meaning — a design language, which is required — rather than the
   old one, a stamped anchor preset, which is still a failure.
5. **Generate pages** from `lib/ui-spec.json`: `kf-ui-designer` → `kf-ui-builder` → `kf-ui-qa`
   (per-page, fanned out; QA fix-loop) → shadcn pages in `src/pages/` + nav in `app-shell.jsx`.
   The agents read the regenerated `agents/theming.md`: ordinary utility classes (`shadow-sm`, `p-4`,
   `text-xs`, `bg-primary`) are theme-aware, so no colour/size/shadow is ever hardcoded.
6. **Go live on the LOCAL dev server + build the shippable zip.** This is the default finish —
   enable Custom UI against the running dev server so the user sees the app immediately, and leave
   the production zip for a manual upload:
   a. **Start the dev server** in the **background** (the Custom UI iframe loads it):
   `npm run dev` → HTTPS on `https://localhost:3000` (see `/run`). Give it a moment to boot.
   b. **Enable Custom UI + point it at the dev server + open the app:**
   `node engine/cli.mjs deploy-ui --app <appId> --url https://localhost:3000 --open`
   — creates/updates the `Category:"Application"` custom component, publishes it Live, sets
   `_is_custom_ui_enabled: true`, and **opens the app in the default browser**. The app now
   renders straight from the running dev server (edit a page → hot-reload in Kissflow).
   c. **Build the shippable bundle:** `npm run zip` → `<project>.zip`
   (`manifest Category:"Application"`). **Leave it for the user to upload MANUALLY** — programmatic
   zip upload isn't wired. To ship a self-contained build later, they upload the zip in
   App Builder → Settings → Custom UI (Zip); until then the app runs off the dev-server URL.
   ⚠️ The dev URL is `https://localhost` — the browser must trust the scaffold's local cert
   (`cert/localhost.*`); accept it once if prompted, or the iframe stays blank.

## Finish

Summarize: the app + data models + roles + workflows created (with the app id); the UI mode; and
for custom, that **Custom UI is enabled + pointed at the local dev server** and the app was
**opened in the browser** (keep `npm run dev` running to see it), plus `<project>.zip` is ready for
a **manual** production upload (Settings → Custom UI → Zip). Record any preference the user
corrected in `lib/kf-preferences.md` so the next run matches their taste.
