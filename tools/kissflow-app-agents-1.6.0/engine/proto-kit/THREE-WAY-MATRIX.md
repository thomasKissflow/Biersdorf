# proto-kit snippets ↔ starter kit ↔ component gallery — availability matrix

Generated 2026-08-12 by reading all three sources directly; nothing hand-maintained.
**Updated 2026-08-12** after the ten class-3 components were ported to proto-kit and the gallery.

- **proto-kit (Snippets)** — `plugins/app-agents/engine/proto-kit/catalog/*.mjs`, HTML snippets the
  prototype-builder emits. **44 entries · 86 specimens.**
- **Starter kit** — `starter/src/components/kit/*.jsx`, real React components the built app ships.
  **99 exports** across 28 files (~48 component groups once sub-parts are folded).
- **Component gallery** — the starter's own dev harness, routes declared in `starter/lib/nav.json`.
  **40 component pages** (+8 diagnostics: `/parity`, `/bench`, 6 × `/test-kit/*`).

> ## ✅ Class 3 is now EMPTY — the ten-component gap is closed
>
> The ten components folded in from `src/components/ui/` on 2026-08-11 had no proto-kit snippet and
> no gallery page. Both were built on 2026-08-12: **9 new catalog entries** (`checkbox-switch`,
> `label`, `command`, `dropdown-menu`, `sheet`, `popover`, `tooltip`, `accordion`, `separator`) and
> **6 new gallery pages** (`/checkbox-switch`, `/command`, `/floating`, `/sheet`, `/accordion`,
> `/separator`). `/parity` went from **27 of 35** to **36 of 44** matching entries — +9 entries, +9
> aligned, so every new row pairs 1:1 with no `NoCounterpart` holes.
>
> **`ModelChart` is now the only component in the kit with no proto-kit snippet** (class 2), still
> deliberately deferred because it binds live SDK data rather than static SEED.

> **This file is the only current source for component coverage.** The older
> [`COMPONENT-GAPS.md`](./COMPONENT-GAPS.md) and [`STARTER-PARITY.md`](./STARTER-PARITY.md) are both
> 2026-08-09 snapshots and now actively mislead — each carries a banner saying so.
>
> `COMPONENT-GAPS.md` is the trap worth naming: its "Missing from proto-kit (18)" list was a **to-do
> list that got done**, so 17 of its 18 rows now state the opposite of the truth. It lists
> `AvatarStack` and `Breadcrumb` as having no proto-kit recipe when `catalog/identity.mjs` ships both.
> Only `ModelChart` (class 2 below) is still genuinely missing.

**How the join is derived.** Every gallery specimen entry in `starter/src/specimens/*.jsx` carries a
`twin:` field naming the proto-kit catalog id it mirrors — that field, not a lookup table, is what
makes the mapping derivable. Verified complete: 48 real `twin:` occurrences resolve to exactly 35
unique ids, matching the 35 catalog ids one-for-one.

---

## Class 1 — in all three (35)

Every proto-kit snippet has both a starter-kit component and a gallery page. There are **no
proto-kit-only** entries.

