---
description: EXPRESS (one-shot) — take a requirement straight to a built app in dev, running brief → plan → generate back-to-back with no review pause. Accepts a BRD file, pasted requirement text, or a one-line ask — ANY SIZE. A full multi-page BRD runs end-to-end in this one command exactly like a one-liner does; do NOT switch to, or tell the user to run, the staged flow just because the spec is big or complex — stay express. The staged commands (/author-brief … /author-generate) exist only for a user who explicitly asks for manual stage-by-stage control.
argument-hint: "\"<BRD path | pasted requirement | one-line ask>\" [--yes] [--dry-run]"
---

**Express path.** Runs the whole pipeline end-to-end in one command — no stop to review.

**EXPRESS MEANS ONE SHOT, NOT LESS APP.** What express trades away is the REVIEW PAUSE — nothing
else. Same personas, same flows, same roles, same page count, same honesty about what cannot be
built. Every page the experience stage specifies gets built; every role gets its own landing. If a
comprehensive run of the same requirement would produce ten pages, so does express — it just does
not stop to ask between them.

Scope-cutting is the failure this line exists to prevent: it is invisible in the artifact (a
five-page app looks complete if you never saw the ten-page spec), it is always defended as "being
fast", and the person reviewing it has no way to know what was dropped. If time genuinely runs
short, SAY which pages are outstanding — never quietly ship fewer. This trades
the review pause for speed. It handles **any requirement size** — a one-line ask or a full multi-page
BRD both run start-to-finish here; **never bail to the staged flow because a spec is large or complex**
(the internal pipeline still runs every stage + verifier — you just don't stop between them). Only a
**blocking ambiguity** (a genuinely missing decision that changes the build) is grounds to pause and
ask — size and complexity are not. The build is still real and (for Processes/Cases) irreversible over REST.

Pre-req: `/author-setup` has staged `engine/` + `reference/` + `MEMORY.md`.

## USER PROGRESS — narrate the build as it happens (esp. in Cowork)
The build takes minutes and the user is watching. Your text between tool calls is what they see, so
**emit a short, plain-language progress line as you enter each stage**.

**Break the cold-start silence FIRST.** The biggest *silent* wait is the warm-up — the sandbox coming
up, the engine's first `node` call, the connection check — all before any agent runs. Your VERY FIRST
output, before any slow tool call, must acknowledge it: *"⚙️ Spinning up the build engine and reading
your requirement… (a few seconds)"*. Emit it immediately so the user never stares at nothing; only
then do the setup / first engine call. (The pure sandbox spin-up before your first token is infra you
can't narrate — so make your first token land as early as possible, before slow work.) — no jargon (never say "IR",
"slice", "blob", "verify"), but DO name the agent and say what it's crafting, so the user watches a
team of specialists build their app. One line in as you start a stage; one plain line out with the
result. Keep them warm and concrete. Standard lines (adapt to the app):

- 📋 **kf-ba** is reading your requirement — who's involved, what they're trying to do, and the rules.
- 🗺️ **kf-architect** is laying out the app — what becomes a form, a process, or a board, and how they connect.
- 🧩 **kf-data-architect** is designing the fields, dropdowns and calculations *(in parallel with…)*
- 🔁 **kf-workflow-designer** is building the approval steps — who acts, and what happens on approve / reject / send-back.
- 🔐 **kf-security-designer** is setting who can see, create and act on what.
- 🔗 **kf-integration-analyst** is wiring the notifications and the hand-offs between flows.
- 🎨 **kf-experience-designer** is designing each person's dashboard, pages and navigation.
- ✨ **kf-ux-architect** is researching comparable products to make each role's experience rich.
- 🔎 **kf-verifier** is stress-testing the design — hunting for lockouts, dead-ends and gaps.
- 🧭 **kf-coherence-critic** is confirming the whole app holds together for every person and goal.
- 🚀 **kf-author** is building it live in Kissflow — creating and publishing every flow, page and role.
- ✅ **kf-acceptance** is test-driving each journey to prove it actually works.

Result lines stay concrete and non-technical, e.g. *"✓ Mapped 3 roles and one approval process."* /
*"✓ Live in Kissflow — 1 process, 3 dashboards, 2 notifications ready to turn on."* For the fast-path
(one planner), still narrate the phases: *"Assembling the structure, approval flow, permissions and
dashboards…"* then the result. End with the plain summary of what was built.

**Always end with the time taken.** The run is timeline-stamped (`engine/timeline.mjs`), so close the
report with the total wall-clock — e.g. *"⏱ Built in 1m57s."* — and, when the user wants detail, the
per-stage breakdown from `node engine/timeline.mjs report runs/current` (agent-named, one line each).
Time-to-built is the headline for demos; show it prominently.

## Accept any input shape
`$ARGUMENTS` (minus the flags) may be a **BRD file path**, **pasted requirement text**, or a
**one-line ask** (e.g. *"a purchase request app with two-level approval"*). Detect which: an existing
file path → use it; otherwise treat the text as the requirement and write it verbatim to
`runs/current/brd.md` after creating the run. A one-liner is valid — just lean harder on assumptions +
open-questions, and if a **blocking** ambiguity remains, STOP and ask before generating (step 3).

## FAST-PATH — simple apps incl. SMALL MULTI-FLOW (one pass, ~2–5 min) [default for demos & one-liners]
Use this for any requirement that is **up to ~4 flows, a handful of roles, and only light cross-flow
stitching** — this now covers the typical *"build me a **capex management** / expense / procurement
system"* one-liner, NOT just single-flow apps. Do NOT run the six-specialist chain for these. Run ONE pass:
- **One planner agent, on a fast tier (Sonnet)** — it ASSEMBLES the whole IR (domain + architecture +
  data + workflow + security + automations + pages/nav) in a SINGLE `Write` of
  `runs/current/app-spec.json`, then `gate` (deterministic structure, ~0.06s) + `verify` ONCE. Give it
  the IR SHAPE inline (the slot schema — NOT canned content) so it fills slots rather than re-deriving
  structure; forbid reading MEMORY/LESSONS/playbooks and forbid the incremental edit→verify loop. This
  is assembly, not code — the engine builds the app.
- **DOMAIN-SPECIFIC, never generic.** The IR shape is a skeleton to fill, not a template to echo. The
  planner MUST design for THIS domain from the actual jobs — real entities and fields (capex: asset
  class, cost centre, budget line, depreciation method, approval threshold, capitalised amount), the
  real roles (requester / budget owner / finance / CFO by threshold), and widgets that fit *this*
  workflow. If two apps of different domains would come out looking interchangeable, it's too generic —
  redo from the domain. Specificity comes from the model, not a canned layout.
- **One pass ≠ a skeleton.** Fast comes from *one pass + fast tier + no playbook reads*, NOT from
  stripping the app. The IR MUST carry the sophistication a real approval app has (learned on a real build):
  - **Workflow**: each decision step is `type:"approval"` (native approve→next / reject→send-back to
    the initiator with a MANDATORY comment) — never a flat linear chain. Threshold branches (e.g.
    amount > X → extra approver) are in-scope for the fast path.
  - **Automations**: notify on the key transitions (approved→notify downstream role, rejected→notify
    initiator), and the light cross-flow stitches the domain implies (e.g. capex approved → open an
    asset/tracking record), created `IsActive:false`.
  - **Pages**: each role landing gets a KPI card (count of its queue) + its worklist/approval-queue
    `list` + a `+ New` `action` for the initiator — not a bare table.
  - **Nav**: EVERY submenu MUST have BOTH `name` and `page` (`{"name":…,"page":…,"visibleTo":[…]}`).
    A submenu missing `name` silently FAILS TO BUILD — the app ships with no navigation.
- Skip `kf-coherence-critic` and `kf-acceptance` (the deterministic `gate` covers the structural
  completeness; there's no large multi-flow web to reconcile).
- Then apply to dev (§4). The build is now **fast AND self-healing** even for a one-shot multi-flow IR —
  which is what lets small multi-flow apps stay on this path: `gate` + `checkPublishInvariants` catch
  breaks BEFORE publish; **incremental re-apply** re-publishes only changed flows (a fix = seconds, not
  a full rebuild); `localize500` NAMES the culprit field on any opaque publish 500 (no hand-bisection).
  So a residual failure is a cheap named fix, not a reason to escalate to the specialist chain.
- Budget: planner ~30–60s + `gate` ~0.1s + apply ~1–2 min for 2–4 flows ≈ **~3–5 min, live in dev**
  (single-flow stays ~2 min; measured: plan ~20s + apply ~31s).
Escalate to the full staged chain below ONLY for genuinely large/complex specs — **>4 flows, heavy
cross-flow stitching, decision tables, or complex governance/permission matrices** — or if the one-pass
`gate`/`verify` can't reach 0 blockers within one retry. Size alone within these bounds is NOT grounds
to escalate.

## Do (brief → plan → generate, back-to-back on one run) — MULTI-FLOW / non-trivial specs
1. **Ingest** (= `/author-brief`) — create the run: `node engine/runs.mjs new <slug> <brd>` for a file,
   or `node engine/runs.mjs new <slug>` + write the pasted/one-line text to `runs/current/brd.md`.
   Spawn `kf-ba` (+`kf-comprehension` if large) → domain (personas, journeys, entities, rules) into
   `runs/current/app-spec.json#domain`; write `open-questions.md`. Metadata is sacrosanct — extract
   only what the requirement says or clearly implies.
2. **Plan** (= `/author-plan`) — run the specialists in dependency WAVES (not one serial chain),
   each verifier-gated: `kf-architect` → **[`kf-data-architect` ∥ `kf-workflow-designer`]** (parallel,
   slice-file merge) → `kf-security-designer` → `kf-experience-designer`; then `kf-coherence-critic`.
   The data∥workflow wave is the main express speed-up (~40% of the plan stage). Log decisions;
   `node engine/runs.mjs snapshot "v1 — express plan"`.
3. **Show, briefly** — print the plan-at-a-glance + any high-risk decisions or unresolved questions.
   If a **blocking** ambiguity remains, STOP and ask rather than guess.
4. **Generate** (= `/author-generate`) — `node engine/cli.mjs verify`, print *"⚠ No review taken —
   applying to dev directly."*, then apply to dev. Honour `--dry-run` (stop at the manifest) and
   `--yes` (skip the confirm; otherwise show a one-line build summary and confirm). Write
   `runs/current/generated/`, snapshot "generated → dev", run `kf-acceptance`.

## [HARD] rules (same as the staged flow)
- IR blackboard is the only channel between agents; the dependency order (roles → {data ∥ flow} →
  permissions → nav/pages) is never VIOLATED — but independent slices with no dependency between them
  (data ∥ flow) MAY run concurrently via the slice-file merge; verifier-gated between waves.
- Never auto-publish to **prod** — express targets **dev** only.

## Output
One consolidated report: brief → plan-at-a-glance → what was built (real Kissflow ids) → acceptance
result. Then: *"Want to change anything? The run is saved — `/author-refine \"…\"` then
`/author-generate` again, or hand it to Pipeline B. For the next big spec, use the staged commands."*
