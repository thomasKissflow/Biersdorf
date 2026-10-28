---
description: One-time setup — materialize the kf-author engine, reference playbooks, and seed memory into your working directory, and connect to your appbuilder project (browser handshake; or pass a connect URL).
argument-hint: "[optional connect-url] (run once in a fresh working folder — no URL needed, the browser flow handles it)"
---

Run this **once** in the folder you want to author from. The plugin ships the engine, the reference
playbooks, and the seed memory inside the installed plugin (`$CLAUDE_PLUGIN_ROOT`); this materializes
them into your workspace so the `node engine/cli.mjs …` commands resolve and the agents can read the
playbooks + evolve `MEMORY.md (canonical — replaced on plugin update) and create an empty MEMORY-LOCAL.md (instance learning; agents write here)` locally.

**Break the silence FIRST.** Setup + the first engine call are the coldest, most silent wait a user
feels (esp. in Cowork). Your VERY FIRST output — before the copy, the smoke test, or any `node` call —
must be a warm line so the user isn't staring at nothing: *"⚙️ Warming up — staging the build engine
and checking your Kissflow connection (one-time, a few seconds)…"*. Then narrate each step as it
finishes: *"✓ Engine ready."* · *"✓ Connected to <subdomain> (dev)."* Never run the slow steps before
emitting that first line.

## 0. FAST PATH — re-runs and project switches (ZERO exploration)
Setup is **idempotent** and re-running it to SWITCH projects is normal. Decide everything with ONE
cheap probe (it never errors):
```bash
ls -d engine/cli.mjs .kf-env 2>/dev/null || true
```
- `engine/cli.mjs` present → **skip step 1 entirely** (do not re-copy, do not smoke-test again).
- `$ARGUMENTS` has a connect URL → run `node engine/connect.mjs "<url>"` **immediately**. It
  overwrites `.kf-env` in place — an env pointing at a DIFFERENT project is not a conflict to
  investigate, it's exactly what connect replaces. No URL → `node engine/connect.mjs --auto`.

**Do NOT explore.** Never `cat`/read `connect.mjs`, run it with `--help`, or inspect its structure —
the two invocations above are its entire CLI surface and this file documents everything it does. The
whole fast path is two commands (probe + connect) and should take seconds; anything beyond that is
wasted user-visible time.

## 1. Materialize the engine + playbooks + seed memory
```bash
cp -R "$CLAUDE_PLUGIN_ROOT/engine" "$CLAUDE_PLUGIN_ROOT/reference" "$CLAUDE_PLUGIN_ROOT/MEMORY.md" .
```
You now have `./engine` (the deterministic IR→metadata builder + validators + tests), `./reference`
(the playbooks the agents read first), and `./MEMORY.md` (the auto-evolving agent memory — yours to
grow). `lib/app-spec.json` (the IR blackboard) is created on first author.

## 1b. Connect to your project — THE standard flow (automatic browser handshake)
The appbuilder control plane (**aibuilder.kissflow.com**) acts as the OAuth-style provider. The
user does NOT need to prepare anything — setup sends them there and brings them back:

**Run this AUTOMATICALLY right after the engine copy — no arguments needed:**
```bash
node engine/connect.mjs --auto        # add --base <url> for a non-default control plane
source .kf-env
```
What happens: `connect.mjs` parks a connect request and prints/opens a **verify link**. In the
browser the user signs in (Google SSO), **picks an existing project or creates one on the spot**,
supplies the **dev environment creds inline if the project doesn't have them yet** (stored
server-side in Secret Manager), and clicks approve — then they're **redirected straight back** (a
loopback redirect when running locally; in Cowork/headless the poll picks it up the moment they
approve). Setup should surface the verify link prominently and keep waiting — the CLI polls for up
to 15 minutes.

If `$ARGUMENTS` contains a pre-minted connect URL (`…/c/<token>`) instead, redeem it directly:
`node engine/connect.mjs "<connect-url>"`.

