// Seed supplier help articles (CIQP Help Article form). Draft wording, grounded in BRM v2; marked for BDF review.
// Idempotent: skips titles that already exist. node kissflow-build/ciq-supplier-portal/seed-help-articles.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
import { PORTAL } from "./portal-spec.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const state = JSON.parse(readFileSync(here("./build-state.json"), "utf8"));
const w = writer(here("./build-requests.jsonl"));
const A = w.acc, F = state.flows["CIQP Help Article"].id;
const DRAFT = "Draft text for review by Beiersdorf.\n\n";
const ARTICLES = [
  ["What is the CIQ?", "The Cosmetic Ingredient Questionnaire (CIQ) collects the information Beiersdorf needs to assess a raw material you supply: basic data, composition, origin and the supporting documents. Your Beiersdorf contact is named on your request."],
  ["How your questionnaire is put together", "Your answers to the basic data and configuration questions decide which sections apply to your material. Each section is marked Mandatory or Optional. If you change one of those answers later, or Beiersdorf asks for an additional part, new sections can be added to your questionnaire. Sections are never removed, so nothing you have entered is lost."],
  ["Completeness confirmation and final release", "When every mandatory section is complete, you confirm completeness. This is not the final release: you can still correct data and add documents while Beiersdorf reviews. When Beiersdorf asks you for the final release, you confirm it once. After the final release the questionnaire can no longer be changed."],
  ["Questions from Beiersdorf", "Each question from Beiersdorf is its own task with a due date and a link to the question or document it refers to. Answer it in the task. If a document is needed, upload it in the matching section of your questionnaire and refer to it in your answer. Beiersdorf may return a question with a comment if more information is needed."],
  ["Documents", "Upload documents in the questionnaire at the question they belong to. Every upload is kept with its file name and upload date. Uploads cannot be deleted; if a document changes, upload the new file as well."],
];
const list = await w.call("POST", `/form/2/${A}/${F}/list?page_number=1&page_size=100&_application_id=${PORTAL}`, {});
const have = new Set((Array.isArray(list.body) ? list.body : list.body?.Data || []).map((r) => r.Article_Title));
let order = 10;
for (const [title, body] of ARTICLES) {
  if (have.has(title)) { console.log(`skip (exists): ${title}`); order += 10; continue; }
  const cr = await w.call("POST", `/form/2/${A}/${F}?_application_id=${PORTAL}`, { Article_Title: title, Article_Body: DRAFT + body, Sort_Order: order });
  const sub = cr.body?._id ? await w.call("POST", `/form/2/${A}/${F}/${cr.body._id}/submit?_application_id=${PORTAL}`, {}) : { status: -1 };
  console.log(`${title} → draft ${cr.status}, submit ${sub.status}`);
  order += 10;
}
const back = await w.call("POST", `/form/2/${A}/${F}/list?page_number=1&page_size=100&_application_id=${PORTAL}`, {});
const rowsB = Array.isArray(back.body) ? back.body : back.body?.Data || [];
console.log(`read back: ${rowsB.length} articles → ${rowsB.sort((a, b) => a.Sort_Order - b.Sort_Order).map((r) => `${r.Sort_Order}:${r.Article_Title}`).join(" | ")}`);
