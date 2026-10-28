import { MoreHorizontal, Plus, Paperclip, MessageCircle } from "lucide-react";
import { Card } from "./Cards.jsx";

/**
 * KanbanBoard — columns of cards.
 *
 * REDESIGNED 2026-08-13 from Board.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229): "Columns of cards. Each stage is a tinted well
 * in its own tone, so the board reads as stages at a glance — and the cards inside are the only
 * objects that lift." That is the one real change from the previous pass: the column used to be
 * a bare region; now it is a tinted well (`bg-<tone>-50`), and the cards inside it are white on
 * that tint — "the strongest card treatment available and it costs nothing." The layout law that
 * made the column bare in the first place still holds — see NEVER A CARD IN A CARD below, it is
 * just satisfied a different way now (tint vs. shadow separates the well from its cards, instead
 * of the column having no fill at all).
 *
 * TONE VOCABULARY IS TAILWIND'S OWN, NOT FOUNDATIONS'. Every other tinted surface in this kit
 * (StatusChip, the Card `tone` prop, StatTile's delta pill) reads `--color-<tone>-bg` /
 * `-ink`, Foundations' own 5-member semantic map (success/warning/info/danger/neutral). A board
 * column can't use that map — a stage's colour is picked per app by whoever configures the
 * board (could be 5 stages, could be 8), and "5 semantic tones" doesn't have room for that. So
 * the column tone (and the priority badge tone, and the owner-avatar tone below) is a Tailwind
 * palette name — "rose" / "amber" / "sky" / "emerald" / "slate" / … — resolved through the
 * static lookup below, never through a `--color-*` token. [SOURCE, Board.dc.html: "this page
 * contributes no colour of its own."]
 *
 * WHY A LOOKUP TABLE AND NOT A TEMPLATE STRING. `bg-${tone}-50` is invisible to Tailwind's JIT
 * scanner — it only ever sees the literal source text, never the runtime value — so a class built
 * that way compiles to nothing. TONE below is a plain object literal, every value a complete
 * static class string Tailwind's scanner can actually see (`@source "./**\/*.{js,jsx}"` in
 * shadcn.css). Extend the set by adding another literal-keyed row, never by interpolating one.
 *
 * NEVER A CARD IN A CARD. [SOURCE] "White on a tint is the strongest card treatment available and
 * it costs nothing… Card in a card — wrong: a shadow inside a shadow, white on white, every edge
 * competes." The card below is drawn inline rather than composed from this kit's own `Card`
 * (Cards.jsx) for exactly that reason plus a geometry mismatch: Cards.jsx's three padding roles
 * are 20/24/28px and its default shadow is `--shadow-panel`; Board.dc.html's card is 14px padding
 * and rests at `--shadow-contact`, a size and elevation neither role names. Minting a fourth pad
 * role on Cards.jsx to fit one caller was out of scope for this pass (that file is mid-migration
 * under its own docblock) — so the card here reproduces the same visual contract Card would
 * (`bg-surface` / `rounded-lg` / `shadow-contact→raised`) without calling the component.
 *
 * The COLUMN is still not a card itself — only the items inside it are. Composed from nothing
 * else in the kit for the same reason `Card`/`StatusChip`/`Avatar` don't fit the tone system
 * above: this page's whole point is that a board's colour is Tailwind's, not Foundations'.
 *
 * The board still SCROLLS HORIZONTALLY rather than wrapping — "a wrapped column changes which
 * column a card is in depending on viewport width, which is the one thing a board must never
 * do" — and is still presentational: no drag, no drop, no reordering, no grab cursor. "A board
 * that looks draggable and is not is worse than one that plainly is not." Wire it to a DnD
 * library when it goes on a real screen. The column's "…" menu and "Add task" row are the same
 * kind of affordance — visually present, not wired to a prop, because the API this page
 * describes names only `columns`, `items` and `onCardClick`.
 *
 * PRIORITY → TONE and OWNER → TONE are both [OURS]: Board.dc.html's own data uses High=rose /
 * Medium=amber / Low=blue, and no prior convention for either mapping existed on this component
 * (the previous version took `tone` as a bare per-item prop, which the new item shape drops).
 * Owner tone is derived from the name so the same person reads as the same colour across every
 * card, rather than every avatar landing on one flat colour or none at all.
 */

