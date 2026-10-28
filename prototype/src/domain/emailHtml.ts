// One e-mail layout for every mail the screens send (27 Oct): the app's (src/app-live/write/mail.ts) and the supplier
// portal's (src/portal/data/mails.ts). Both post {To, Subject, Body} to the mail integration, whose "Send an email"
// step sends the Body as given (Body type HTML), so the Body is the whole message.
//
// Built for e-mail clients, not browsers: tables for the layout, every style inline (no <style> block, no external
// CSS, fonts or images), a system font stack, a 600 px column centred on a light grey page (a ghost table keeps it at
// 600 px in Outlook for Windows, which ignores max-width), a dark blue header band with the product name in text, a
// bulletproof button (a coloured table cell around the link) and a small grey footer. Every value is HTML-escaped and
// every character outside ASCII is written as a numeric reference, so the message reads the same whatever character
// set the mail pipeline assumes. Pure: no I/O, no imports, safe for both bundles.

/** A label/value row of the details table. Rows with an empty value are left out. */
export interface EmailDetail {
  label: string;
  value?: string;
}

/** A quoted block of free text (the question, the answer, the note, the change report): line breaks are kept. */
export interface EmailQuote {
  label?: string;
  text: string;
}

/** The call to action: shown only when `href` is an absolute https URL (safeHttpsUrl). */
export interface EmailButton {
  label: string;
  href: string;
}

/** What one mail says; everything is plain text (the layout escapes it). */
export interface EmailContent {
  /** The mail's purpose, as its heading. */
  title: string;
  /** One sentence under the heading. */
  intro: string;
  /** Facts as label/value rows (case code, trade name, due date, section…). */
  details?: EmailDetail[];
  /** Free text, each in its own quoted block. */
  quotes?: EmailQuote[];
  /** Plain sentences after the details and the quotes (e.g. where to see more). */
  notes?: string[];
  button?: EmailButton;
  /** Who the message is for, as a footer line (EMAIL_AUDIENCE). */
  audience?: string;
}

