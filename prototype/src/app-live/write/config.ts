// The live configuration editor of the Business administrator (DESIGN §6 "Configuration", 26 Oct). Owner C.
// The store (api.ts) has already run the pure domain action (configActions.ts / actions.ts: config.manage, the draft
// rules, validation, the change note); a writer persists `next` as rows of the app form CIQ Config Version
// (CIQ_Config_Version_A00; kissflow-build/CONFIGURATION-GUIDE.md), serialised byte-identically to the seed
// (write/configRows.ts), and found by Config_Key among the load's rows (LiveIndex.configRows; a key the load did not
// see sends one fresh list, so a row written by a job queued earlier or by another session is found, never twinned).
// Every row write is read back until it holds what was sent (writeVerified), and its content must still match its
// Content_Hash (fingerprintProblem): a mismatch is a failure. Rows are never deleted.
//   createDraft     RS, TPL, then REL of the new pair as Draft (REL last: it is what makes the draft appear). A
//                   discarded row of the same key (Retired, no Published_At) or a leftover Draft RS/TPL row is reused;
//                   a published one never is; a Draft REL row in Kissflow means a draft exists already (stale).
//   draft edits     (rules, sections, fields, move, retire/restore) only the draft rows whose content differs from the
//                   stored row: RS/TPL Payload_JSON + Content_Hash, REL the bundle, manifest and both hashes; REL last.
//   discardDraft    RS, TPL, then REL → Config_State "Retired" with no Published_At (configFromRows fix a: a discarded
//                   draft); REL last, so a partial discard leaves the draft visible to discard again.
//   publish         (publishDraft, publishTemplateV2) RS, then TPL, then REL → "Published" with Published_At (Kissflow
//                   DateTime), Change_Note and Published_By; the REL row LAST (a case can only start on a Published
//                   REL), so RS/TPL published without it are harmless and Publish again finishes. Only the side that
//                   changed is a new version (configActions publishDraft): a kept side's published row stays as it is
//                   (created only when missing), the draft REL row takes the result's key ("RS-2026.3 + v2" for the
//                   working "RS-2026.3 + v3") and the kept side's working-number draft row is retired afterwards
//                   (housekeeping; a failure is a warning). A questionnaire release that sets section owners writes
//                   OWN:current after the release (a failure is a warning: the release is live).
//   setOwnership    OWN:current (Payload_JSON + Content_Hash; created when missing), then the draft rows when the draft's
//                   section followed the setting.
//   updateReminder  REM:current, the same way.
// One CIQ Audit Event row per committed change, in the supplier-master style (no case, category "Configuration", the
// domain's log entries in Snapshot_JSON.log, the rows written in Snapshot_JSON.config): config.draft.created,
// config.draft.discarded, config.published, config.ownership.changed, config.reminders.changed. A draft edit writes
// none [decision]: it is not a committed configuration (no case can use a draft), and the config.published row lists
// what the draft changed (Snapshot_JSON.config.changes) besides the domain's change summary. Its log line therefore
// lasts until the next read.
// Texts: a refusal of the Business administrator's form rights (a 0503xx code, a "permission" text) reads the same in
// both environments: Kissflow refused, ask the app admin to grant create and edit on CIQ Config Version (dev adds
// Kissflow's answer); every other cause is plain in production (userText.ts) with the raw one in `detail`.
import { currentPair, draftChanges, draftPair, pairLabel, shortTemplate } from "@/domain/configActions";
import { UNDEFINED_ORIGINS } from "@/domain/rules";
import type { AppState, ConfigPair } from "@/domain/types";
import { canonicalJson } from "@/portal/data/bundle";
import { str, type RawItem } from "@/portal/data/raw";
import { errorText, type KfData } from "@/portal/kf/sdk";
import { kfUserIdOf } from "../identity";
import { kfCode } from "../kf/client";
import type { ConfigSnapshot } from "../map/auditMap";
import type { AuditCode, ConfigMethod, LiveWriters, WriteCtx, WriteResult, Writer } from "../types";
import { PlainError, errorFor, trimEnd } from "../userText";
import { newLog, recordAudit, work, type Work } from "./audit";
import { CONFIG_KEY, fingerprintProblem, pairRows, singletonRow, type ConfigRowState, type PairRows } from "./configRows";
import { StaleError, firstThen, missingOf, writeVerified } from "./verify";

