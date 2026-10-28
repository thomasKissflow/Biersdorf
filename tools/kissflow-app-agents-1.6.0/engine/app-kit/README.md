# app-kit — the starter kit, packaged for generated apps

This directory is the payload `engine/kit-install.mjs` copies into a `@kissflow/create-app`
scaffold so generated custom UIs render on the starter kit's components instead of composing
inline from shadcn primitives. First proven on Monitor Ops (runs/create-a-simple-monitor-
management-syste, 2026-08-11); the generator flow in commands/build-app.md installs it for
every new app.

## Contents

| Entry | Copied to (in the app) | What it is |
|---|---|---|
| `kit/` | `src/components/kit/` | The component library — verbatim copy of `starter/src/components/kit/` |
| `shadcn.css` | `src/shadcn.css` | The kit's Tailwind graph: triplet bridge (`hsl(var(--token))`), base `:root` + `.dark`, imports tokens.css last |
| `tokens.css` | `src/tokens.css` | The token contract: Beacon at `:root`, every kit `@utility`. Ten more languages briefly existed as `data-theme` blocks here; all were retired 2026-08-12, no archive — Beacon is the whole contract now, so nothing selects between languages, there's just the one |
| `app-ui-shim.js` | `src/lib/app-ui-shim.js` | Maps the kit's `@kissflow/app-ui` imports onto `@kissflow/app-core` (+ a resting `useKfDev`) via a vite alias |
| `kit-compat.css` | `src/kit-compat.css` | Scaffold-shell `sidebar-*` tokens derived from the identity — the scaffold's own graph reads them as whole colours |

## Parity — this is a COPY, and copies drift

The source of truth for `kit/`, `shadcn.css`, `tokens.css` and `theme-variants.css` is
**`starter/src/`** (repo root; not shipped with the plugin — that is why the copy exists). After
changing the starter kit or its token contract, re-sync with the generator (NOT a hand `cp` — the
hand copy silently drifted a WCAG fix out of `tokens.css` and left generated apps shipping the
failing colour):

```bash
node plugins/app-agents/engine/sync-app-kit.mjs           # sync + report what changed
node plugins/app-agents/engine/sync-app-kit.mjs --check   # exit 1 if out of date (for CI)
```

`app-ui-shim.js` and `kit-compat.css` are app-kit-owned (no starter upstream) and are left
untouched by the sync. `kit/` is mirrored exactly, so a component deleted from the starter is
deleted here too.

The same relationship proto-kit's catalog has with the starter (its `starterTwin` fields and the
parity page), one level up: the catalog transcribes the kit's HTML for prototypes; this payload
carries the kit's actual source for generated React apps.

## The contract in one paragraph

The kit's utilities resolve through `hsl(var(--token))` — every colour token is a bare
`H S% L%` TRIPLET. The `create-app` scaffold's own graph bridges `var(--token)` raw — whole
colours. Both graphs coexist in an installed app; the kit's loads later and wins ties. The app's
identity therefore must be emitted in triplet form (`kit-install.mjs` does this through
`theme-from-design.mjs` `identityTokens(..., { wholeValueColors: false })`) — regenerating it
with `theme-from-design.mjs --out` directly would emit whole colours and silently break the
bridge. `kit-compat.css` covers the one place the scaffold graph still paints: the app shell's
`sidebar-*` tokens.
