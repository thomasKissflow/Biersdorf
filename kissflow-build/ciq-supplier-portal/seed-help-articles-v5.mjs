// v5 (14 Oct): the supplier Help FAQs for the one-item flow, word for word from the finalised prototype
// (prototype/src/features/supplier/SupplierHelp.tsx, FAQS_LIVE). The live portal UI shows these rows as its FAQ list.
// Replaces the 7 Oct draft articles: rows whose title is not in the v5 set are deleted, the v5 set is upserted by title.
//   node kissflow-build/ciq-supplier-portal/seed-help-articles-v5.mjs [--dry-run]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
import { PORTAL } from "./portal-spec.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const state = JSON.parse(readFileSync(here("./build-state.json"), "utf8"));
const w = writer(here("./build-requests.jsonl"));
const A = w.acc, F = state.flows["CIQP Help Article"].id;
const DRY = process.argv.includes("--dry-run");

const ARTICLES = [
  ["Why do I only see some sections?", "Your questionnaire follows your answers to the metadata questions and the target markets set by Beiersdorf. Sections open and close as you answer, and answers in a section that closes are kept. After you confirm completeness, a changed answer can only add sections. If Beiersdorf needs more later, you get a task for it."],
  ["Who sees my answers?", "Your answers and documents are visible to the contacts Beiersdorf named on the request and to the Beiersdorf teams that review the raw material. Other suppliers, and colleagues who are not named on the request, never see it. Beiersdorf's internal notes and assessments are not shown in the portal."],
  ["What if I cannot provide a document or an answer?", "Use “Cannot provide? Add a justification” at the question and explain why. A justification counts as answered for the completeness check; Beiersdorf decides whether it is acceptable and may ask a follow-up question. When Beiersdorf asks you a question, you can also answer “We cannot provide this” with a reason."],
  ["Where do I upload documents?", "Always at the question the document belongs to, in the questionnaire. When you answer a Beiersdorf question with a document, it is stored there too, and your reply refers to it. New files are added next to earlier ones with their upload date; nothing is overwritten."],
  ["Can several colleagues work on the same request?", "Yes. Every contact Beiersdorf named on the request can work on it at the same time. Each answer and document shows who entered it and when. To add or replace a contact, ask your Beiersdorf contact."],
  ["Who confirms completeness and gives the final release?", "Any contact Beiersdorf named on the request who may confirm for your company. Each confirmation is recorded with name, role, e-mail and time. A completeness confirmation is not an approval by Beiersdorf."],
  ["Which e-mails will I get?", "Every contact named on a request gets the same e-mails:\n• the invitation when Beiersdorf sends you a request;\n• a new question from Beiersdorf, or one it returns because it needs more information;\n• a question Beiersdorf changed or closed (no answer needed);\n• one request for your final release when Beiersdorf has completed its review, and a note if that request is withdrawn because a review was reopened;\n• a receipt after your final release;\n• reminders before and after a due date;\n• a note when Beiersdorf withdraws or reactivates a request.\nEach e-mail links straight to the item in the portal. Beiersdorf's internal assessments are never sent to you."],
  ["What about deadlines and reminders?", "Each request and each question has a due date, shown on your tasks. You get a reminder e-mail before a task is due and when it is overdue; your Beiersdorf contact is informed if it stays open longer."],
  ["Can I change an answer after confirming completeness?", "Yes, until you give the final release: correct data and add documents directly in the questionnaire. Beiersdorf's reviewers are told about each change, and a changed metadata answer can then only add sections. After the release the questionnaire is frozen; to report a change, use “Report a change” on the released request."],
];

const listRows = async () => { const r = await w.call("POST", `/form/2/${A}/${F}/list?page_number=1&page_size=100&_application_id=${PORTAL}`, {}); return Array.isArray(r.body) ? r.body : r.body?.Data || []; };
const before = await listRows();
const want = new Map(ARTICLES.map(([t, b], i) => [t, { body: b, order: (i + 1) * 10 }]));
for (const row of before.filter((r) => !want.has(r.Article_Title))) {
  if (DRY) { console.log(`would delete: ${row.Article_Title}`); continue; }
  const d = await w.call("DELETE", `/form/2/${A}/${F}/${row._id}?_application_id=${PORTAL}`);
  console.log(`delete "${row.Article_Title}" → ${d.status}`);
}
for (const [title, { body, order }] of want) {
  const row = before.find((r) => r.Article_Title === title);
  if (DRY) { console.log(`would ${row ? "update" : "create"}: ${order} ${title}`); continue; }
  if (row) {
    const u = await w.call("POST", `/form/2/${A}/${F}/${row._id}?_application_id=${PORTAL}`, { Article_Body: body, Sort_Order: order });
    console.log(`update "${title}" → ${u.status}`);
  } else {
    const cr = await w.call("POST", `/form/2/${A}/${F}?_application_id=${PORTAL}`, { Article_Title: title, Article_Body: body, Sort_Order: order });
    const sub = cr.body?._id ? await w.call("POST", `/form/2/${A}/${F}/${cr.body._id}/submit?_application_id=${PORTAL}`, {}) : { status: -1 };
    console.log(`create "${title}" → draft ${cr.status}, submit ${sub.status}`);
  }
}
const after = (await listRows()).sort((a, b) => a.Sort_Order - b.Sort_Order);
const ok = after.length === ARTICLES.length && ARTICLES.every(([t, b], i) => after[i]?.Article_Title === t && after[i]?.Article_Body === b);
console.log(`read back: ${after.length} articles, ${ok ? "MATCH (titles, bodies, order)" : "MISMATCH"} → ${after.map((r) => `${r.Sort_Order}:${r.Article_Title}`).join(" | ")}`);
