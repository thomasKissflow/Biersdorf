// Consistency rules that must hold after every action (requirements proposals §2). checkInvariants returns the
// violations in plain words; an empty list means the state is consistent. The unit tests call it after every scenario
// step, and the dev build may log it.

import { currentPair } from "./configActions";
import { verifyFinalDocument } from "./finalDocument";
import { isActiveUser, userOf } from "./permissions";
import { isClosed, scopeOf, supplierTasks, unresolved } from "./selectors";
import type { AppState, CiqCase } from "./types";

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

/** Every internal text of a case that must never reach a supplier (notes, RMES, findings, decisions, internal reasons). */
export function internalStrings(c: CiqCase): string[] {
  const out = [
    ...c.internalNotes.map((n) => n.text),
    ...(c.rmes?.criteria.map((x) => x.comment ?? "") ?? []),
    ...(c.rmes?.findings.map((f) => f.text) ?? []),
    ...c.reviews.map((r) => r.decisionReason ?? ""),
    ...c.reviews.map((r) => r.continueAfterRejection?.note ?? ""),
    ...c.openPoints.map((p) => p.closeReason ?? ""),
    ...c.openPoints.flatMap((p) => p.thread.filter((m) => m.action === "note").map((m) => m.text)),
    c.cancelled?.reason ?? "",
    ...c.confirmations.filter((x) => x.type === "cancellation").map((x) => x.note ?? ""),
  ];
  // Short or generic strings would match by accident ("Accepted.").
  return [...new Set(out.map((t) => t.trim()).filter((t) => t.length >= 12))];
}