/** The StoreApi methods these writers serve (the guard and the store use it). */
export const CONFIG_METHODS: ReadonlySet<ConfigMethod> = new Set<ConfigMethod>(["createDraft", "discardDraft", "upsertRule", "deleteRule", "upsertSection", "retireSection", "restoreSection", "upsertField", "moveField", "removeField", "publishDraft", "publishTemplateV2", "setOwnership", "updateReminder"]);
export const isConfigMethod = (m: string): m is ConfigMethod => CONFIG_METHODS.has(m as ConfigMethod);

/** The user's texts (both environments; no Kissflow code, flow or field name). */
export const CONFIG_TEXT = {
  rights: "Kissflow refused to save the configuration for your role. Ask the app admin to grant Business administrator create and edit on the CIQ Config Version form.",
  rejected: "Kissflow refused to save the configuration: it did not accept the row. Ask the app admin to check that Business administrator may create and edit on the CIQ Config Version form, and that its Config State list offers Draft, Published and Retired.",
  fingerprint: "Kissflow did not keep the configuration exactly as it was sent. Reload and check it before you go on.",
  draftGone: "The draft changed in Kissflow in the meantime (it was published or discarded). It has been reloaded; check it and try again.",
  draftExists: "A draft was created in Kissflow in the meantime. It has been reloaded; work in that draft, or discard it first.",
  draftNotLoaded: "The draft is not fully loaded. Reload and try again.",
  numberTaken: (version: string) => `${version} is already published in Kissflow, so the new draft can't use that number. Reload and try again.`,
  releaseTaken: (label: string) => `${label} is already published in Kissflow. Reload and check the versions before you publish.`,
  retryCreate: "No draft is shown yet: create the new version again to finish.",
  retryEdit: "Save the change again to finish.",
  retryDiscard: "The draft is still shown: discard it again to finish.",
  retryPublish: (current: string) => `The release is not published, so new cases still start on ${current}. Publish again to finish.`,
  retryOwners: "The draft still shows the earlier owners for this section.",
  ownersNotSaved: (label: string, why: string) => `${label} is published and new cases use it, but the section owners were not saved (${why}). Set them again under Section owners.`,
  keptDiffers: (version: string) => `The published ${version} in Kissflow differs from the copy this release keeps; ask the app admin to compare them.`,
  housekeeping: (version: string, why: string) => `The unused draft number ${version} could not be retired (${why}); it does no harm.`,
} as const;

// ---------------------------------------------------------------------------------- causes

const RIGHTS = /permission|not authori[sz]ed|forbidden|access denied|\b403\b/i;
/** The Business administrator's form rights refused the write (or the read): a 0503xx refusal other than 050312's
 *  validation, or a permission text. */
export function isRightsRefusal(e: unknown): boolean {
  const code = kfCode(e) ?? "";
  const t = errorText(e);
  if (code === "050312") return RIGHTS.test(t);
  if (code.startsWith("0503")) return true;
  return /PermissionDenied/i.test(t) || (!code && RIGHTS.test(t));
}
/** Kissflow's validation refused the row (050312 without a permission text): a list value it does not have, … */
export const isRejectedRow = (e: unknown): boolean => kfCode(e) === "050312" && !RIGHTS.test(errorText(e));

/** A row read back whose content does not match its Content_Hash (or its manifest). */
export class FingerprintError extends Error {
  constructor(
    readonly key: string,
    readonly problem: string,
  ) {
    super(`Kissflow did not keep ${key} as sent: ${problem}.`);
  }
}

/** The cause for this environment: the rights / rejection texts in both; otherwise raw in dev, plain in prod. */
function configCause(env: WriteCtx["env"], e: unknown): { text: string; raw?: string } {
  const raw = trimEnd(errorText(e));
  const dev = (text: string) => (env === "prod" ? { text, raw } : { text: `${trimEnd(text)} (${raw}).`, raw });
  if (isRightsRefusal(e)) return dev(CONFIG_TEXT.rights);
  if (isRejectedRow(e)) return dev(CONFIG_TEXT.rejected);
  if (e instanceof FingerprintError) return env === "prod" ? { text: CONFIG_TEXT.fingerprint, raw } : { text: `${raw}.` };
  const shown = errorFor(env, e);
  return env === "prod" ? { text: shown, ...(shown !== raw ? { raw } : {}) } : { text: /[.!?]$/.test(shown.trim()) ? shown : `${trimEnd(shown)}.` };
}

