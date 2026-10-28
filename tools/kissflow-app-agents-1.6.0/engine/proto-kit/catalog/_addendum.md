# Layout & composition rules

<!-- Not components — layout/composition guidance with no kit/ twin. Preserved verbatim from the
     pre-catalog COMPONENTS.md (2026-08-09) so gen-catalog.mjs --promote doesn't delete it. See
     COMPONENT-GAPS.md "STATUS" section for why these live here instead of as catalog entries. -->

### Page composition — per-page LAYOUT archetypes (NOT one fixed recipe)
Each page is composed per its layout archetype (`engine/page-layouts.mjs` — command | queue | intake |
analytics | operations | board | directory | master-detail | calendar): the HERO leads with the most
space, compose[] rows follow, forbid[] respected. The old fixed "KPI row → work surface → rail" recipe
applies ONLY to `command` pages. Bind everything to SEED; actions call `openPopup`/`showToast` — never
dead buttons.

## Dense table variant (`operations` pages — more rows per screen)
Same table recipe with: `text-[13px]`, cells `px-4 py-2`, no per-row hover buttons (row click opens
detail), sticky header `thead class="sticky top-0 bg-card"` inside a `max-h-[480px] overflow-y-auto` wrapper.

---

# HERO-BAND ADDENDUM (gradient anchors — `design.gradients` present, e.g. `checkpoint`)

When the app's design slice carries `gradients` (the anchor's shell is the `hero-band` archetype:
rounded floating canvas, pastel gradient band, flush putty rail), parts get FIVE extra template
slots and a stricter anatomy, learned from the Compliance Checkpoint source design (2026-08-07,
verified component-by-component on Vendor Onboarding). The shell copies each template's innerHTML
into its band/sidebar slot on role switch — **templates carry FINAL STATIC HTML** (scripts inside
never execute); build them in your load-time script from SEED, exactly like any dynamic region.

Extra CSS available: `eyebrow` (mono uppercase kicker — a CONTRACT utility now, so it works in
every language and in the built app, not just on gradient anchors) · `.frost` (frosted chip; a
shell-local alias over the contract's `--canvas-chip-*` tokens, which `on-canvas` also reads) ·
`.bar-striped` (dashed candy-stripe "needs action" meter variant) · gradient vars
`--grad-hero/-brand/-success/-review/-danger/-warning`.

Three "automatic" behaviours documented here previously are GONE, because they were v3 workarounds
and the token contract now does each properly — do not write markup that relies on them:

| was | now |
| --- | --- |
| cards with `rounded-lg border border-border bg-card` silently dropped their hairline | Checkpoint sets `--border-decor: 0px`, which reaches every card. Write `border-decor border-edge` and the language decides. |
| labels with `text-[13px] text-muted-foreground` became mono eyebrows | use the `eyebrow` utility explicitly. Styling a utility PAIR meant any label that happened to be 13px got re-voiced. |
| `button.rounded-md` became a pill | `--control-radius` per language (Checkpoint's is **9px**, not a pill — the old override contradicted the source it claimed to implement). Use `control-shape`. |

`input.pl-9` search fields become underline-only — this one remains, gated on gradient anchors.

## The five slot templates (all built from SEED in your load script)

```html
<template class="hero"><!-- meter strip: one flex row of proportional pastel bars -->
  <div class="flex items-end gap-2.5">
    <div class="min-w-0" style="flex:8">
      <div class="eyebrow !text-[9.5px] mb-1.5 pl-0.5">Moving on time</div>
      <div class="h-10 rounded-full flex items-center gap-2.5 px-2" style="background:var(--grad-success)">
        <span class="h-5 w-5 rounded-full bg-white/90 grid place-items-center"><span class="h-1.5 w-1.5 rounded-full bg-foreground/60"></span></span>
        <b class="tabular-nums text-sm">8</b><span class="text-xs text-foreground/60 truncate">within SLA</span></div></div>
    <!-- needs-action variant: dashed candy-stripe, dark ink, NO solid gradient -->
    <div class="min-w-0" style="flex:5">
      <div class="eyebrow !text-[9.5px] mb-1.5 pl-0.5">Register needs action</div>
      <div class="h-10 rounded-full flex items-center gap-2.5 px-2 bar-striped"><b class="tabular-nums text-sm">5</b></div></div>
  </div>
</template>

<template class="hero-fig"><!-- inline headline beside the page title: "Register 16 requirements tracked" -->
  <span class="font-display font-bold tracking-tight leading-none text-[clamp(28px,3.5vw,44px)] tabular-nums">16</span>
  <span class="text-base font-medium text-muted-foreground">requirements tracked</span>
</template>

<template class="hero-side"><!-- 2–3 right-of-title stat clusters -->
  <div class="flex items-center gap-2.5">
    <div class="frost h-8 w-8 rounded-full grid place-items-center font-mono text-xs text-muted-foreground">#</div>
    <div class="leading-tight"><div class="eyebrow !text-[9.5px]">Register</div>
      <div class="text-sm font-semibold">POF-HSE-FR-091</div></div></div>
</template>

<template class="hero-cta"><!-- the black pill, wired to a REAL nav action — never a dead button -->
  <button onclick="document.querySelector('[data-nav=<slug>-<page>]')?.click()"
    class="h-9 px-5 rounded-full text-[12.5px] font-bold"
    style="background:hsl(var(--foreground));color:hsl(var(--background));box-shadow:0 4px 12px rgba(20,22,28,.28)">New change</button>
</template>

<template class="side-foot"><!-- sidebar health strip: segmented 7px bar + counts -->
  <div class="eyebrow !text-[9.5px] mb-2">Pipeline health</div>
  <div class="flex h-[7px] rounded-full overflow-hidden gap-[2px]">
    <span style="flex:11;background:var(--grad-success)"></span>
    <span style="flex:3;background:var(--grad-review)"></span>
    <span style="flex:2;background:var(--grad-danger)"></span></div>
  <div class="flex justify-between text-[11px] text-sidebar-muted mt-2"><span>11 approved</span><span class="font-mono">of 16</span></div>
</template>
```

## Anatomy upgrades that replace the base recipes on gradient anchors

- **KPI card**: eyebrow label (`text-[13px] text-muted-foreground` — auto mono-uppercase) + 28px
  pastel icon tile top-right (`h-7 w-7 rounded-lg grid place-items-center` +
  `style="background:var(--grad-…)"` + 14px inline stroke SVG in `text-muted-foreground`); value row
  `text-2xl font-bold tabular-nums` with a small muted unit ("of 6", "days"); sub-note below.
- **Sign-off / queue row**: soft pastel-gradient row (`rounded-[14px]`,
  `background:var(--grad-review)` — `--grad-warning` when at-risk) with a stacked left figure
  (bold `36d` over a mono 9px "waiting" microlabel), bold title, muted meta, actions right.
- **Donut**: conic-gradient of the pastel endpoint colors, `bg-card` inner circle with big tabular
  total + mono "TOTAL" microlabel, legend rows of dot + label + bold tabular value.
- **Bars-in-track**: label row (name left, mono meta right), 26px `rounded-[9px]` bar on
  `bg-muted`-style track with the value INSIDE the fill.

Rule of the band: figures come from SEED, actions target real nav ids. Decorative dead chrome
(an Export that exports nothing, a fake "synced 2m ago") is out of contract.
