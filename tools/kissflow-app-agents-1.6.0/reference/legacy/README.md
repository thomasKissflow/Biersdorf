# Retired anchors — kept, not deleted

**2026-08-10.** The 21-anchor catalog (`reference/ui-themes.json`) was collapsed down to 3:
`beacon`, `nimbus`, `checkpoint` — one anchor per design language, matching what `checkpoint`
already was (an anchor that IS its own language, rather than borrowing another one's grammar).

**2026-08-12, morning.** `nimbus` was retired (its `tokens.css` block deleted — no run referenced it)
and nine new languages were added: `iris`, `cadence`, `harbour`, `hearth`, `lantern`, `plush`,
`signal`, `sorrel`, `trailhead`. The catalog held eleven, every one of which IS a design language.

**2026-08-12, later the same day.** All ten non-Beacon languages — `checkpoint` and the nine above —
were retired together: their `tokens.css` blocks deleted, the multi-language selection machinery
(catalog `pick`/`rankLanguages`, `FIT_KEYWORDS`, `LANGUAGE_FIT` domain scoring, the `--language`
flag, the legacy-surface fallback) retired with them, `engine/proto-kit/gen-language-blocks.mjs` and
`languages.json` deleted outright. The catalog holds one entry, `beacon`. **Unlike every entry in
this directory, none of it was archived** — the app settled on Beacon alone by explicit choice, not
by a collapse worth keeping a restore path for, so recovery (if ever needed) is git history only,
not a file here.

`ui-themes-retired.json` in this directory holds the other 21 presets, byte-identical to how they
last read live: `default`, `enterprise`, `school`, `editorial`, `ledger`, `counsel`, `clinic`,
`bloom`, `depot`, `harvest`, `civic`, `console`, `atelier`, `studio`, `forge`, `grid`, `assure`,
`sentinel`, `realty`, `voyage`, `court`. Same convention as `starter/src/components/legacy/kf-ui.css`
and proto-kit's own retired 22-anchor tokens — on disk for reference, not wired into anything live.

## Why kept instead of deleted
Real curated work — accent + chart ramp + shadow/type/spacing scale, tagged by domain fit,
originally scraped and tuned from octet.design's SaaS palette set (see `ui-themes.json`'s own
git history, commit `fa48850`, 2026-07-25). Cheap to keep on disk, expensive to redo from scratch
if a future domain genuinely needs one of them back.

## What "not wired into anything live" means
- `language-catalog.mjs#loadLanguages()` reads `reference/ui-themes.json` only — this file is never
  imported by any code path.
- `theme-from-design.mjs`'s `ANCHOR_LANGUAGE` map is GONE — it was an identity function, and every
  catalog entry is now a language, so `LANGUAGES` is read from `reference/ui-themes.json` directly.
  None of the 21 retired ids resolve to a language by name anymore.
- `kf-design-director.md`'s fit-mapping examples were rewritten to the 3-anchor catalog — it no
  longer tells an agent to pick `ledger` or `sentinel` by name.

## To bring one back
1. Copy its object out of `ui-themes-retired.json` into `reference/ui-themes.json`'s array (both
   the plugin copy and any staged workspace copy — `sync-tokens.mjs`-style, no dedicated sync
   script exists for this file, so both need the same edit).
2. It is then a design language by definition, so it also needs a REAL `tokens.css` block (~130
   tokens, verified) — the expensive part `checkpoint` paid for and these 21 never did. Without one
   it renders as Beacon silently. There is no `ANCHOR_LANGUAGE` map to add it to anymore; a slice
   whose `anchorId` names a catalog entry resolves to that language directly, and a run with neither
   lowers via `LEGACY_SURFACE_LANGUAGE`/`LANGUAGE_FIT`, same as before.
3. Re-add it to `kf-design-director.md`'s example fit-mapping if it should be discoverable by
   domain words again.