// ---------------------------------------------------------------------------------- one job

interface CW extends Work {
  /** What the user does to finish when a later step fails (said after "Not finished: …"). */
  retry?: string;
}
type Extra = Partial<Pick<WriteResult, "message" | "tone">> | void;
const detailOf = (raw: (string | undefined)[]): { detail?: string } => {
  const d = raw.filter(Boolean).join(" ");
  return d ? { detail: d } : {};
};

/** Runs a configuration writer body: a failure is a not-ok result; nothing moves a step (the store shows the
 *  read-backs). What already reached Kissflow stays and is named, with what to do to finish. */
async function attemptConfig(ctx: Pick<WriteCtx, "env">, body: (w: CW) => Promise<Extra>): Promise<WriteResult> {
  const w: CW = work();
  try {
    const extra = (await body(w)) ?? {};
    return { ok: true, handoffs: [], warnings: w.warnings, saved: w.saved, ...(w.auditRow ? { auditRow: w.auditRow } : {}), moved: false, ...detailOf(w.details), ...extra };
  } catch (e) {
    const base = { ok: false, handoffs: [], warnings: w.warnings, moved: false };
    if (e instanceof StaleError) return { ...base, tone: "danger", message: e.message };
    const c = configCause(ctx.env, e);
    const detail = detailOf([c.raw && c.raw !== c.text ? c.raw : undefined, ...w.details]);
    if (w.done.length) return { ...base, tone: "warning", message: `${w.done.join(" ")} Not finished: ${c.text}${w.retry ? ` ${w.retry}` : ""}`, ...detail };
    return { ...base, tone: "danger", message: `Not saved: ${c.text}`, ...detail };
  }
}

// ---------------------------------------------------------------------------------- the rows

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};
const stamp = (r: RawItem) => time(str(r, "_modified_at") || str(r, "_created_at"));
/** Config_State; a blank state reads as Published (map/config.ts stateOf). */
const stateOfRow = (r: RawItem): string => str(r, "Config_State").trim() || "Published";
const isDraftRow = (r: RawItem) => stateOfRow(r) === "Draft";
/** A discarded draft row: Retired without Published_At (map/config.ts fix a). */
const isDiscarded = (r: RawItem) => stateOfRow(r) === "Retired" && !str(r, "Published_At");
/** Published, or a superseded published row (Retired with Published_At). */
const isPublishedRow = (r: RawItem) => !isDraftRow(r) && !isDiscarded(r);

/** The CIQ Config Version rows of one job by Config_Key (the newest row of a key), from the load, with one fresh list
 *  for a key the load did not see. */
class ConfigRows {
  private readonly byKey = new Map<string, RawItem>();
  private listed = false;
  constructor(private readonly ctx: WriteCtx) {
    this.load(ctx.index.configRows ?? []);
  }
  private load(rows: readonly RawItem[]): void {
    this.byKey.clear();
    for (const r of [...rows].sort((a, b) => stamp(a) - stamp(b))) if (str(r, "Config_Key")) this.byKey.set(str(r, "Config_Key"), r);
  }
  /** Every row as Kissflow lists them now. */
  async refresh(): Promise<void> {
    this.load(await this.ctx.client.formList("config"));
    this.listed = true;
  }
  async find(key: string): Promise<RawItem | undefined> {
    if (!this.byKey.has(key) && !this.listed) await this.refresh();
    return this.byKey.get(key);
  }
  all(): RawItem[] {
    return [...this.byKey.values()];
  }
  /** A row as read back after a write (its key may have changed: the release of a kept side). */
  put(row: RawItem): void {
    for (const [k, r] of this.byKey) if (r._id === row._id) this.byKey.delete(k);
    this.byKey.set(str(row, "Config_Key"), row);
  }
}

const pick = (data: KfData, keys: string[]): KfData => Object.fromEntries(keys.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]));

