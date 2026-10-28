// The data console's portal-user column on a CIQ Supplier item (26 Oct, Thomas): New case sends the questionnaire only
// to contacts whose row holds Contacts_Portal_User_Id (the contact's Kissflow portal user, "Us…"), and a contact's id in
// the CIQ screens IS that id (map/suppliersMap.ts contactIdOf). The generic child-row editor can set it too; this panel
// makes it the one obvious action: per contact row, Set / Change / Remove, validated (trimmed, a Kissflow user id:
// components/portalUser.tsx portalUserIdProblem; not held by another contact of this supplier), a removal confirmed
// first. The write is a Table::Contacts delta with only {_id, Contacts_Portal_User_Id}, then a read of the item that
// must hold it. Like every console write it leaves no history row (the CIQ supplier screens' editor writes one:
// write/actions.ts setContactPortalUser). Running cases keep the portal users they started with.
import { Link2, Unlink } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Mono, TextInput } from "@/components/ui";
import { CLEAR_PORTAL_USER, portalUserIdProblem } from "@/components/portalUser";
import { str, type RawItem } from "@/portal/data/raw";
import { errorText } from "@/portal/kf/sdk";
import { TABLES } from "../ids";
import type { AppClient } from "../types";
import { tableRows } from "./fields";

const MODEL = TABLES.contacts;
const FIELD = "Contacts_Portal_User_Id";

/** Writes one contact row's portal user (empty clears it) and reads the item back; throws when Kissflow does not hold
 *  it afterwards. Resolves with the item as read back. */
export async function writePortalUser(client: AppClient, itemId: string, rowId: string, value: string): Promise<RawItem> {
  const v = value.trim();
  const problem = portalUserIdProblem(v);
  if (problem) throw new Error(problem);
  await client.formUpdate("supplier", itemId, { [`Table::${MODEL}`]: [{ _id: rowId, [FIELD]: v }] });
  const back = await client.formGet("supplier", itemId);
  const row = tableRows(back, MODEL).find((r) => r._id === rowId);
  if (!row) throw new Error("The read-back does not show the contact row any more. Reload the item.");
  if (str(row, FIELD) !== v) throw new Error(`Saved, but the read-back holds ${str(row, FIELD) ? `“${str(row, FIELD)}”` : "no portal user"}.`);
  return back;
}

/** Why `value` can't be the row's portal user: its shape, or another contact row of the supplier already holds it. */
export function portalProblemIn(rows: Record<string, unknown>[], rowId: string, value: string): string | undefined {
  const v = value.trim();
  const shape = portalUserIdProblem(v);
  if (shape) return shape;
  const other = v ? rows.find((r) => r._id !== rowId && str(r, FIELD) === v) : undefined;
  return other ? `Already the portal user of ${str(other, "Contacts_Full_Name") || str(other, "Contacts_Email") || "another contact"}.` : undefined;
}

export function PortalUsersPanel({ client, item, onSaved }: { client: AppClient; item: RawItem; onSaved: (back: RawItem) => void }) {
  const rows = tableRows(item, MODEL);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (!rows.length) return null;
  const start = (rowId: string, cur: string) => {
    setEditing(rowId);
    setText(cur);
    setConfirm(false);
    setMessage(null);
  };
  const save = async (rowId: string, cur: string) => {
    const v = text.trim();
    if (v === cur) return setEditing(null);
    if (!v && !confirm) return setConfirm(true);
    setBusy(true);
    try {
      const back = await writePortalUser(client, item._id, rowId, v);
      setEditing(null);
      setMessage({ ok: true, text: v ? `Portal user ${v} saved and read back.` : "Portal user removed and read back." });
      onSaved(back);
    } catch (e) {
      setMessage({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-lg border border-line" data-testid="data-portal-users">
      <div className="border-b border-line px-3 py-2">
        <p className="text-[13px] font-semibold text-ink">Portal users</p>
        <p className="text-[12px] text-ink-3">New case sends the questionnaire only to contacts with a portal user (their Kissflow user id, Us…). Running cases keep the ones they started with.</p>
      </div>
      {message && (
        <p className={message.ok ? "px-3 pt-2 text-[12.5px] text-ok" : "px-3 pt-2 text-[12.5px] text-bad"} role={message.ok ? "status" : "alert"} data-testid="data-portal-message">
          {message.text}
        </p>
      )}
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const id = String(r._id ?? "");
          const cur = str(r, FIELD);
          const open = editing === id;
          const problem = open ? portalProblemIn(rows, id, text) : undefined;
          return (
            <li key={id} className="px-3 py-2.5" data-testid={`data-portal-row-${id}`} data-portal={cur}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-ink">{str(r, "Contacts_Full_Name") || "—"}</p>
                  <p className="truncate text-[12px] text-ink-3">{str(r, "Contacts_Email")}</p>
                </div>
                {cur ? <Mono>{cur}</Mono> : <Badge tone="warn">No portal user</Badge>}
                {!open && (
                  <Button size="sm" variant="ghost" icon={<Link2 size={14} />} onClick={() => start(id, cur)} data-testid={`data-portal-edit-${id}`}>
                    {cur ? "Change" : "Set portal user"}
                  </Button>
                )}
              </div>
              {open && (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-56 flex-1">
                      <TextInput
                        value={text}
                        onChange={(e) => {
                          setText(e.target.value);
                          setConfirm(false);
                        }}
                        placeholder="Us…"
                        className="font-mono"
                        spellCheck={false}
                        autoComplete="off"
                        invalid={!!problem}
                        aria-label={`Portal user of ${str(r, "Contacts_Full_Name")}`}
                        data-testid={`data-portal-input-${id}`}
                      />
                      {problem && <p className="mt-1 text-[12px] text-bad">{problem}</p>}
                    </div>
                    <Button size="sm" variant="primary" disabled={busy || !!problem} onClick={() => void save(id, cur)} data-testid={`data-portal-save-${id}`}>
                      {busy ? "Saving…" : confirm ? "Remove the link" : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    {cur && !confirm && (
                      <Button size="sm" variant="ghost" icon={<Unlink size={14} />} onClick={() => (setText(""), setConfirm(true))} data-testid={`data-portal-clear-${id}`}>
                        Remove
                      </Button>
                    )}
                  </div>
                  {confirm && (
                    <p className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-ink" role="alert" data-testid={`data-portal-clear-confirm-${id}`}>
                      {CLEAR_PORTAL_USER} Press “Remove the link” to confirm.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
