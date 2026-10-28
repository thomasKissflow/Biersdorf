// One rendered sample of every mail the screens send (27 Oct), for opening in a browser: the app's (four to the
// supplier, the mention) and the supplier portal's (three to Beiersdorf), each built by the code that sends it, with
// fictional data (the demo's ZZT- cases, Solvaro and Beiersdorf people). Offline: nothing is sent, nothing is read.
//   node_modules/.bin/vite-node scripts/mail-samples.ts   → ../kissflow-build/mail-samples/*.html (+ index.html)
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emailText, escapeHtml, type EmailContent } from "@/domain/emailHtml";
import type { CiqCase, OpenPoint } from "@/domain/types";
import { MAILS, appHomeUrl, mentionContent, mentionMail } from "@/app-live/write/mail";
import { changeReportedMail, dataChangedMail, questionAnsweredMail } from "@/portal/data/mails";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(root, "../kissflow-build/mail-samples");

const C = { id: "ZZT-0003", materialName: "Tocopherol T-70" } as CiqCase;
const OP = {
  id: "OP-0003-02",
  question: "Which plant produces the batches you supply to us?\nPlease also give the plant's street address.",
  dueDate: "2026-11-12T00:00:00.000Z",
  ref: { sectionId: "GEN", label: "GEN › Manufacturing site" },
} as unknown as OpenPoint;
// the app's home page as appHomeUrl builds it in the Development sandbox (the host the mail hook's URL is built on)
const APP_HOME = appHomeUrl({ hookHost: `dev-beiersdorf.kissflow.${"eu"}` });
const CASE = { code: "ZZT-0003", trade: "Tocopherol T-70", supplier: "Solvaro Oleochemicals S.A.", by: "Elena Márquez" };
const NOTE = { writer: "Katrin Vogel", caseCode: "ZZT-0003", tradeName: "Tocopherol T-70", sectionCode: "K7", text: "@Ingrid Nolte please check the microbiology limits in K7.\nThe supplier's CoA shows TAMC < 100 CFU/g." };

const samples: { file: string; who: string; subject: string; body: string; content: EmailContent }[] = [
  { file: "app-question-changed.html", who: "App → supplier contacts", ...MAILS.edited(C, OP) },
  { file: "app-question-closed.html", who: "App → supplier contacts", ...MAILS.closed(C, OP) },
  { file: "app-case-cancelled.html", who: "App → supplier contacts", ...MAILS.cancelled(C) },
  { file: "app-release-withdrawn.html", who: "App → supplier contacts", ...MAILS.reopened(C) },
  { file: "app-mention.html", who: "App → mentioned colleague", ...mentionMail({ ...NOTE, link: APP_HOME }), content: mentionContent({ ...NOTE, link: APP_HOME }) },
  { file: "app-mention-no-link.html", who: "App → mentioned colleague (app address unknown)", ...mentionMail(NOTE), content: mentionContent(NOTE) },
  { file: "portal-data-changed.html", who: "Portal → RMM contact", ...dataChangedMail({ ...CASE, what: "uploaded a document" }) },
  { file: "portal-question-answered.html", who: "Portal → raiser and RMM contact", ...questionAnsweredMail({ ...CASE, question: OP.question, kind: "Document", answer: "Plant 2, Polígono Industrial Sur, Calle 4, 43006 Tarragona.\nThe signed site letter is attached.", attachment: "site-letter-plant-2.pdf" }) },
  { file: "portal-change-reported.html", who: "Portal → RMM contact", ...changeReportedMail({ ...CASE, text: "The antioxidant changes from batch 2611 on: mixed tocopherols instead of rosemary extract." }) },
];

mkdirSync(out, { recursive: true });
for (const s of samples) {
  writeFileSync(path.join(out, s.file), s.body);
  writeFileSync(path.join(out, s.file.replace(/\.html$/, ".txt")), `Subject: ${s.subject}\n\n${emailText(s.content)}\n`);
}
const rows = samples.map((s) => `<tr><td style="padding:6px 12px;"><a href="${s.file}">${escapeHtml(s.file)}</a></td><td style="padding:6px 12px;">${escapeHtml(s.who)}</td><td style="padding:6px 12px;">${escapeHtml(s.subject)}</td></tr>`).join("\n");
writeFileSync(
  path.join(out, "index.html"),
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>CIQ mail samples</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:24px;color:#1f2937;">
<h1 style="font-size:20px;">CIQ mail samples (fictional data, Kissflow-internal)</h1>
<p>Each file is the Body exactly as the screens post it to the mail integration; the .txt next to it is the plain-text alternative (not sent). Regenerate: <code>node_modules/.bin/vite-node scripts/mail-samples.ts</code> in prototype/.</p>
<table style="border-collapse:collapse;font-size:14px;"><tr><th align="left" style="padding:6px 12px;">File</th><th align="left" style="padding:6px 12px;">From → to</th><th align="left" style="padding:6px 12px;">Subject</th></tr>
${rows}
</table></body></html>
`,
);
console.log(`mail samples: ${samples.length} in ${path.relative(root, out)}`);
