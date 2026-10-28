import { useId } from "react";

/**
 * Card · StatTile — the surface, and the figure tile built on it.
 *
 * REDESIGNED 2026-08-13 from Cards.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229) — see its own "Token mapping" table for the
 * full v1 → v2 diff, transcribed here as [SOURCE] comments per change:
 *
 *   Panel fill/ground   --color-surface on --color-canvas          (canvas is new)
 *   Panel edge          none                                       (was --color-gray-2 @ 1px — DROPPED)
 *   Panel shadow/radius --shadow-panel · --radius-xl                (was --shadow-flat @ 14px)
 *   Nested panel        --color-gray-1 fill · --radius-lg           (gray fill replaces the stepped radius alone)
 *   Padding             card-pad-metric/list/doc = 20/24/28 = p-5/p-6/p-7   (unchanged)
 *   Title type          15px medium, -.015em                        (was text-base semibold)
 *   Figure type         28px medium tabular, -.028em                (was 30px bold, -.02em)
 *   Delta pill          --color-<tone>-bg / -ink                    (new — replaces a bare coloured number)
 *   Sparkline           bleeds -mx-5, gradient fill to transparent  (new — cancels the card's own padding)
 *   Clickable hover     --shadow-raised, -2px lift                  (was a primary border warm — there is
 *                                                                     no border left to warm)
 *
 * `role` still picks the padding — Beacon's own three roles, unchanged in number: "KPI and
 * figure tiles — dense, the number carries the card" / "List and table cards, where rows bring
 * their own rhythm" / "Long-form and documentation cards — text needs the air".
 *
 * `tone` is NEW (Cards.dc.html's own API note): renders the tinted tile and drops the shadow
 * automatically — Cards.dc.html is explicit that a tinted tile needs no elevation, "its fill
 * already separates it from the canvas," and that giving one the panel shadow "makes it look
 * like it is peeling off the page." `tone="neutral"` (or no tone) resolves to the plain white
 * panel instead, because gray-on-canvas is invisible without one.
 *
 * `clickable` is still opt-in, still not the default — Cards.dc.html's own clickable example is
 * captioned "A panel that is not a target does not respond at all," the same rule the old
 * border-warm behaviour encoded. There is no border left to warm, so the whole response moved to
 * the shadow + a 2px lift.
 */

// `bare` is a fourth role with no padding at all, for a card whose FIRST CHILD is edge-to-edge —
// PhotoCard's image band, and anything else that has to bleed to the card's own corners. It is a
// role rather than a `noPad` flag because that is how the other three are chosen, and because
// "this card pads itself internally" is a fact about what the card holds, not a switch.
const PAD = { metric: "card-pad-metric", list: "card-pad-list", doc: "card-pad-doc", bare: "" };

