# proto-kit vs starter kit — component gap analysis (2026-08-09)

> ## ⛔ SUPERSEDED — this is a CLOSED changelog, not a live gap list
>
> **Do not read the tables below as "missing from proto-kit". They were the to-do list, and the work
> was done.** 17 of the 18 components listed as missing were subsequently built into proto-kit — see
> this file's own "Next step" section at the bottom, which is the instruction that was carried out.
>
> Consulting this file for current coverage gives you the **opposite of the truth on 17 of 18 rows**.
> Concretely: it lists `AvatarStack` and `Breadcrumb` ("no breadcrumb recipe exists at all") as
> missing, but `catalog/identity.mjs` ships both today — `id: "avatar"` (named "Avatar · AvatarStack",
> with an AvatarStack specimen) and `id: "breadcrumb"`. Same for `HBars`, `GaugeRing`, `FunnelChart`,
> `Heatmap`, `StackedBar`, `Legend`, `NoAccess`, `Skeleton`, `Stepper`, `PageHeader`, `Grid`, `Split`,
> `Bento`, `Modal` and `ProgressList`.
>
> **Only `ModelChart` is still genuinely absent from proto-kit** — it was deliberately skipped pending
> a decision on live-data-bound prototype components, and it remains the one open item.
>
> This file also predates the ten components folded in from `src/components/ui/` on 2026-08-11
> (`Accordion`, `Sheet`, `Popover`, `Tooltip`, `DropdownMenu`, `Command`, `Checkbox`, `Switch`,
> `Label`, `Separator`), none of which it mentions at all.
>
> 👉 **For current coverage use [THREE-WAY-MATRIX.md](./THREE-WAY-MATRIX.md)**, which is derived from
> live source (catalog ids × specimen `twin:` fields × `nav.json`) rather than hand-maintained.
>
> Kept for the history: it records *why* each component was added, and the two starter-kit bugs found
> while porting are still worth reading.

