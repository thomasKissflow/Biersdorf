// _schema.mjs — the shape of a catalog entry, and the shared helpers every category file uses.
//
// ONE SOURCE, TWO ARTIFACTS. Before this, the component cookbook (COMPONENTS.md) and the visual
// gallery (component-gallery.html) were maintained by hand, separately, and had already drifted —
// the gallery was missing recipes the cookbook had, and neither knew about the 17 components the
// starter kit ships. Both are now GENERATED from the entries in this directory by gen-catalog.mjs,
// so a component cannot exist in one and not the other.
//
// STRUCTURE MIRRORS THE STARTER KIT, deliberately. starter/src/pages/*.jsx renders one component per
// page through gallery-kit.jsx's chrome — GalleryPage › Entry › Specimen — with an Entry carrying a
// prop table. proto-kit reproduces that structure exactly; the ONE permitted difference is substance:
// starter has a real React component with props, proto-kit has an HTML snippet with data bindings.
// Hence `bindings` where starter has props (user decision D2, 2026-08-09 — see STARTER-PARITY.md).

/**
 * @typedef {object} Binding    one row of the SEED-bindings table (proto-kit's answer to a prop table)
 * @property {string} field     the SEED path the markup reads, e.g. "item.status"
 * @property {string} type      "string" | "number" | "date" | "enum" | "array<Item>" …
 * @property {string} example   a real value, not a placeholder — what the specimen actually renders
 * @property {string} note      what it drives in the markup
 *
 * @typedef {object} Specimen   one live example, mirroring starter's <Specimen label>
 * @property {string} label     the mono caption above it
 * @property {string} html      the snippet, verbatim — this is what an assembling agent copies
 * @property {boolean} [bare]   true = renders itself (Card, KanbanBoard); false/absent = wrap in PrimitiveCard
 *
 * @typedef {object} Entry
 * @property {string} id        kebab-case, the anchor and the nav key
 * @property {string} name      the display name, e.g. "StatTile"
 * @property {string} category  one of CATEGORIES
 * @property {string} summary   one line — what it is, in the Entry header beside the name
 * @property {string} [blurb]   page-level prose under the title (starter's GalleryPage blurb)
 * @property {string} [footer]  closing rationale (starter's GalleryPage footer)
 * @property {Binding[]} [bindings]
 * @property {Specimen[]} specimens
 * @property {string} [starterTwin]  the kit/ component this mirrors, "" if proto-kit-only
 */

// starter/lib/nav.json's own grouping, reproduced so the two catalogs read the same way.
// "Diagnostics" is deliberately absent — it holds starter's old-vs-new bench, which has no
// prototype equivalent. "Behaviour" IS here: CountUp, toast, CustomEmbed and StoresMap are
// product behaviour rather than surface, and a prototype needs every one of them (a figure that
// settles, a confirmation after an action, an embed, a location list).
//
// This list is load-bearing in a way that fails silently: gen-catalog builds its output by
// mapping over CATEGORIES, so an entry whose `category` is not in it is never selected — while
// lint-catalog still checks it and reports clean. The entry passes every gate and then does not
// exist in either artifact. Adding a category here is the FIRST step of adding one anywhere.
export const CATEGORIES = ["Data", "Controls", "Surfaces", "Identity", "Process", "Behaviour"];

/** Escape a snippet for embedding inside a <pre> code block in the generated HTML. */
export const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Strip the common leading indent so a template literal reads correctly in both artifacts. */
export const dedent = (s) => {
  const lines = String(s).replace(/^\n/, "").replace(/\s+$/, "").split("\n");
  const indent = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length)
  );
  return lines.map((l) => l.slice(indent)).join("\n");
};