export function checkInvariants(s: AppState): string[] {
  const v: string[] = [];
  const ids = new Set<string>();
  for (const c of s.cases) {
    const at = (m: string) => v.push(`${c.id}: ${m}`);
    if (ids.has(c.id)) at("duplicate case id");
    ids.add(c.id);
    const tracks = new Set(c.reviews.map((r) => r.dept));
    const opIds = new Set<string>();
    for (const p of c.openPoints) {
      if (opIds.has(p.id)) at(`duplicate open point ${p.id}`);
      opIds.add(p.id);
      if (!tracks.has(p.dept)) at(`${p.id} belongs to ${p.dept}, which has no track`);
      if (unresolved(p) && scopeOf(c, p.ref.sectionId)?.applicability === "na") at(`${p.id} is unresolved on the N.A. section ${p.ref.sectionId}`);
      if (p.status === "closed" && !p.outcome) at(`${p.id} is closed without an outcome`);
      if (p.thread[0]?.action !== "raised") at(`${p.id} has no "raised" entry first`);
    }
    for (const r of c.reviews) {
      if (r.status === "completed" && c.openPoints.some((p) => p.dept === r.dept && unresolved(p))) at(`${r.dept} is completed with an unresolved point`);
      if (!isClosed(c) && r.status === "waiting-supplier" && !c.openPoints.some((p) => p.dept === r.dept && p.status === "open")) at(`${r.dept} waits for the supplier without an open point`);
      if (!isClosed(c) && r.status !== "waiting-supplier" && r.status !== "completed" && c.openPoints.some((p) => p.dept === r.dept && p.status === "open")) at(`${r.dept} has a point with the supplier but is not waiting`);
    }
    const releases = c.confirmations.filter((x) => x.type === "final-release").length;
    if (c.phase === "review" && c.reviews.length > 0 && c.reviews.every((r) => r.status === "completed")) at("in review although every track has completed");
    if (c.phase === "final-release") {
      if (!c.reviews.length || c.reviews.some((r) => r.status !== "completed")) at("final-release with a track not completed");
      if (c.openPoints.some(unresolved)) at("final-release with an unresolved open point");
    }
    if (c.phase === "completed") {
      if (!c.finalDocument) at("completed without a final document");
      else if (!verifyFinalDocument(c.finalDocument)) at("the final document does not match its fingerprint");
      if (releases !== 1) at(`completed with ${releases} final-release confirmations`);
    } else if (c.finalDocument) at("has a final document but is not completed");
    if (c.phase === "cancelled") {
      if (c.openPoints.some(unresolved)) at("cancelled with an unresolved open point");
      if (supplierTasks(s, c.supplierId).some((t) => t.caseId === c.id)) at("cancelled but the supplier still has tasks");
      if (!c.cancelled) at("cancelled without a cancellation record");
    }
    if ((c.phase === "review" || c.phase === "final-release" || c.phase === "completed") && !c.confirmations.some((x) => x.type === "completeness")) at(`${c.phase} without a completeness confirmation`);
    for (const a of c.audit) if (!a.by || !ISO.test(a.at)) at(`audit event ${a.id} has no actor or no ISO time`);
    const auditIds = new Set(c.audit.map((a) => a.id));
    if (auditIds.size !== c.audit.length) at("duplicate audit ids");
    for (const id of c.supplierContactIds) {
      const u = userOf(s, id);
      if (!u || u.side !== "supplier" || u.supplierId !== c.supplierId) at(`case contact ${id} is not a contact of the case's supplier`);
    }
    if (!isClosed(c) && c.liveScope && !c.supplierContactIds.some((id) => isActiveUser(userOf(s, id)))) at("open case without an active contact");
    // Supplier mails never carry internal content.
    const secrets = internalStrings(c);
    for (const m of s.mails.filter((x) => x.audience === "supplier" && x.caseId === c.id)) {
      const hit = secrets.find((t) => m.body.includes(t) || m.subject.includes(t));
      if (hit) at(`supplier mail ${m.id} contains internal text “${hit.slice(0, 40)}”`);
      // lower case with /i: the same check, and the supplier portal's bundle (it holds this module) names no "RMES"
      if (/\brmes\b|internal note/i.test(m.body)) at(`supplier mail ${m.id} mentions internal terms`);
    }
  }
  const mailIds = new Set<string>();
  for (const m of s.mails) {
    if (mailIds.has(m.id)) v.push(`duplicate mail id ${m.id}`);
    mailIds.add(m.id);
    if (!m.to.length) v.push(`mail ${m.id} has no recipient`);
    for (const id of m.to) {
      const u = userOf(s, id);
      if (!u) v.push(`mail ${m.id} goes to the unknown user ${id}`);
      else if (u.side === "supplier" && m.audience !== "supplier") v.push(`internal mail ${m.id} goes to the supplier contact ${id}`);
      else if (u.side === "internal" && m.audience === "supplier") v.push(`supplier mail ${m.id} goes to the internal user ${id}`);
      else if (u.deactivatedAt && u.active === false && m.at > u.deactivatedAt) v.push(`mail ${m.id} went to ${u.name} after the deactivation`);
    }
  }
  for (const sup of s.suppliers) {
    if (!/^\d{9}$/.test(sup.duns)) v.push(`${sup.name}: DUNS is not 9 digits`);
    if (sup.active !== false && !s.users.some((u) => u.supplierId === sup.id && isActiveUser(u))) v.push(`${sup.name} has no active contact`);
  }
  // Configuration versions (spec §8.1): one draft at most; new cases use the newest published pair; every case of the
  // app's flow (liveScope) runs on a published pair.
  const cfg = s.config ?? { pairs: [] };
  if (cfg.pairs.filter((p) => p.status === "draft").length > 1) v.push("more than one draft configuration");
  if (cfg.pairs.some((p, i) => p.status === "draft" && i !== cfg.pairs.length - 1)) v.push("the draft configuration is not the newest pair");
  if (cfg.pairs.length && s.activeRuleSet !== currentPair(s).ruleSetVersion) v.push(`the active rule set ${s.activeRuleSet} is not the newest published one (${currentPair(s).ruleSetVersion})`);
  // A release changes the rules, the questionnaire or both (only the side that changed gets a new number), so a rule set
  // may be published with several questionnaire versions and the other way round: a case runs on a published PAIR.
  const pairs = [["RS-2026.1", "CIQ-2026 v1"], ...cfg.pairs.filter((p) => p.status === "published").map((p) => [p.ruleSet.version, p.template.version])];
  const published = new Set(pairs.map(([rs, tpl]) => `${rs}|${tpl}`));
  const publishedRuleSets = new Set(pairs.map(([rs]) => rs));
  if (published.size !== pairs.length) v.push("two published releases are the same pair of rule set and questionnaire");
  for (const c of s.cases.filter((x) => x.liveScope)) {
    if (!publishedRuleSets.has(c.ruleSetVersion)) v.push(`${c.id}: runs on ${c.ruleSetVersion}, which is not a published rule set`);
    else if (!published.has(`${c.ruleSetVersion}|${c.templateVersion}`)) v.push(`${c.id}: ${c.templateVersion} was never published with ${c.ruleSetVersion}`);
  }
  // Version numbers grow per side: a release never goes back to a lower number than the one before it.
  const no = (x: string) => Number(/(\d+)$/.exec(x)?.[1] ?? 0);
  for (let i = 1; i < pairs.length; i++) {
    if (no(pairs[i][0]) < no(pairs[i - 1][0]) || no(pairs[i][1]) < no(pairs[i - 1][1])) v.push(`release ${pairs[i].join(" + ")} has a lower number than ${pairs[i - 1].join(" + ")}`);
  }
  const duns = s.suppliers.map((x) => x.duns);
  if (new Set(duns).size !== duns.length) v.push("two suppliers share a DUNS number");
  // One e-mail is one person within a side: two Beiersdorf users, or two contacts of one supplier, never share one. The
  // same e-mail may be a Beiersdorf user and a supplier contact, or a contact at two suppliers (26 Oct,
  // suppliers.ts validateContact).
  const groups = new Map<string, string[]>();
  for (const u of s.users) {
    const mail = u.email.trim().toLowerCase();
    if (!mail) continue;
    const side = u.side === "supplier" ? `supplier:${u.supplierId ?? ""}` : "internal";
    groups.set(side, [...(groups.get(side) ?? []), mail]);
  }
  for (const [side, emails] of groups) if (new Set(emails).size !== emails.length) v.push(side === "internal" ? "two Beiersdorf users share an e-mail address" : `two contacts of ${side.slice(9) || "a supplier"} share an e-mail address`);
  return v;
}
