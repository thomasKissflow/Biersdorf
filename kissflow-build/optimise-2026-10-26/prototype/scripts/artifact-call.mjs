// Turns the single-file build of the client call view (dist-call/understanding-call.html) into the fragment the
// Artifact publisher expects: it adds its own doctype/html/head/body, so the file carries only <title> (first, the
// publisher scans the first 8 KB for it), <style>, the root element and the inline module script.
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(import.meta.dirname, "..", "dist-call");
const html = fs.readFileSync(path.join(dir, "understanding-call.html"), "utf8");

const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
const open = html.indexOf('<script type="module"');
const jsStart = html.indexOf(">", open) + 1;
const jsEnd = html.indexOf("</script>", jsStart); // inline JS can never contain a literal closing script tag
const styleOpen = html.indexOf("<style");
const cssStart = html.indexOf(">", styleOpen) + 1;
const cssEnd = html.indexOf("</style>", cssStart);
if (!title || open < 0 || jsEnd < 0 || styleOpen < 0 || cssEnd < 0) throw new Error("unexpected build output");

const out = [
  `<title>${title}</title>`,
  `<style>${html.slice(cssStart, cssEnd)}</style>`,
  `<div id="root"></div>`,
  `<script type="module">${html.slice(jsStart, jsEnd)}</script>`,
  "",
].join("\n");
const file = path.join(dir, "ciq-process-understanding.html");
fs.writeFileSync(file, out);
console.log(`artifact page: ${path.relative(process.cwd(), file)} (${Math.round(out.length / 1024)} KB, title "${title}")`);