// Every column/priority/owner tone this board can render, as complete literal class strings —
// see "WHY A LOOKUP TABLE" above. `well`/`ink` are the -50/-700 pair Board.dc.html specs for both
// the column fill+heading and the priority badge; `dot` is the -500 step for the heading dot;
// `avatarBg` is a -100 tint (one step deeper than `well`, still paired with the same -700 `ink`)
// so an owner's initials stay legible on every tone — a solid -500 fill would read fine on rose
// but wash out white initials on amber/orange, and the tint pairing already used everywhere else
// in this file (badge, well+heading) has no such contrast problem to begin with.
const TONE = {
  rose: { well: "bg-rose-50", dot: "bg-rose-500", ink: "text-rose-700", avatarBg: "bg-rose-100" },
  amber: { well: "bg-amber-50", dot: "bg-amber-500", ink: "text-amber-700", avatarBg: "bg-amber-100" },
  sky: { well: "bg-sky-50", dot: "bg-sky-500", ink: "text-sky-700", avatarBg: "bg-sky-100" },
  emerald: { well: "bg-emerald-50", dot: "bg-emerald-500", ink: "text-emerald-700", avatarBg: "bg-emerald-100" },
  slate: { well: "bg-slate-50", dot: "bg-slate-500", ink: "text-slate-700", avatarBg: "bg-slate-100" },
  blue: { well: "bg-blue-50", dot: "bg-blue-500", ink: "text-blue-700", avatarBg: "bg-blue-100" },
  violet: { well: "bg-violet-50", dot: "bg-violet-500", ink: "text-violet-700", avatarBg: "bg-violet-100" },
  teal: { well: "bg-teal-50", dot: "bg-teal-500", ink: "text-teal-700", avatarBg: "bg-teal-100" },
  orange: { well: "bg-orange-50", dot: "bg-orange-500", ink: "text-orange-700", avatarBg: "bg-orange-100" },
  indigo: { well: "bg-indigo-50", dot: "bg-indigo-500", ink: "text-indigo-700", avatarBg: "bg-indigo-100" },
  gray: { well: "bg-gray-50", dot: "bg-gray-500", ink: "text-gray-700", avatarBg: "bg-gray-100" },
};
const TONE_NAMES = Object.keys(TONE);

// A column with no recognised tone still needs to look like a stage, not fall through to one flat
// grey column after another — "each stage is a tinted well in its own tone, so the board reads as
// stages at a glance" is the whole premise, and a caller that omits `tone` (or passes one of
// Foundations' success/warning/info/danger names, which this vocabulary doesn't read — see file
// banner) shouldn't silently flatten every column to the same colour. So an unmapped tone cycles
// through the palette by column INDEX instead — the same fallback legacy/tones.js's `toneAt`
// already uses for exactly this situation, just against this file's own tone table.
const toneOf = (name, i = 0) => TONE[name] ?? TONE[TONE_NAMES[i % TONE_NAMES.length]];

// [OURS] — see file banner. High/Medium/Low is Board.dc.html's own example data; matched
// case-insensitively so "High"/"high"/"HIGH" all resolve, since nothing in the item shape
// declares a casing contract. Any other priority string falls back to "slate" rather than a
// guessed colour.
const PRIORITY_TONE = { high: "rose", medium: "amber", low: "blue" };
const toneForPriority = (priority) => TONE[PRIORITY_TONE[String(priority).trim().toLowerCase()]] ?? TONE.slate;

