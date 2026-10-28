// Tablet check (UX-09 follow-up): codes never break inside ("SAF-A", "SUP-NWB", "REL-20261001-1"). Plain text with a
// code in it keeps its own wrapping; only the code itself is held together.
import { Fragment, type ReactNode } from "react";

/** A comma-joined list of codes ("GEN,K2.1,SAF-A,REG-B"): breaks only after a comma; the text stays the same. */
export function CodeList({ value, sep = "," }: { value: string; sep?: string }) {
  const parts = value.split(sep);
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <>
              {sep}
              <wbr />
            </>
          )}
          <span className="whitespace-nowrap">{p}</span>
        </Fragment>
      ))}
    </>
  );
}

// A code-like token: parts joined by "-" or "." with a digit or two capitals in it (SUP-NWB, CIQ-2026-Pk000014,
// K2.1, PS-05). Plain hyphenated words (sign-off, read-only, e-mail) stay breakable.
const TOKEN = /[A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)+/g;
const isCode = (t: string) => /[0-9]/.test(t) || /[A-Z]{2,}/.test(t);

/** Running text with every code in it held together, e.g. "Northwind Botanicals GmbH (SUP-NWB)". */
export function CodeText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (!isCode(m[0])) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={m.index} className="whitespace-nowrap">
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