export const EMAIL_BRAND = "CIQ Digital";
export const EMAIL_TAGLINE = "Beiersdorf · Cosmetic Ingredient Questionnaire";
export const EMAIL_FOOTER = "Sent automatically by CIQ Digital. Please do not reply to this e-mail.";
/** The footer's audience lines. */
export const EMAIL_AUDIENCE = {
  /** A mail about an internal note (to Beiersdorf colleagues). */
  internalNotes: "Internal notes are for Beiersdorf only; the supplier never sees them.",
  /** A mail to the supplier's contacts. */
  supplier: "This message concerns your CIQ request with Beiersdorf.",
} as const;

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes &, <, >, " and ' (text and attribute values alike). */
export const escapeHtml = (v: string): string => String(v).replace(/[&<>"']/g, (ch) => ESC[ch]!);

/** Every character outside ASCII as a numeric character reference ("á" → "&#225;", an emoji as one reference). */
export const asciiOnly = (html: string): string => html.replace(/[^\x00-\x7f]/gu, (ch) => `&#${ch.codePointAt(0)};`);

/** A value as it appears in the Body: escaped, outside ASCII as references, line breaks as <br>. */
export const htmlText = (v: string): string => asciiOnly(escapeHtml(v)).replace(/\r\n?|\n/g, "<br>");

/** An absolute https URL that is safe in an href (no space, quote or angle bracket, a host), else undefined. */
export function safeHttpsUrl(v: string | undefined): string | undefined {
  const s = (v ?? "").trim();
  if (!/^https:\/\/[^\s"'<>`]+$/i.test(s)) return undefined;
  try {
    return new URL(s).hostname ? s : undefined;
  } catch {
    return undefined;
  }
}

const has = (s: string | undefined): s is string => typeof s === "string" && s.trim().length > 0;
const detailsOf = (x: EmailContent) => (x.details ?? []).filter((d) => has(d.label) && has(d.value));
const quotesOf = (x: EmailContent) => (x.quotes ?? []).filter((q) => has(q.text));
const notesOf = (x: EmailContent) => (x.notes ?? []).filter(has);
const buttonOf = (x: EmailContent) => {
  const href = safeHttpsUrl(x.button?.href);
  return href && has(x.button?.label) ? { label: x.button.label, href } : undefined;
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const C = {
  page: "#f1f3f6",
  card: "#ffffff",
  band: "#0b2a5b",
  bandText: "#ffffff",
  bandSub: "#c9d6ec",
  title: "#0b2a5b",
  ink: "#1f2937",
  ink2: "#374151",
  muted: "#5b6472",
  line: "#e3e7ee",
  quoteBg: "#f4f7fb",
  quoteBar: "#0b2a5b",
};
const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';
const text = (size: number, line: number, color: string, extra = "") => `font-family:${FONT};font-size:${size}px;line-height:${line}px;color:${color};${extra}`;

function detailsHtml(rows: EmailDetail[]): string {
  if (!rows.length) return "";
  const tr = rows
    .map((d, i) => {
      const top = i === 0 ? "" : `border-top:1px solid ${C.line};`;
      return `<tr><td valign="top" width="36%" style="${top}padding:9px 12px;${text(13, 19, C.muted)}">${htmlText(d.label)}</td><td valign="top" style="${top}padding:9px 12px;${text(14, 20, C.ink, "font-weight:600;word-break:break-word;")}">${htmlText(d.value!)}</td></tr>`;
    })
    .join("");
  return `<table ${TABLE} width="100%" style="width:100%;margin:0 0 20px;border:1px solid ${C.line};border-radius:6px;border-collapse:separate;">${tr}</table>`;
}

function quoteHtml(q: EmailQuote): string {
  const label = has(q.label) ? `<p style="margin:0 0 6px;${text(12, 16, C.muted, "font-weight:600;text-transform:uppercase;letter-spacing:0.04em;")}">${htmlText(q.label)}</p>` : "";
  return `${label}<table ${TABLE} width="100%" style="width:100%;margin:0 0 20px;"><tr><td bgcolor="${C.quoteBg}" style="background-color:${C.quoteBg};border-left:4px solid ${C.quoteBar};padding:12px 16px;${text(15, 22, C.ink, "word-break:break-word;")}">${htmlText(q.text)}</td></tr></table>`;
}

function buttonHtml(b: { label: string; href: string }): string {
  const href = escapeHtml(b.href);
  return (
    `<table ${TABLE} style="margin:4px 0 16px;"><tr><td align="center" bgcolor="${C.band}" style="background-color:${C.band};border-radius:6px;mso-padding-alt:12px 24px;">` +
    `<a href="${href}" target="_blank" style="display:inline-block;padding:12px 24px;${text(15, 20, C.bandText, "font-weight:600;text-decoration:none;border-radius:6px;")}">${htmlText(b.label)}</a></td></tr></table>` +
    `<p style="margin:0 0 4px;${text(12, 18, C.muted, "word-break:break-all;")}">If the button does not work, copy this address into your browser: ${htmlText(b.href)}</p>`
  );
}

/** The mail's Body: a whole HTML document (see the header). */
export function emailHtml(x: EmailContent): string {
  const details = detailsOf(x);
  const quotes = quotesOf(x);
  const notes = notesOf(x);
  const button = buttonOf(x);
  const para = (s: string, last = false) => `<p style="margin:${last ? "0" : "0 0 16px"};${text(15, 22, C.ink2)}">${htmlText(s)}</p>`;
  const body =
    `<h1 style="margin:0 0 12px;${text(20, 28, C.title, "font-weight:700;")}">${htmlText(x.title)}</h1>` +
    para(x.intro, !details.length && !quotes.length && !notes.length && !button) +
    detailsHtml(details) +
    quotes.map(quoteHtml).join("") +
    notes.map((n, i) => para(n, i === notes.length - 1 && !button)).join("") +
    (button ? buttonHtml(button) : "");
  const footer = [EMAIL_FOOTER, ...(has(x.audience) ? [x.audience] : [])].map((l, i, all) => `<p style="margin:${i === all.length - 1 ? "0" : "0 0 4px"};${text(12, 18, C.muted)}">${htmlText(l)}</p>`).join("");
  const html =
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">` +
    `<title>${htmlText(x.title)}</title></head>` +
    `<body style="margin:0;padding:0;width:100%;background-color:${C.page};">` +
    `<table ${TABLE} width="100%" bgcolor="${C.page}" style="width:100%;background-color:${C.page};"><tr><td align="center" style="padding:24px 12px;">` +
    `<!--[if mso]><table ${TABLE} width="600" align="center"><tr><td><![endif]-->` +
    `<table ${TABLE} width="100%" style="width:100%;max-width:600px;">` +
    `<tr><td bgcolor="${C.band}" style="background-color:${C.band};padding:18px 28px;border-radius:8px 8px 0 0;">` +
    `<p style="margin:0;${text(18, 24, C.bandText, "font-weight:700;letter-spacing:0.01em;")}">${htmlText(EMAIL_BRAND)}</p>` +
    `<p style="margin:2px 0 0;${text(12, 18, C.bandSub)}">${htmlText(EMAIL_TAGLINE)}</p></td></tr>` +
    `<tr><td bgcolor="${C.card}" style="background-color:${C.card};padding:28px;border-radius:0 0 8px 8px;">${body}</td></tr>` +
    `<tr><td style="padding:16px 28px 0;">${footer}</td></tr>` +
    `</table><!--[if mso]></td></tr></table><![endif]-->` +
    `</td></tr></table></body></html>`;
  return asciiOnly(html);
}

/** The same message as plain text (for a client or integration that takes a text part; the mail integration sends
 *  the Body only). */
export function emailText(x: EmailContent): string {
  const out: string[] = [`${EMAIL_BRAND} | ${EMAIL_TAGLINE}`, "", x.title, "", x.intro];
  const details = detailsOf(x);
  if (details.length) out.push("", ...details.map((d) => `${d.label}: ${d.value!.replace(/\r\n?|\n/g, " ")}`));
  for (const q of quotesOf(x)) out.push("", ...(has(q.label) ? [`${q.label}:`] : []), ...q.text.split(/\r\n?|\n/).map((l) => `> ${l}`));
  const notes = notesOf(x);
  if (notes.length) out.push("", ...notes);
  const button = buttonOf(x);
  if (button) out.push("", `${button.label}: ${button.href}`);
  out.push("", "--", EMAIL_FOOTER, ...(has(x.audience) ? [x.audience] : []));
  return out.join("\n");
}