// [OURS] — a stable hash so one owner keeps one colour across every card, without a `tone` field
// on the item (the new item shape doesn't carry one; only priority does).
function toneForOwner(name) {
  const s = String(name ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TONE[TONE_NAMES[h % TONE_NAMES.length]];
}

// "R. Iyer" -> RI, "Mary" -> MA. Local rather than Avatar.jsx's own `initialsFrom`: Avatar reads
// a different tone vocabulary (Foundations' success/warning/…, mid-migration on its own file) and
// this board's owner tint is Tailwind-native — see file banner — so the two don't compose.
function initials(name) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * columns: [{ key, label, tone, items: [{ id, title, note?, owner?, priority?, progress?, files?, comments? }] }]
 * tone drives the well fill, the heading ink+dot, and is the fallback priority colour source.
 * onCardClick(item, column) — when passed, cards get the hover lift + pointer cursor; without
 * it every card stays fully inert, per Board.dc.html's own "a panel that is not a target does
 * not respond at all."
 */
export function KanbanBoard({ columns = [], onCardClick, className = "" }) {
  if (!columns.length) return <p className="m-0 py-6 text-center text-sm text-text-muted">No columns.</p>;

  return (
    // min-h-[600px] — [OURS], on request. The board's own content can be as short as one column
    // with a couple of cards; without a floor the card was free to collapse to whatever the
    // shortest column needed, reading as a cramped strip rather than a board. Merged ahead of the
    // caller's className, same order Card's own signature composes an extra class in.
    <Card role="list" className={"min-h-[600px]" + (className ? " " + className : "")}>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {columns.map((col, i) => {
          const t = toneOf(col.tone, i);
          const items = col.items ?? [];
          return (
            <section key={col.key ?? col.label} className={"flex w-[258px] flex-none flex-col gap-3 rounded-xl p-3.5 " + t.well}>
              <header className="flex items-center justify-between gap-1 px-0.5">
                <span className={"flex min-w-0 items-center gap-2 text-[13px] font-medium " + t.ink}>
                  <span className={"h-[7px] w-[7px] flex-none rounded-full " + t.dot} aria-hidden="true" />
                  <span className="truncate">{col.label}</span>
                </span>
                <span className={"flex flex-none items-center gap-1.5 font-mono text-[11px] tabular-nums " + t.ink}>
                  {items.length}
                  <MoreHorizontal size={12} aria-hidden="true" />
                </span>
              </header>

              {items.length ? (
                <div className="flex flex-col gap-3">
                  {items.map((it) => (
                    <BoardCard key={it.id} item={it} column={col} onCardClick={onCardClick} />
                  ))}
                </div>
              ) : (
                <p className={"m-0 rounded-lg bg-white/60 px-4 py-8 text-center text-[13px] " + t.ink}>Nothing here</p>
              )}

              <div className={"flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium " + t.ink}>
                <Plus size={13} aria-hidden="true" />
                Add task
              </div>
            </section>
          );
        })}
      </div>
    </Card>
  );
}

function BoardCard({ item, column, onCardClick }) {
  const clickable = typeof onCardClick === "function";
  const prTone = item.priority ? toneForPriority(item.priority) : null;
  const ownerTone = item.owner ? toneForOwner(item.owner) : null;
  const hasProgress = item.progress != null;
  const progress = hasProgress ? Math.max(0, Math.min(100, Number(item.progress))) : 0;
  const complete = hasProgress && progress >= 100;
  // [SOURCE] "value ... colour = --color-text-muted at 0%, --color-secondary while in-flight,
  // emerald-700 at 100%" — the last step is Tailwind's own literal, not a token (see file banner).
  const progressInk = !hasProgress || progress <= 0 ? "text-text-muted" : complete ? "text-emerald-700" : "text-secondary";
  const files = Number(item.files) > 0 ? Number(item.files) : null;
  const comments = Number(item.comments) > 0 ? Number(item.comments) : null;
  const hasFooter = item.owner != null || files != null || comments != null;

  return (
    <article
      className={
        "flex flex-col gap-2.5 rounded-lg bg-surface p-3.5 shadow-contact " +
        // No border left to warm, so the whole response is shadow + a 2px lift — same
        // transition/curve as Cards.jsx's clickable Card, only applied at all when clickable.
        (clickable
          ? "cursor-pointer transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-0.5 hover:shadow-raised"
          : "")
      }
      onClick={clickable ? () => onCardClick(item, column) : undefined}
    >
      {item.priority && (
        <span className={"inline-flex h-5 w-fit flex-none items-center self-start rounded-sm px-2 text-[11px] font-medium " + prTone.well + " " + prTone.ink}>
          {item.priority}
        </span>
      )}

      <p className="m-0 text-[13px] font-medium leading-[1.4] text-secondary">{item.title}</p>
      {item.note && <p className="m-0 text-[11px] leading-[1.55] text-text-muted">{item.note}</p>}

      {hasProgress && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-text-muted">Progress</span>
            <span className={"font-mono text-[11px] font-medium tabular-nums " + progressInk}>{progress}%</span>
          </div>
          <div className="h-[5px] w-full overflow-hidden rounded-full bg-track">
            <div
              className={"h-full rounded-full " + (complete ? "bg-emerald-500" : "")}
              style={{ width: progress + "%", background: complete ? undefined : "var(--gradient-data)" }}
            />
          </div>
        </div>
      )}

      {hasFooter && (
        <div className="flex items-center justify-between gap-2 border-t border-gray-1 pt-2.5">
          {item.owner ? (
            <span
              className={"inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[9px] font-bold leading-none " + ownerTone.avatarBg + " " + ownerTone.ink}
              title={item.owner}
              aria-label={item.owner}
            >
              {initials(item.owner)}
            </span>
          ) : (
            <span aria-hidden="true" />
          )}
          <div className="flex flex-none items-center gap-1.5">
            {files != null && (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-gray-1 px-1.5 font-mono text-[11px] text-secondary">
                <Paperclip size={10} aria-hidden="true" />
                {files}
              </span>
            )}
            {comments != null && (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-gray-1 px-1.5 font-mono text-[11px] text-secondary">
                <MessageCircle size={10} aria-hidden="true" />
                {comments}
              </span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
