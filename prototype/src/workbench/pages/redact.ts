// Diagnostics redaction (§9): names become <person#n> and e-mails <email#n>, consistent within one copy, so a paste
// into project files never brings in real BDF people (ground rule 11). Pure; unit-tested.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const HAS_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
/** Keys whose string value is a person's name. Role entries are written as { id, role }, so they never match. */
const PERSON_KEY_RE = /^(name|Name|.*_Name|Full_Name|.*_By|Note_Author|Editing_By|Responsible_User)$/;

export function redactPeople(value: unknown, o: { includePeople?: boolean; knownNames?: string[]; knownEmails?: string[] } = {}): unknown {
  if (o.includePeople) return value;
  const names = new Map<string, string>();
  const emails = new Map<string, string>();
  const person = (s: string) => {
    if (!names.has(s)) names.set(s, `<person#${names.size + 1}>`);
    return names.get(s)!;
  };
  const email = (s: string) => {
    const k = s.toLowerCase();
    if (!emails.has(k)) emails.set(k, `<email#${emails.size + 1}>`);
    return emails.get(k)!;
  };
  for (const n of o.knownNames ?? []) if (n) person(n);
  for (const e of o.knownEmails ?? []) if (e) email(e);
  const scrub = (s: string): string => {
    let out = s.replace(EMAIL_RE, (m) => email(m));
    for (const [n, tag] of names) if (n.length > 2) out = out.split(n).join(tag);
    return out;
  };
  const walk = (v: unknown, key?: string): unknown => {
    if (typeof v === "string") return key && PERSON_KEY_RE.test(key) && !HAS_EMAIL.test(v) ? person(v) : scrub(v);
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x, k);
      return out;
    }
    return v;
  };
  // names first (so later free-text mentions are scrubbed with the same tags)
  const collect = (v: unknown, key?: string) => {
    if (typeof v === "string" && key && PERSON_KEY_RE.test(key) && !/@/.test(v)) person(v);
    else if (Array.isArray(v)) v.forEach((x) => collect(x));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) collect(x, k);
  };
  collect(value);
  return walk(value);
}