| proto-kit snippet | Starter kit component(s) | Kit file | Gallery page |
|---|---|---|---|
| `status-chip` | `StatusChip` | `Chips.jsx` | Identity › StatusChip |
| `avatar` | `Avatar` · `AvatarStack` | `Avatar.jsx` | Identity › Avatar |
| `breadcrumb` | `Breadcrumb` | `Breadcrumb.jsx` | Identity › Breadcrumb |
| `button` | `Button` · `ButtonRow` | `Buttons.jsx` | Controls › Button |
| `fields` | `Input` · `Select` · `Textarea` | `Fields.jsx` | Controls › Input, Select, Textarea |
| `search-bar` | `SearchBar` · `FilterBar` | `Fx.jsx` | Controls › Filters |
| `tab-strip` | `TabStrip` | `TabStrip.jsx` | Controls › TabStrip |
| `card` | `Card` · `CardTitle` | `Cards.jsx` | Surfaces › Card |
| `photo-card` | `PhotoCard` | `Cards.jsx` | Surfaces › Card |
| `callout` | `Callout` | `Callout.jsx` | Surfaces › Callout |
| `modal` | `Modal` | `Overlay.jsx` | Surfaces › Modal |
| `page-header` | `PageHeader` | `Layout.jsx` | Surfaces › Layout |
| `layout-primitives` | `Grid` · `Split` · `Bento` | `Layout.jsx` | Surfaces › Layout |
| `empty-states` | `EmptyState` · `NoAccess` · `Skeleton` | `Feedback.jsx` | Surfaces › Empty states |
| `donut` | `Donut` · `Legend` | `Donut.jsx` | Data › Donut |
| `table` | `Table` | `Tables.jsx` | Data › Table |
| `stat-tile` | `StatTile` | `Cards.jsx` | Data › StatTile |
| `metric-card` | `MetricCard` · `KpiCard` · `BigStat` | `Compat.jsx` ¹ | Behaviour › Generated-page kit |
| `calendar` | `Calendar` · `Agenda` | `Calendar.jsx` | Data › Calendar |
| `progress` | `ProgressBar` · `SegmentBar` · `ProgressList` | `Progress.jsx` | Data › Progress |
| `bar-chart` | `BarChart` | `DataCharts.jsx` | Data › BarChart |
| `hbars` | `HBars` | `DataCharts.jsx` | Data › HBars |
| `line-chart` | `LineChart` | `DataCharts.jsx` | Data › LineChart |
| `gauge-ring` | `GaugeRing` | `DataCharts.jsx` | Data › GaugeRing |
| `funnel-chart` | `FunnelChart` | `DataCharts.jsx` | Data › FunnelChart |
| `heatmap` | `Heatmap` | `DataCharts.jsx` | Data › Heatmap |
| `stacked-bar` | `StackedBar` | `DataCharts.jsx` | Data › StackedBar |
| `feed` | `Stepper` · `Timeline` · `ActivityFeed` | `Feed.jsx` | Process › Process views |
| `approval-row` | `ApprovalRow` · `ApprovalQueue` | `Queue.jsx` | Process › Queue |
| `wip-strip` | `WipStrip` | `Queue.jsx` | Process › Queue |
| `kanban` | `KanbanBoard` | `Board.jsx` | Process › KanbanBoard |
| `count-up` | `CountUp` | `Fx.jsx` | Behaviour › Effects |
| `toaster` | `toast` · `Toaster` | `Fx.jsx` | Behaviour › Effects |
| `custom-embed` | `CustomEmbed` | `Fx.jsx` | Behaviour › Effects |
| `stores-map` | `StoresMap` | `Fx.jsx` | Behaviour › Effects |

¹ `Compat.jsx` is the legacy-alias shim, not a primary kit file — see class 4.

---

## Class 2 — starter kit + gallery, **no proto-kit snippet** (3 groups)

Real, documented, reachable in the gallery — but the prototype-builder has no snippet for them, so
a prototype cannot show them.

| Starter kit component(s) | Kit file | Gallery page | proto-kit |
|---|---|---|---|
| `ModelChart` | `ModelChart.jsx` | Data › ModelChart (`/charts`) | ✗ |
| `FlowTimeline` · `FlowBoard` | `FlowViews.jsx` | Data › Flow views (`/flow-views`) | ✗ |
| `FieldInput` · `FormCard` · `ItemForm` · `NewButton` · `NewMenu` | `Forms.jsx` | Controls › Forms (`/forms`) | ✗ |

`forms.jsx` is the only specimen module carrying no `twin:` at all — the SDK-bound record-form stack
is deliberately starter-only. `/charts` and `/flow-views` are hand-built gallery pages (they use
`GalleryPage` directly rather than the catalog-driven `CatalogPage`), which is why they have no
specimen module and therefore no twin.

---

## Class 3 — ~~starter kit only~~ **CLOSED 2026-08-12** (was 10 groups)

These were the ten added on 2026-08-11 when `src/components/ui/` was folded into `kit/`, with no
proto-kit snippet and no gallery page. **All ten now exist in all three surfaces** and belong to
class 1; the table below records where each one landed.

| Starter kit component(s) | Kit file | proto-kit entry | Gallery page |
|---|---|---|---|
| `Checkbox` · `Switch` | `Fields.jsx` | `checkbox-switch` (2 specimens) | Controls › Checkbox · Switch |
| `Label` | `Fields.jsx` | `label` (1) | Controls › Checkbox · Switch |
| `Command` (+ 8 sub-parts) | `Command.jsx` | `command` (1) | Controls › Command |
| `DropdownMenu` (+ 11 sub-parts) | `Floating.jsx` | `dropdown-menu` (1) | Surfaces › Floating |
| `Popover` (+ 3 sub-parts) | `Floating.jsx` | `popover` (1) | Surfaces › Floating |
| `Tooltip` (+ 3 sub-parts) | `Floating.jsx` | `tooltip` (1) | Surfaces › Floating |
| `Sheet` | `Overlay.jsx` | `sheet` (1) | Surfaces › Sheet |
| `Accordion` (+ 3 sub-parts) | `Accordion.jsx` | `accordion` (1) | Surfaces › Accordion |
| `Separator` | `Layout.jsx` | `separator` (2) | Surfaces › Separator |