Working doc for the proto-kit revamp. Compares every exported component in
`starter/src/components/kit/` (the real, functional component library the built app ships with)
against every recipe in `COMPONENTS.md` (the prototype-builder's cookbook). Themes are OUT OF SCOPE
for this pass — see the note at the bottom.

Status: **list only, nothing added to COMPONENTS.md yet.**

## Method

Extracted every `export function` / `export const` from the 17 files in `starter/src/components/kit/`
(39 components total) and checked each against COMPONENTS.md's ~24 recipes by name and by what it
visually composes.

## Missing from proto-kit — exist in kit/, no COMPONENTS.md recipe (18)

### Charts (`DataCharts.jsx`, `Donut.jsx`) — proto-kit only has plain bar chart, dual-line chart, donut
| Component | Source | What it is |
|---|---|---|
| `HBars` | `DataCharts.jsx` | Horizontal ranked bars (sorted, labeled rows) |
| `GaugeRing` | `DataCharts.jsx` | Radial gauge for a single ratio — distinct from the plain donut/progress-ring recipe |
| `FunnelChart` | `DataCharts.jsx` | Conversion/pipeline funnel |
| `Heatmap` | `DataCharts.jsx` | Grid heatmap |
| `StackedBar` | `DataCharts.jsx` | Multi-key stacked bars |
| `Legend` | `Donut.jsx` | Standalone dot + label + value legend list |

### Feedback / state (`Feedback.jsx`) — proto-kit only has a generic Empty state
| Component | Source | What it is |
|---|---|---|
| `NoAccess` | `Feedback.jsx` | Permission-denied state — no equivalent at all |
| `Skeleton` | `Feedback.jsx` | Loading placeholder — no equivalent at all |

### Process (`Feed.jsx`)
| Component | Source | What it is |
|---|---|---|
| `Stepper` | `Feed.jsx` | Horizontal numbered step progress — distinct from Timeline |

### Layout (`Layout.jsx`) — proto-kit has no reusable layout primitives, only inline grid classes per recipe
| Component | Source | What it is |
|---|---|---|
| `PageHeader` | `Layout.jsx` | Title/subtitle/actions bar — every real page needs this, nothing in COMPONENTS.md covers it |
| `Grid` | `Layout.jsx` | Reusable responsive grid wrapper |
| `Split` | `Layout.jsx` | Rail+content split primitive (proto-kit's master-detail recipe is one fused composition, not a reusable primitive) |
| `Bento` | `Layout.jsx` | Bento-box grid |

### Surfaces
| Component | Source | What it is |
|---|---|---|
| `Modal` | `Overlay.jsx` | Real modal shell — header/footer/width. Proto-kit only documents `openPopup(html)` as a shell global, no modal anatomy |
| `ProgressList` | `Progress.jsx` | List of labeled progress bars — proto-kit's progress-bar recipe is single-bar only |

### Identity
| Component | Source | What it is |
|---|---|---|
| `AvatarStack` | `Avatar.jsx` | Overlapping avatar group with "+N more" |
| `Breadcrumb` | `Breadcrumb.jsx` | No breadcrumb recipe exists at all |

### Data-bound — architecturally different, needs its own decision before porting
| Component | Source | What it is |
|---|---|---|
| `ModelChart` | `ModelChart.jsx` | Binds live to a Kissflow flow (`flowType`/`flowId`/`groupBy`). Not presentational against static SEED like everything else in proto-kit — can't become a normal recipe as-is. |

## Reverse gaps — proto-kit recipe is richer than its kit/ counterpart (not in scope now, flagging only)

| Recipe (proto-kit) | Component (kit/) | Gap |
|---|---|---|
| Stat tile with icon chip + delta | `StatTile` (`Cards.jsx`) | kit's version has no icon-chip or delta — just label/value/unit/alarm |
| Dual-series line chart with dark tooltip | `LineChart` (`DataCharts.jsx`) | kit's version is single-series, no tooltip |
| Activity feed with chat + attachment | `ActivityFeed` (`Feed.jsx`) | kit's version is avatar + action text + meta only — no chat bubble, no attachment card |

## Recipes with no kit/ counterpart at all (the other direction — not this pass's target, noted for completeness)

Approval queue row, Search + filter bar, Directory photo-card, Calendar/agenda, WIP strip — these
exist in COMPONENTS.md with no `kit/` equivalent. Out of scope per the user's direction ("whatever is
missing [from proto-kit], we need to add") but will matter once we get to making kit/ and proto-kit
fully reciprocal.

## ⚠️ This list is INCOMPLETE — found 2026-08-09 while reviewing the running app

The live catalog at `localhost:3000` carries **four entries this analysis missed**, because it was
built from `kit/`'s exports and `nav.json` at one point in time and the starter kit is moving fast:

| Nav entry | Route | Group |
|---|---|---|
| Flow views | `/flow-views` | Data |
| Forms | `/forms` | Controls |
| Effects | `/effects` | Behaviour ← a group that did not exist in the earlier read |
| Generated-page kit | `/generated-kit` | Behaviour |

Re-derive the gap list from the running app (or a fresh read of `nav.json` + `kit/`) before treating
the counts above as final.

## Explicitly deferred

**Themes** — proto-kit's 22 flat "anchor" tokens vs starter's Beacon/Nimbus/Checkpoint design
languages are a separate, larger question (three theme systems currently exist; see conversation).
Deliberately not touched in this pass — components first, themes after.
*(Settled since: the flat anchors were retired 2026-08-10. Nimbus was retired 2026-08-12 morning, the
contract briefly carried eleven design languages, and all ten non-Beacon languages — Checkpoint plus
nine added that same morning — were retired later the same day. One theme system remains: Beacon.
This paragraph is the question as it stood, not the answer.)*

## STATUS 2026-08-10 — ported AND promoted. `COMPONENTS.md` is now the generated catalog.

`catalog/*.mjs` holds **35 entries · 75 specimens · 6/6 categories** (Behaviour joined Data/Controls/
Surfaces/Identity/Process — `CountUp`, `toast`/`Toaster`, `CustomEmbed`, `StoresMap`), every snippet
transcribed from the real `kit/` component and lint-clean against the contract (`6070` class names
checked, 0 errors).

**`COMPONENTS.md` has been promoted** (3020 lines, was 418). The six proto-kit-only compositions that
have no `kit/` twin (Approval queue row, Search + filter bar, Directory photo-card, Calendar/agenda,
WIP strip) are now real catalog entries (`ApprovalRow`/`ApprovalQueue`, `SearchBar`/`FilterBar`,
`PhotoCard`, `Calendar`/`Agenda`, `WipStrip`). The remaining two — **the hero-band addendum** (5 slot
templates + the `eyebrow`/`frost` anatomy) and the **page-layout archetype rules** — are genuinely not
components (no specimen, no bindings; they're composition/layout guidance), so they were preserved
verbatim as `catalog/_addendum.md`, appended by `gen-catalog.mjs` after the generated categories on
every run rather than hand-patched into the output — so they survive regeneration instead of being
silently dropped the next time the script runs. `gen-catalog.mjs --check` / `--promote` are both clean.

## Bugs found in the starter kit while porting

- **`kit/Fields.jsx` select chevron contradicts its own comment.** Line 71: *"currentColor is
  deliberate: it inherits the field's ink, so it follows the language."* Line 88 hardcodes
  `stroke='%23656e7a'` (Beacon's meta-foreground) inside a data-URI. A data URI cannot read the host
  document's cascade, so Nimbus and Checkpoint wear Beacon's chevron.
- **The old cookbook's Timeline dot is mispositioned in all three languages.** It hardcodes
  `-left-[5px]` for a 10px dot; the real component computes
  `calc(var(--chip-dot) / -2 - var(--border-functional) / 2)`, and `--chip-dot` is 7px under Beacon
  and Nimbus, 6px under Checkpoint. Fixed in the ported entry.

## Next step

Add the 17 presentational components above as new COMPONENTS.md recipes (skip `ModelChart` pending
a separate decision on live-data-bound prototype components).