interface RowWrite {
  key: string;
  /** The fields an existing row must hold. */
  data: KfData;
  /** The whole row, when a missing one is created. */
  create?: KfData;
  /** Why the row as Kissflow has it now must not be written (a StaleError), else undefined. */
  may?: (cur: RawItem) => string | undefined;
  /** A further check of the read-back (why it is wrong). */
  check?: (back: RawItem) => string | undefined;
}

/** One row: created when missing (`create`), else updated by its id after a fresh read (`may`); read back until it
 *  holds `data` (only what is missing is sent); its content must match its fingerprint. Kept in `w.saved`. */
async function writeRow(ctx: WriteCtx, w: Work, rows: ConfigRows, x: RowWrite): Promise<RawItem> {
  const cur = await rows.find(x.key);
  let id: string;
  let data: KfData;
  let read: () => Promise<RawItem>;
  if (!cur) {
    if (!x.create) throw new PlainError(CONFIG_TEXT.draftNotLoaded);
    data = x.create;
    id = await ctx.client.formCreate("config", data);
    read = () => ctx.client.formGet("config", id);
  } else {
    id = cur._id;
    data = x.data;
    const now = await ctx.client.formGet("config", id);
    const why = x.may?.(now);
    if (why) throw new StaleError(why);
    read = firstThen(now, () => ctx.client.formGet("config", id));
  }
  const back = await writeVerified(
    read,
    (c) => ctx.client.formUpdate("config", id, pick(data, missingOf(data, c))),
    (b) => missingOf(data, b),
  );
  const bad = (await fingerprintProblem(back)) ?? x.check?.(back);
  if (bad) throw new FingerprintError(x.key, bad);
  w.saved.push({ flow: "config", item: back });
  rows.put(back);
  return back;
}

/** A singleton (OWN:current, REM:current): Payload_JSON + Content_Hash; the whole row when it is missing. */
async function writeSingleton(ctx: WriteCtx, w: Work, rows: ConfigRows, key: string, payload: unknown): Promise<RawItem> {
  const full = await singletonRow(key, payload, { publishedAt: ctx.now(), changeNote: "Set in CIQ Digital." });
  return writeRow(ctx, w, rows, { key, data: pick(full, ["Payload_JSON", "Content_Hash"]), create: full });
}

// ---------------------------------------------------------------------------------- a pair as rows

const undefinedOriginsOf = (ctx: WriteCtx): string[] => {
  const u = ctx.index.settings.undefinedOrigins;
  return Array.isArray(u) && u.every((x) => typeof x === "string") ? (u as string[]) : [...UNDEFINED_ORIGINS];
};
/** A person on a row as Kissflow knows them: the acting user's alias ("u-admin") is their Kissflow id. */
const kfIdOf = (ctx: WriteCtx, id: string): string => (!id || id === "system" ? id : kfUserIdOf(id, ctx.identity));

/** The three rows of a domain pair in a state (Published_At and Published_By only once published). */
function rowsOfPair(ctx: WriteCtx, p: ConfigPair, state: ConfigRowState): Promise<PairRows> {
  const pub = state !== "Draft";
  return pairRows({
    ruleSet: p.ruleSet,
    template: p.template,
    state,
    ...(pub && p.publishedAt ? { publishedAt: p.publishedAt } : {}),
    ...(pub && p.publishedBy ? { publishedBy: kfIdOf(ctx, p.publishedBy) } : {}),
    changeNote: p.changeNote,
    basedOn: p.basedOn,
    note: p.note,
    createdAt: p.createdAt,
    createdBy: kfIdOf(ctx, p.createdBy),
    undefinedOrigins: undefinedOriginsOf(ctx),
  });
}

const workingPair = (p: ConfigPair) => ({ ruleSetVersion: p.ruleSet.version, templateVersion: p.template.version });
const labelOf = (p: ConfigPair) => pairLabel(p.ruleSet.version, p.template.version);
const CONTENT: Record<"rs" | "tpl" | "rel", string[]> = { rs: ["Payload_JSON", "Content_Hash"], tpl: ["Payload_JSON", "Content_Hash"], rel: ["Release_Bundle_JSON", "Content_Hash", "Release_Manifest_JSON", "Manifest_Hash"] };
const mustBeDraft = (c: RawItem) => (isDraftRow(c) ? undefined : CONFIG_TEXT.draftGone);

