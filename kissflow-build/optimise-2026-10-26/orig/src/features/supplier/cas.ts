// Registry-number validation for the K2.1 composition table (local helper; no foundation equivalent).

/** CAS RN: 2–7 digits, 2 digits, 1 check digit. Check digit = Σ(digit × position from the right) mod 10. */
export function casError(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const m = /^(\d{2,7})-(\d{2})-(\d)$/.exec(v);
  if (!m) return "Use the CAS format 2–7 digits, 2 digits, check digit (e.g. 59-02-9)";
  const digits = (m[1] + m[2]).split("").reverse();
  const sum = digits.reduce((acc, d, i) => acc + Number(d) * (i + 1), 0);
  return sum % 10 === Number(m[3]) ? null : "The CAS check digit does not match. Please check for a typo";
}

/** EC number: 123-456-7. Check digit = Σ(digit × position from the left) mod 11 (10 is never issued). */
export function ecError(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const m = /^(\d{3})-(\d{3})-(\d)$/.exec(v);
  if (!m) return "Use the EC format 123-456-7";
  const sum = (m[1] + m[2]).split("").reduce((acc, d, i) => acc + Number(d) * (i + 1), 0);
  return sum % 11 === Number(m[3]) ? null : "The EC check digit does not match. Please check for a typo";
}