Connect also **syncs the newest memory from the server**: `MEMORY-REMOTE.md` lands next to
`MEMORY.md` with the current global canon + this project's app/agent learnings (agents read all
three: MEMORY.md, MEMORY-LOCAL.md, MEMORY-REMOTE.md). Write new lessons to the hive with
`node engine/memory.mjs remember "<lesson>" --app <appId>`; recall is proxy-first automatically.

**THE PROJECT NAME IS THE WORKING CONTEXT.** `.kf-env` carries `KF_PROJECT_NAME` (e.g. "PR App").
From the moment you're connected: greet with it ("Connected to **PR App** — what should it do?"),
interpret every subsequent ask in its context, default the app name to it when the user doesn't name
one, and PREFIX your clarifying questions with it ("For **PR App** — should approval be
single-level or two-level?"). Never ask the user what project/app this is about — you already know.

Either way `.kf-env` lands with everything scoped to that project:
- **Kissflow dev creds** (`KISSFLOW_SUBDOMAIN`/`ACCOUNT_ID`/`API_KEY`/`API_SECRET`, pinned to dev)
- **who connected** — `KF_USER_ID` + `KF_USER_EMAIL` (attribute versions/memory writes to this user)
- `KF_MEM_STORE`/`KF_MEM_ORG` (this project's shared-memory partition)
- `KF_GCS_*` + `CONTROL_PLANE_URL`/`KF_API_TOKEN` (so `/author-generate` registers versions back to
  the project's Versions list in appbuilder)

Links are **single-use** (a redeemed/expired one renders an "expired" page and polling stops with a
clear error) — just re-run the command for a fresh one. Only fall back to step 3 (manual creds) when
authoring locally without the appbuilder app.

## 2. Prerequisites
- **Node 18+** (`node --version`) — the engine is zero-dependency ESM. Smoke test:
  `node engine/test/run.mjs` → should print the golden + builder tests green.
- **python3** (`python3 --version`) — needed **only** for the native page transform (`/author-page`).
  Kissflow's real page transformer is **bundled** in the plugin (`engine/vendor/page_builder`, stdlib
  only) — **no `kissflow-xg` checkout needed**. Set `KF_METADATA_PATH=/path/to/kissflow-xg/metadata`
  only to override the bundled copy with a live one. Data models, workflows, roles, and permissions
  author fine **without** python3 — only native pages need it.

## 3. Credentials — FALLBACK only (local authoring without the appbuilder app)
Authoring talks to the Kissflow REST API with an account admin access key. Export, don't hardcode:
```bash
export KISSFLOW_SUBDOMAIN=<your-subdomain>      # e.g. dev-mycompany
export KISSFLOW_ACCOUNT_ID=<your-account-id>
export KISSFLOW_API_KEY=<access-key-id>
export KISSFLOW_API_SECRET=<access-key-secret>
```
### Prod-first app creation (optional) — set `KISSFLOW_PROD_*` / `KF_PROD_*`
Kissflow's real lifecycle creates an app in **production** and auto-replicates it to dev (same app
id). The engine mirrors this when prod creds are present: it creates the **app shell** against prod,
polls dev until the app replicates, then builds every flow/page/role/permission in **dev**:
```bash
export KISSFLOW_PROD_SUBDOMAIN=<prod-subdomain>   # or KISSFLOW_PROD_DOMAIN=<full host>
export KISSFLOW_PROD_ACCOUNT_ID=<prod-account-id>
export KISSFLOW_PROD_API_KEY=<prod-access-key-id>
export KISSFLOW_PROD_API_SECRET=<prod-access-key-secret>
```
(`KF_PROD_*` aliases work too.) **Without prod creds** the engine falls back to single-account mode
(creates the app directly in the configured account) with a warning — fine for QA hosts.

Always **dry-run** first and target a **dev** app; the pipeline never auto-publishes to prod.

## 4. Go
- `/author-understand` — import + map an existing app (reconciler baseline), or
- `/author-app "<your BRD / app description>"` — author a full app top-down (the orchestrator).
