#!/usr/bin/env node
// PreToolUse guard — hard-block Reads of files the conductor is meant to RUN or already KNOWS (settled
// facts in CONDUCTOR.md's "What you already know — do NOT go and look"). A prose rule was ignored: one
// measured express build spent ~9 minutes re-reading engine source (page-layouts, schema-from-ir,
// language-catalog) plus the 121k-token cookbook before it delegated. This makes the rule un-ignorable.
// Each block returns the SETTLED FACT so the conductor can proceed without the file. node scripts that
// read these via fs (slice-recipes, the engine itself) use the filesystem, not the Read tool, so they
// are unaffected. Everything not listed here is allowed (exit 0).
import { readFileSync } from "node:fs";

const RULES = [
  { re: /(^|\/)proto-kit\/COMPONENTS\.md$/,
    msg: "the ~121k-token component cookbook — never Read it (the single biggest context spend of a build). Each role sub-agent gets a per-role recipe SLICE via `node engine/proto-kit/slice-recipes.mjs`. Fan out the role agents instead of reading it yourself." },
  { re: /(^|\/)engine\/page-layouts\.mjs$/,
    msg: "the layout archetypes are a SETTLED FACT (CONDUCTOR.md): command · queue · intake · analytics · operations · board · directory · master-detail · calendar. If a sub-agent needs the full rules it imports `layoutBrief(id)` from this module — you do not read its source." },
  { re: /(^|\/)engine\/schema-from-ir\.mjs$/,
    msg: "RUN it (`node engine/schema-from-ir.mjs …`), do not read it. Its ids are settled: `flowId(name) = idify(name)+\"_A00\"`, `fieldId(name) = idify(name)`, where idify replaces every run of non-alphanumerics with a single \"_\"; role ids are `Ro_<slug>` placeholders that kf:sync replaces." },
  { re: /(^|\/)engine\/language-catalog\.mjs$/,
    msg: "the design anchor is a SETTLED FACT: `loadLanguages()[0]` is Beacon — the one and only entry. Pass it to `toDesignLanguage(anchor, opts)` for the design slice. Do not read the catalog to choose by hand; there is nothing to choose." },
];

let raw = "";
try { raw = readFileSync(0, "utf8"); } catch { process.exit(0); }
let d;
try { d = JSON.parse(raw || "{}"); } catch { process.exit(0); }

const fp = String(d?.tool_input?.file_path || d?.tool_input?.path || "");
for (const r of RULES) {
  if (r.re.test(fp)) {
    process.stderr.write(`BLOCKED (CONDUCTOR.md "do NOT go and look"): ${r.msg}`);
    process.exit(2);   // PreToolUse: exit 2 blocks the tool call; stderr becomes the reason shown to the model
  }
}
process.exit(0);