/** The draft's rows whose content differs from the stored row, written RS, TPL, then REL (missing ones created as
 *  Draft). Returns the keys written. */
async function syncDraft(ctx: WriteCtx, w: CW, rows: ConfigRows, d: ConfigPair): Promise<string[]> {
  const r = await rowsOfPair(ctx, d, "Draft");
  // the release first, as Kissflow has it now: a draft published or discarded meanwhile gets no write at all
  const relRow = await rows.find(r.keys.rel);
  if (!relRow) throw new PlainError(CONFIG_TEXT.draftNotLoaded);
  if (!isDraftRow(await ctx.client.formGet("config", relRow._id))) throw new StaleError(CONFIG_TEXT.draftGone);
  const out: string[] = [];
  for (const side of ["rs", "tpl", "rel"] as const) {
    const key = r.keys[side];
    const stored = await rows.find(key);
    if (stored && str(stored, "Content_Hash") === r.hashes[side] && isDraftRow(stored)) continue;
    await writeRow(ctx, w, rows, { key, data: pick(r[side], CONTENT[side]), create: r[side], may: mustBeDraft });
    out.push(key);
  }
  return out;
}

/** Snapshot_JSON.config: the rows this job wrote. */
const snapOf = (w: Work, subject: string, changes?: ConfigSnapshot["changes"]): ConfigSnapshot => ({
  subject,
  rows: w.saved.filter((s) => s.flow === "config").map((s) => ({ key: str(s.item, "Config_Key"), itemId: s.item._id, state: stateOfRow(s.item), hash: str(s.item, "Content_Hash") })),
  ...(changes ? { changes } : {}),
});

const audit = (ctx: WriteCtx, w: Work, prev: AppState, next: AppState, code: AuditCode, object: { kind: string; key: string; itemId?: string; state?: string }, config: ConfigSnapshot, what: string) =>
  recordAudit(ctx, w, { code, object, ...(object.itemId ? { ref: { flow: "config" as const, itemId: object.itemId } } : {}), entries: [], log: newLog(prev, next), snapshot: { config } }, what, []);

const need = <T>(v: T | undefined | null, text: string): T => {
  if (v === undefined || v === null) throw new PlainError(text);
  return v;
};

// ---------------------------------------------------------------------------------- the writers

const createDraft: Writer = (ctx, prev, next) =>
  attemptConfig(ctx, async (w) => {
    const d = need(draftPair(next), CONFIG_TEXT.draftNotLoaded);
    const label = labelOf(d);
    const r = await rowsOfPair(ctx, d, "Draft");
    // a fresh list: never a twin of a row an earlier job or another session wrote
    const rows = new ConfigRows(ctx);
    await rows.refresh();
    if (rows.all().some((x) => str(x, "Config_Kind") === "Release" && isDraftRow(x))) throw new StaleError(CONFIG_TEXT.draftExists);
    const reusable = (version: string) => (c: RawItem) => (isDraftRow(c) || isDiscarded(c) ? undefined : CONFIG_TEXT.numberTaken(version));
    w.retry = CONFIG_TEXT.retryCreate;
    await writeRow(ctx, w, rows, { key: r.keys.rs, data: r.rs, create: r.rs, may: reusable(d.ruleSet.version) });
    w.done.push(`Rule set ${d.ruleSet.version} of the new draft was saved.`);
    await writeRow(ctx, w, rows, { key: r.keys.tpl, data: r.tpl, create: r.tpl, may: reusable(d.template.version) });
    w.done.push(`Questionnaire ${shortTemplate(d.template.version)} of the new draft was saved.`);
    const rel = await writeRow(ctx, w, rows, { key: r.keys.rel, data: r.rel, create: r.rel, may: reusable(label) });
    await audit(ctx, w, prev, next, "config.draft.created", { kind: "Configuration draft", key: label, itemId: rel._id, state: "Draft" }, snapOf(w, label), `The draft ${label}`);
  });

/** Every draft edit (rules, sections, fields, order, retire/restore): the changed draft rows; no audit row. */
const draftEdit: Writer = (ctx, _prev, next) =>
  attemptConfig(ctx, async (w) => {
    const d = need(draftPair(next), CONFIG_TEXT.draftNotLoaded);
    w.retry = CONFIG_TEXT.retryEdit;
    const rows = new ConfigRows(ctx);
    await syncDraft(ctx, w, rows, d);
  });