export function Card({
  role = "list",
  clickable = false,
  nested = false,
  tone,
  as: Tag = "section",
  className = "",
  style,
  children,
  ...rest
}) {
  // Dynamic per-tone colour cannot be a Tailwind class — a class string built from a runtime
  // variable (`bg-[var(--color-${tone}-bg)]`) is invisible to Tailwind's static scanner and
  // compiles to nothing (the same reason StatTile's delta pill has always used inline style
  // for its tone colour, below). Neutral is deliberately NOT tinted: Cards.dc.html — "the
  // neutral member of a tinted set is the exception: it goes white with the panel shadow,
  // because gray-on-canvas is invisible."
  const tinted = tone && tone !== "neutral";
  return (
    <Tag
      className={
        (tinted ? "" : nested ? "bg-gray-1 shadow-flat " : "bg-surface shadow-panel ") +
        "text-secondary " +
        // A surface inside another surface steps down a radius rung, per Cards.dc.html's own
        // token-mapping row. No border on either any more — see the file banner.
        (nested ? "rounded-lg " : "rounded-xl ") +
        (PAD[role] ?? PAD.list) +
        (clickable
          ? // No border left to warm (Cards.dc.html: "No border now"), so the whole response is
            // shadow + a 2px lift. The easing is the mock's own spring curve, not --ease-standard
            // — Cards.dc.html never names it as a reusable token, only draws it on this one
            // interaction, so it stays a literal rather than inventing a token Foundations
            // never declared.
            " cursor-pointer transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(.16,1,.3,1)]" +
            " hover:shadow-raised hover:-translate-y-0.5"
          : "") +
        (className ? " " + className : "")
      }
      style={tinted ? { background: `var(--color-${tone}-bg)`, color: `var(--color-${tone}-ink)`, ...style } : style}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Card title, in the display voice. Separate from Card so a card can have no heading at all —
 *  several of Beacon's own do.
 *  [SOURCE] Cards.dc.html's "This month" list-card example: 15px medium, -.015em, was
 *  text-base semibold. Still no default line-height beyond `leading-none` — the mock sets it
 *  once and holds it.
 *  2026-08-13 — text-[15px] → text-lg, on request: found live (DamWatch) sitting next to a
 *  GaugeRing's 22px centre figure and reading as an afterthought beside it. This supersedes the
 *  Cards.dc.html spec above for size only — font-medium/tracking/leading-none stay as sourced. */
export function CardTitle({ as: Tag = "h3", className = "", children }) {
  return (
    <Tag className={"m-0 mb-4 font-display text-lg font-medium leading-none tracking-[-.015em] " + className}>
      {children}
    </Tag>
  );
}

/**
 * StatTile — a label, a figure, and an optional unit.
 *
 * [SOURCE] Cards.dc.html's "metric" figure-tile example: the figure is now 28px medium tabular
 * at -.028em (was 30px bold at -.02em), and its label/value row sits on a metric-role card,
 * exactly what card-pad-metric was named for.
 *
 * `alarm` recolours the FIGURE, not a badge beside it — Beacon's own behaviour, where an
 * overdue count turns primary. That is a state on the number, which is why there is no icon
 * slot here; a card that also needs a category chip is MetricCard.
 *
 * `delta` + `series` are [OURS] and both OPTIONAL — pass neither and this renders exactly the
 * markup it always has. `tone` IS THE CLAIM, and it is passed rather than derived from the sign
 * of the delta — a rising overdue count and a rising completion rate are opposite news, so no
 * rule about + and − gets both right. It drives the pill and the spark from one token family
 * (--color-<tone>-bg / -ink, Foundations §Tones) so the card cannot disagree with itself, and it
 * supersedes `alarm` on the figure when both are given.
 *
 * `bleed` is NEW [SOURCE, Cards.dc.html's API table]: default true, the sparkline runs past the
 * card's own padding to its edge — "the one thing that makes a KPI card feel built rather than
 * boxed." Set false when the tile sits beside text rather than in a KPI row, where a full-bleed
 * chart would collide with its neighbour.
 */
export function StatTile({ label, value, unit, alarm = false, delta, tone, deltaTone, series, bleed = true, className = "" }) {
  // deltaTone lets the pill diverge from `tone` — Cards.dc.html's own metric-tile example pairs a
  // green "+0.1" pill with a plain dark figure and the language's own orange spark, three
  // independent colours, which a single `tone` prop can't express (it recolours figure + pill +
  // spark together, correct when a tile genuinely IS in one state, e.g. an alarm row). Falls back
  // to `tone` when omitted, so every existing caller renders unchanged.
  const dTone = deltaTone ?? tone;
  const figureStyle = tone ? { color: `var(--color-${tone}-ink)` } : undefined;
  const figureClass = "font-display text-[28px] font-medium tracking-[-.028em] tabular-nums leading-none " + (tone ? "" : alarm ? "text-primary" : "text-secondary");
  return (
    <Card role="metric" className={className}>
      {/* The label keeps its own <p> when there is no pill, so the no-delta DOM is unchanged. */}
      {delta == null ? (
        <p className="m-0 text-kpi-label text-text-muted">{label}</p>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <p className="m-0 min-w-0 truncate text-kpi-label text-text-muted">{label}</p>
          <span
            className="flex-none rounded-full px-2 py-0.5 font-mono text-data font-semibold tabular-nums"
            style={
              dTone
                ? { background: `var(--color-${dTone}-bg)`, color: `var(--color-${dTone}-ink)` }
                : { background: "var(--color-primary-bg)", color: "var(--color-primary-ink)" }
            }
          >
            {delta}
          </span>
        </div>
      )}
      <p className="m-0 flex items-baseline gap-2" style={{ marginTop: "var(--kpi-gap, 12px)" }}>
        <span className={figureClass} style={figureStyle}>{value}</span>
        {unit && <span className="text-kpi-label text-text-subtle">{unit}</span>}
      </p>
      {series?.length > 1 && <Spark series={series} tone={tone} bleed={bleed} />}
    </Card>
  );
}

/**
 * The filled area spark along a StatTile's foot.
 *
 * Not exported: it is StatTile's own anatomy, and the kit already has LineChart for a chart that
 * stands on its own.
 *
 * [SOURCE] Cards.dc.html's metric-tile example draws the area as a REAL gradient (opacity .22 at
 * the line, fading to 0 at the baseline) rather than the flat 12%-opacity fill `.kit-spark .area`
 * used before — "the sparkline runs past the padding to the card's own edge, the one thing that
 * makes a KPI card feel built rather than boxed" is the bleed; the gradient is what sells it as a
 * real chart rather than a flat wash. Each instance gets its own gradient id (useId) — the mock
 * hardcodes one id (`mGrad`) for its single example, which would collide across multiple StatTile
 * instances on the same page.
 *
 * Drawn on a 0..120 x 0..32 viewBox with preserveAspectRatio="none" so it stretches to whatever
 * width the tile happens to be; a spark has no readable x-scale, only a shape. A flat series would
 * divide by zero on the range, so that case pins to the middle rather than producing NaN in the
 * path — a silently unrendered spark is the failure this avoids.
 */
function Spark({ series, tone, bleed }) {
  const gradId = useId();
  const W = 120, H = 32, PAD = 2;
  const lo = Math.min(...series), hi = Math.max(...series);
  const span = hi - lo;
  const x = (i) => (series.length === 1 ? W / 2 : (i / (series.length - 1)) * W);
  const y = (v) => (span === 0 ? H / 2 : PAD + (1 - (v - lo) / span) * (H - PAD * 2));
  const line = series.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const stroke = tone ? `var(--color-${tone}-ink)` : "var(--color-primary)";
  return (
    <svg
      // card-pad-metric is 20px (p-5) — the -mx-5/+40px pair cancels exactly that on both sides,
      // per Cards.dc.html's own "-mx-5 · gradient to transparent" mapping row.
      className={"mt-4 block h-8 " + (bleed ? "-mx-5 w-[calc(100%+40px)]" : "w-full")}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={stroke} stopOpacity=".22" />
          <stop offset="1" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path fill={`url(#${gradId})`} stroke="none" d={`${line} L${W} ${H} L0 ${H} Z`} />
      <path fill="none" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" d={line} />
    </svg>
  );
}

/**
 * PhotoCard — a directory tile for a thing you can photograph.
 *
 * [OURS], and the one component in the kit that renders an <img>. That is the whole reason it
 * exists as its own export rather than a Card variant: an image is a surface NO design language
 * governs. Its colours are the photograph's, not the theme's, so it has to be fenced — a
 * fixed-height, overflow-hidden band at the top of the card, with everything below it back
 * under the contract.
 *
 * THE ICON VARIANT IS NOT A FALLBACK, it is the other half of the component. The prototype
 * cookbook's own rule: photographs belong to photographable entities — a vessel, a building, a
 * person. A GL account, a policy, a config record has no photograph, and inventing stock imagery
 * for one is how a directory of abstractions ends up looking like a stock-photo catalogue. Pass
 * `icon` instead of `image` and the band becomes a tinted tile, which is the honest rendering.
 *
 * With NEITHER, the band is a `bg-track` panel — the same token Skeleton reads, for the same
 * reason: it stands in for content inside a card.
 */
export function PhotoCard({
  image,
  alt = "",
  icon,
  title,
  meta,
  badge,
  stat,
  onClick,
  className = "",
}) {
  return (
    <Card role="bare" clickable={Boolean(onClick)} className={"overflow-hidden " + className} onClick={onClick}>
      <div className="relative h-36 bg-track">
        {image ? (
          <img src={image} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-text-muted" aria-hidden="true">
            {icon ?? (
              <svg width="28" height="24" viewBox="0 0 28 24">
                <rect x="0.75" y="0.75" width="26.5" height="22.5" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M1 17l7.5-7 6 5.5 4-3.5L27 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <circle cx="9" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            )}
          </span>
        )}
        {badge && <span className="absolute right-3 top-3">{badge}</span>}
      </div>
      <div className="card-pad-list">
        <p className="m-0 truncate font-display text-base font-semibold leading-tight tracking-tight text-secondary">{title}</p>
        {meta && <p className="m-0 mt-0.5 truncate text-xs text-text-muted">{meta}</p>}
        {stat && (
          <>
            <p className="m-0 mt-3 flex items-center justify-between text-xs">
              <span className="text-text-muted">{stat.label}</span>
              <span className="font-mono text-data font-semibold tabular-nums text-secondary">{stat.value}</span>
            </p>
            {stat.percent != null && (
              <span className="mt-1 block h-bar w-full overflow-hidden rounded-bar bg-track">
                <span
                  className="block h-full rounded-bar transition-[width] duration-move"
                  style={{ width: `${Math.max(0, Math.min(100, Number(stat.percent)))}%`, background: "var(--gradient-data, var(--color-primary))" }}
                />
              </span>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