Nine entries rather than ten because `Checkbox` and `Switch` share one entry — they share the
focus contract in `Fields.jsx`, the same reason `Input`/`Select`/`Textarea` share `fields`. `Label`
was deliberately NOT folded in with them: it shares nothing with those two but the file it lives
in, and grouping it would invent a decision the source does not make.

Six gallery pages rather than nine because `/floating` hosts Popover, Tooltip and DropdownMenu
together (mirroring `kit/Floating.jsx`, which is one file and one decision), and
`/checkbox-switch` hosts both `checkbox-switch` and `label`.

`starter/src/pages/kit-smoke-test.jsx` still exists and is still deliberately absent from
`nav.json` — it is now redundant with the real catalog pages and can be deleted whenever you like.

---

## Class 4 — legacy aliases (`Compat.jsx`)

`Compat.jsx` re-exports kit components under their old names so pre-existing generated pages keep
compiling. Not new components; excluded from the kit inventory above except where a proto twin
exists (`metric-card`).

| Alias(es) | Resolves to | Gallery | proto-kit |
|---|---|---|---|
| `MetricCard` · `KpiCard` · `BigStat` | `StatTile` / `Card` | Behaviour › Generated-page kit | `metric-card` |
| `Panel` · `Tile` · `KpiRow` | `Card` / `Grid` | Behaviour › Generated-page kit | ✗ |
| `RBar` · `RArea` · `RPie` · `RBreakdown` | `BarChart` / `LineChart` / `Donut` | Behaviour › Generated-page kit | ✗ |
| `TONES` · `toneAt` | tone ramp constants | Behaviour › Generated-page kit | ✗ |
| `DataTable`, `Chart`, `Tabs`, `StatusPill`, `GhostButton`, `Timeline`, `KanbanBoard` | renames of kit primitives | — | ✗ |

---

## Summary

| | proto-kit snippets | Starter kit | Gallery nav |
|---|---|---|---|
| Class 1 — all three | 44 | 44 | 44 |
| Class 2 — kit + gallery only | — | 3 groups | 3 pages |
| Class 3 — kit only | — | **0 (closed)** | — |
| **Coverage** | **44 entries · 86 specimens** | **~48 groups** | **40 component pages** |

- **proto-kit is still the narrowest surface, but only just.** After the 2026-08-12 port, exactly
  **3 kit component groups** have no snippet — `ModelChart`, `FlowTimeline`/`FlowBoard` and the
  `Forms` record-form stack (all class 2), down from 13.
- **The gallery no longer trails the kit.** Every kit component group except the class-2 three has
  both a catalog entry and a reachable gallery page.
- **`/parity` reports 36 of 44** entries with matching specimen counts. The 8 mismatches are all
  pre-existing (`card` 3·4, `photo-card` 1·2, `toaster` 1·2, `approval-row` 4·3, `wip-strip` 2·1,
  `donut` 2·3, `metric-card` 3·1, `calendar` 4·3) — none introduced by the port.
- **Nothing exists in proto-kit or the gallery that the starter kit lacks.**

## Regenerating

Three artifacts derive from `catalog/*.mjs` and must be regenerated together after any catalog edit:

```bash
cd plugins/app-agents/engine/proto-kit
node lint-catalog.mjs          # every class name vs the token contract — fails on unknown classes
node gen-catalog.mjs           # → gallery.html + COMPONENTS.generated.md (staged)
node gen-catalog.mjs --promote # → COMPONENTS.md (live cookbook), guarded against content loss

cd ../../../../starter
node scripts/gen-proto-catalog.mjs   # → src/proto-catalog.js, the mirror /parity reads
```

**The last one is the easy one to miss.** `/parity` renders from `starter/src/proto-catalog.js`, a
generated copy — not from the catalog directly. Skip it and the gallery keeps reporting the old
entry count with no error anywhere. `node scripts/gen-proto-catalog.mjs --check` fails loudly when
it is stale; wire that into CI rather than remembering.