const discardDraft: Writer = (ctx, prev, next) =>
  attemptConfig(ctx, async (w) => {
    const d = need(draftPair(prev), CONFIG_TEXT.draftNotLoaded);
    const label = labelOf(d);
    const rows = new ConfigRows(ctx);
    const keys = { rs: CONFIG_KEY.ruleSet(d.ruleSet.version), tpl: CONFIG_KEY.template(d.template.version), rel: CONFIG_KEY.release(workingPair(d)) };
    if (!(await rows.find(keys.rel))) throw new PlainError(CONFIG_TEXT.draftNotLoaded);
    const retire = (key: string) =>
      writeRow(ctx, w, rows, {
        key,
        data: { Config_State: "Retired" },
        may: (c) => (isDraftRow(c) || isDiscarded(c) ? undefined : CONFIG_TEXT.draftGone),
        // a Retired row with a Published_At reads as a superseded published pair (map/config.ts fix a)
        check: (b) => (str(b, "Published_At") ? "the discarded row has a Published_At" : undefined),
      });
    w.retry = CONFIG_TEXT.retryDiscard;
    for (const key of [keys.rs, keys.tpl]) if (await rows.find(key)) await retire(key);
    if (w.saved.length) w.done.push("Part of the draft was retired.");
    const rel = await retire(keys.rel);
    await audit(ctx, w, prev, next, "config.draft.discarded", { kind: "Configuration draft", key: label, itemId: rel._id, state: "Retired" }, snapOf(w, label), `Discarding the draft ${label}`);
  });

/** publishDraft and publishTemplateV2 (the domain publishes the prepared v2 through publishDraft). */
const publish: Writer = (ctx, prev, next) =>
  attemptConfig(ctx, async (w) => {
    const d = need(draftPair(prev), CONFIG_TEXT.draftNotLoaded);
    const p = need(next.config.pairs[prev.config.pairs.indexOf(d)], CONFIG_TEXT.draftNotLoaded);
    if (p.status !== "published") throw new PlainError(CONFIG_TEXT.draftNotLoaded);
    const label = labelOf(p);
    const before = currentPair(prev);
    const pub = await rowsOfPair(ctx, p, "Published");
    const working = { rs: CONFIG_KEY.ruleSet(d.ruleSet.version), tpl: CONFIG_KEY.template(d.template.version), rel: CONFIG_KEY.release(workingPair(d)) };
    // only the side that changed keeps the draft's own (working) number (configActions publishDraft)
    const changed = { rs: p.ruleSet.version === d.ruleSet.version, tpl: p.template.version === d.template.version };
    const rows = new ConfigRows(ctx);
    const relDraft = await rows.find(working.rel);
    if (!relDraft) throw new PlainError(CONFIG_TEXT.draftNotLoaded);
    if (pub.keys.rel !== working.rel) {
      const other = await rows.find(pub.keys.rel);
      if (other && other._id !== relDraft._id && isPublishedRow(other)) throw new PlainError(CONFIG_TEXT.releaseTaken(label));
    }
    const STATE = ["Config_State", "Published_At", "Change_Note", "Published_By"];
    w.retry = CONFIG_TEXT.retryPublish(pairLabel(before.ruleSetVersion, before.templateVersion));
    // 1. the rule set, 2. the questionnaire
    for (const side of ["rs", "tpl"] as const) {
      const version = side === "rs" ? p.ruleSet.version : p.template.version;
      const what = side === "rs" ? `Rule set ${version}` : `Questionnaire ${shortTemplate(version)}`;
      if (changed[side]) {
        // a retry finds it published already, with the same content
        const may = (c: RawItem) => (isDraftRow(c) || (isPublishedRow(c) && str(c, "Content_Hash") === pub.hashes[side]) ? undefined : CONFIG_TEXT.draftGone);
        await writeRow(ctx, w, rows, { key: working[side], data: pick(pub[side], [...CONTENT[side], ...STATE]), create: pub[side], may });
        w.done.push(`${what} is marked published.`);
        continue;
      }
      // a kept side: its published row (an earlier release's) stays as it is
      const kept = await rows.find(pub.keys[side]);
      if (!kept) await writeRow(ctx, w, rows, { key: pub.keys[side], data: pub[side], create: pub[side] });
      else if (str(kept, "Content_Hash") !== pub.hashes[side]) w.warnings.push(CONFIG_TEXT.keptDiffers(version));
    }
    // 3. the release, LAST: from now on New case starts on it
    const rel = await writeRow(ctx, w, rows, { key: working.rel, data: pub.rel, may: mustBeDraft });
    delete w.retry;
    w.done.push(`${label} is published.`);
    // housekeeping: the kept side's working-number draft row (never a release's)
    for (const side of ["rs", "tpl"] as const) {
      if (changed[side] || working[side] === pub.keys[side]) continue;
      const row = await rows.find(working[side]);
      if (!row || !isDraftRow(row)) continue;
      try {
        await writeRow(ctx, w, rows, { key: working[side], data: { Config_State: "Retired" }, may: mustBeDraft, check: (b) => (str(b, "Published_At") ? "the retired row has a Published_At" : undefined) });
      } catch (e) {
        w.warnings.push(CONFIG_TEXT.housekeeping(side === "rs" ? d.ruleSet.version : shortTemplate(d.template.version), configCause(ctx.env, e).text.replace(/\.$/, "")));
      }
    }
    // 4. the section owners a questionnaire release sets (configActions publishDraft)
    if (canonicalJson(prev.ownership) !== canonicalJson(next.ownership)) {
      try {
        await writeSingleton(ctx, w, rows, CONFIG_KEY.ownership, { ownership: next.ownership });
      } catch (e) {
        w.warnings.push(CONFIG_TEXT.ownersNotSaved(label, configCause(ctx.env, e).text.replace(/\.$/, "")));
      }
    }
    // 5. one history line, with what the draft changed
    const ch = draftChanges(prev);
    const ids = (xs: { sectionId: string; fieldId: string }[]) => xs.map((f) => `${f.sectionId}/${f.fieldId}`);
    const changes: ConfigSnapshot["changes"] = ch ? { rules: ch.rules, sections: ch.sections, fields: { added: ids(ch.fields.added), changed: ids(ch.fields.changed), removed: ids(ch.fields.removed) } } : undefined;
    await audit(ctx, w, prev, next, "config.published", { kind: "Configuration release", key: label, itemId: rel._id, state: "Published" }, snapOf(w, label, changes), `The release ${label}`);
  });

