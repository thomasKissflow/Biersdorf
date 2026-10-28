# React prototype — migration record

**Goal:** the prototype IS the app's React build. The design agents already produce unique, per-app
layouts — so we don't add a generic renderer or a second spec; we **retarget `kf-prototype-builder`
from HTML to React on the shared kit.** Prototype and live app become the same components, the same
build, so "what you saw is what ships" is true by construction. Gated by `KF_PROTOTYPE=react|html`
(html is the untouched legacy fallback).

## The pipeline (react mode)

```
app-spec.json (IR) ─┐
                    ├─ schemaFromIr(appSpec, {seed}) ──► kf-schema (mock's data)
prototype/proto.json ┘   (nav + seed, written by the agent)
prototype/pages/*.jsx ───────────────────────────────► the agent's UNIQUE React pages (@/components/kit)
        │
        └─ proto-react stages pages + nav + kf-schema into the shared starter,
           single-file builds it (KF_PROTO_SINGLEFILE + VITE_KF_PREVIEW),
           copies dist/index.html ──► runs/<slug>/prototype/index.html   (offline mock; no live SDK)
```

The design agents write the pages (their job, unchanged — only the medium is React). The host builds.

## Pieces (all in place + validated)

| Piece | What |
|---|---|
| `agents/kf-prototype-builder.md` | react contract: write `prototype/pages/<slug>.jsx` on `@/components/kit` + one `prototype/proto.json` (`{nav, seed}`); html contract kept as the fallback |
| `chat/CONDUCTOR.md` | prototype phase branches on `KF_PROTOTYPE`: react → agent pages + `proto-react`; html → `design-language shell` + `proto-assemble` |
| `engine/proto-react.mjs` | `assemblePrototype` (dispatch seam) → `assembleReactRun` → `buildReactFromRun` (fold seed → schema-from-ir, stage agent pages, single-file build). **#7: builds in a PER-RUN workspace** (`ensureWorkspace(runDir)` → `runDir/.proto-build`, a faithful starter copy with `node_modules` symlinked; `dist`/`.proto-build` skipped), so builds no longer mutate or serialize on the one shared starter tree — no snap/restore. `KF_ENGINE_DIR` is passed so the prebuild guardrails locate the engine from outside the repo. `bundleRun` (v2 + v1) skips `.proto-build`. |
| `engine/proto-port.mjs` | **#3: one canonical React source for preview AND deploy.** `portReactRun(runDir[, idMap])` / `portReactSource(src, idMap)` rewrite each React page's gen flow-id constant (`idify(name)_A00`) to the live id from `id-map.json` `genToServer` — a compile-invariant string swap, longest-key-first — so the approved `pages/*.jsx` ARE the deploy source (no regeneration). `buildReactBrief`/`renderReactBrief` emit a per-page verification brief (field-name/reference-object parity — the one thing preview can't prove). CLI dispatches React-vs-HTML automatically; the HTML `buildBrief` path is untouched for legacy runs. |
| `starter/vite.config.js` | `kf-single-file` plugin + `inlineDynamicImports` + `__VITE_PRELOAD__` neutralize (env-gated `KF_PROTO_SINGLEFILE`) → one self-contained `index.html` |
| `packages/app-ui/src/provider.tsx` | `VITE_KF_PREVIEW` build flag → the prototype boots the offline mock in the preview pane (deploy build never sets it, so the runtime-only `?preview=1` safety is preserved) |
| `chat/app.mjs`, `chat/worker.mjs`, `v2/worker.mjs` | the three streaming loops call `assemblePrototype` (html delegates to `assembleRun` verbatim) |

**Validated end-to-end** (build mechanism): a hand-authored agent page (`pages/*.jsx` + `proto.json`)
builds into a unique single-file React prototype rendering on the kit — StatTiles, a real Table from
the mock, the starter shell + role switcher, correct app. Data is realistic when the agent's `seed`
is (a test with an empty seed shows the mock's synthesized rows).

## Retired by this work
- The generic renderer (`starter/src/proto/*`, `starter/src/pages/proto.jsx`) and the
  `experience-spec → ui-spec` adapter — the agents design the pages, so no generic mapping is needed.

## Remaining
- **One live React DEPLOY validation** — the port machinery (`proto-port`) and the id-remap are proven
  offline (unit-tested; the swap is compile-invariant and these pages already build). The one thing an
  offline preview cannot prove is live SDK data-shape parity when the ported page runs against the real
  app — field names, reference objects, Case vs Process reads. `buildReactBrief`'s field-binding table is
  the checklist for that first live deploy. Until then the CONDUCTOR keeps the `/add-page` relay available
  as the fallback for any page the port marks UNRESOLVED.
- **One live-AI-build validation** — prove the *agent* produces good `pages/*.jsx` + `proto.json`
  under the new contract (build mechanism already proven). Run under `KF_PROTOTYPE=react`.
- **Then retire the html path** (`proto-kit` HTML transcription, `design-language.mjs` shell,
  `proto-assemble`) once react is proven across builds. Keep `proto-extract.mjs` + the HTML `buildBrief`
  as the old-dialect bridge.

## Existing (HTML) prototypes
Frozen static artifacts — they keep rendering, shared links stay live; nothing retroactive.
