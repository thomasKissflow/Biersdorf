// artifact-ready.test.mjs — "there is something to show" must not mean "there is a file on THIS disk".
//
// Generate in Kissflow sat disabled under two green dots, telling someone it was "available once the
// prototype and blueprint are both generated" about two artifacts it was rendering at that moment
// (VaultOps, 2026-08-02). Two bugs pointing the same way:
//
//   · readiness checked `.path` only — a file from a run on the local disk. `runs/` is the Cloud Run
//     instance's own disk and does not survive a redeploy, so any session older than the last deploy
//     comes back with its artifacts served from the app's version history instead: `.abs`, never
//     `.path`. Every such session lost the Generate button permanently.
//   · the TAB DOT checked `.url`, which is the url-building FUNCTION every ART entry carries and is
//     therefore always truthy. The dot was green for artifacts that did not exist — so the two
//     signals disagreed instead of being wrong together, which is what made it read as a UI glitch
//     rather than a missing file.
//
// The predicate is extracted from ui.html rather than duplicated here: a copy would keep passing
// after the original changed, which for a one-line predicate is the whole risk.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const UI = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui.html"), "utf8");
const src = UI.match(/function hasArtifact\s*\([^)]*\)\s*\{[^}]*\}/);
assert.ok(src, "hasArtifact() must exist in ui.html — readiness is derived in exactly one place");
const hasArtifact = new Function(`${src[0]}; return hasArtifact;`)();

// what an ART entry looks like: `url`/`open` are always-present helpers, the rest are the real signals
const entry = (over = {}) => ({ path: null, abs: null, link: null, url: () => "/x", open: () => "/x", ...over });

test("an artifact counts when there is anything to show", () => {
  assert.equal(hasArtifact(entry({ path: "runs/app/prototype/index.html" })), true, "a file from a run on this disk");
  assert.equal(hasArtifact(entry({ abs: "/projects/p1/versions/3/prototype" })), true,
    "served from version history — the case a redeploy creates, and the one that was missed");
  assert.equal(hasArtifact(entry({ link: "https://dev-lcncdemo.kissflow.com/view/application/X" })), true, "the live Kissflow app");
});

test("an empty artifact does NOT count, despite carrying url helpers", () => {
  assert.equal(hasArtifact(entry()), false,
    "`url` is a function and always truthy — checking it turned every dot green");
  assert.equal(hasArtifact(null), false);
  assert.equal(hasArtifact(undefined), false);
});

test("Generate is offered for a session whose local run is gone", () => {
  // exactly the post-redeploy state: both artifacts resolve remotely, neither has a local path
  const ART = { prototype: entry({ abs: "/projects/p1/versions/3/prototype" }),
                blueprint: entry({ abs: "/projects/p1/versions/3/review" }),
                runtime: entry() };
  assert.equal(hasArtifact(ART.prototype) && hasArtifact(ART.blueprint), true,
    "the app is verified and buildable — the button must not claim it is not yet generated");
  assert.equal(hasArtifact(ART.runtime), false, "and it is still not built in Kissflow");
});

// A regenerated blueprint has to actually appear. `abs` is a fixed version-history URL with no
// cache-buster; once it was preferred over the local path the pane froze on that snapshot, so the
// builder would regenerate from review feedback, announce it in the chat, and the reader would still
// be looking at the version from before their feedback (VendorFlow, 2026-08-03). Any session older
// than a redeploy resolves remotely, so this hit every long-running app.
const paneSrcSrc = UI.match(/function paneSrc\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
assert.ok(paneSrcSrc, "paneSrc() must exist — the pane's URL precedence is asserted, not implied");
const paneSrc = new Function("verUrls", "versionUrl", `${paneSrcSrc[0]}; return paneSrc;`)(
  { blueprint: { 3: "/versions/3/review" } },
  (name, sid, ver) => `/projects/${sid}/versions/${ver}/${name}`,
);
const art = (over = {}) => ({ path: null, abs: null, url: (sid, t, p) => `/blueprint/${sid}/?v=${t}&p=${p}`, ...over });

test("a freshly built artifact wins over version history", () => {
  const both = art({ path: "runs/app/review.html", abs: "/projects/p1/versions/2/review" });
  assert.match(paneSrc(both, null, "blueprint", "s1"), /^\/blueprint\/s1\/\?v=\d+/,
    "the file this run just wrote, with a cache-buster — otherwise a regeneration is invisible");
});

test("history is used when there is no local file", () => {
  const remote = art({ abs: "/projects/p1/versions/2/review" });
  assert.equal(paneSrc(remote, null, "blueprint", "s1"), "/projects/p1/versions/2/review");
});

test("an explicitly chosen version overrides both", () => {
  const both = art({ path: "runs/app/review.html", abs: "/projects/p1/versions/2/review" });
  assert.equal(paneSrc(both, 3, "blueprint", "s1"), "/versions/3/review",
    "picking an earlier version from the dropdown is the one case that must not follow the latest build");
});