const setOwnership: Writer = (ctx, prev, next) =>
  attemptConfig(ctx, async (w) => {
    const rows = new ConfigRows(ctx);
    const own = await writeSingleton(ctx, w, rows, CONFIG_KEY.ownership, { ownership: next.ownership });
    w.done.push("The section owners were saved.");
    // the draft's section follows the setting unless the draft changed its owners itself (actions.ts setOwnership)
    const d = draftPair(next);
    if (d && d !== draftPair(prev)) {
      w.retry = CONFIG_TEXT.retryOwners;
      await syncDraft(ctx, w, rows, d);
    }
    await audit(ctx, w, prev, next, "config.ownership.changed", { kind: "Section ownership", key: CONFIG_KEY.ownership, itemId: own._id }, snapOf(w, CONFIG_KEY.ownership), "The change of section owners");
  });

const updateReminder: Writer = (ctx, prev, next) =>
  attemptConfig(ctx, async (w) => {
    const rows = new ConfigRows(ctx);
    const rem = await writeSingleton(ctx, w, rows, CONFIG_KEY.reminders, { reminders: next.reminders });
    await audit(ctx, w, prev, next, "config.reminders.changed", { kind: "Reminders", key: CONFIG_KEY.reminders, itemId: rem._id }, snapOf(w, CONFIG_KEY.reminders), "The reminder change");
  });

/** One writer per configuration method (DESIGN §6 "Configuration"). */
export const configWriters: Required<Pick<LiveWriters, ConfigMethod>> = {
  createDraft,
  discardDraft,
  upsertRule: draftEdit,
  deleteRule: draftEdit,
  upsertSection: draftEdit,
  retireSection: draftEdit,
  restoreSection: draftEdit,
  upsertField: draftEdit,
  moveField: draftEdit,
  removeField: draftEdit,
  publishDraft: publish,
  publishTemplateV2: publish,
  setOwnership,
  updateReminder,
};
