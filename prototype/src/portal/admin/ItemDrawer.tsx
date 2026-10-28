// One portal item, read through the admin route. Edit scalar business fields (admin update, then read back and
// compare) or delete the item (then confirm it is gone). Users, child tables and system fields are read-only.
// Kissflow leaves never-filled fields out of an item, so the editor also offers every scalar field seen on other
// items of the same process (knownFields), empty, so an admin can fill one in.
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Drawer, Field, Mono, Modal, TextArea, TextInput } from "@/components/ui";
import type { FlowKey } from "../kf/portal";
import { errorText } from "../kf/sdk";
import { str, type RawItem } from "../data/raw";
import { usePortalMode } from "../mode";
import { KEY_FIELD, statusTone } from "./common";

const isScalar = (v: unknown) => v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
const isBusiness = (k: string) => !k.startsWith("_") && k !== "Name";
const show = (v: unknown) => (v == null ? "" : typeof v === "string" ? v : JSON.stringify(v, null, 2));

export function ItemDrawer({ flow, id, knownFields = [], onClose, onChanged }: { flow: FlowKey; id: string | null; knownFields?: string[]; onClose: () => void; onChanged: () => void }) {
  const { client } = usePortalMode();
  const [item, setItem] = useState<RawItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** The item on screen now: answers for an earlier item (a slow read, a save) are ignored. */
  const current = useRef(id);
  current.current = id;

  useEffect(() => {
    setItem(null);
    setError(null);
    setEditing(false);
    setMessage(null);
    setBusy(false);
    setConfirmDelete(false);
    if (!id || !client) return;
    let live = true;
    client
      .adminGet(flow, id)
      .then((x) => live && setItem(x))
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [client, flow, id]);

  const present = item ? Object.entries(item).filter(([k]) => isBusiness(k)) : [];
  const missing = item ? knownFields.filter((k) => isBusiness(k) && !(k in item)).map((k): [string, unknown] => [k, undefined]) : [];
  const fields = [...present, ...missing];
  const system = item ? Object.entries(item).filter(([k]) => k.startsWith("_")) : [];
  const startEdit = () => {
    setDraft(Object.fromEntries(fields.filter(([, v]) => isScalar(v)).map(([k, v]) => [k, v == null ? "" : String(v)])));
    setEditing(true);
    setMessage(null);
  };

  const save = async () => {
    if (!item || !client || !id || item._id !== id) return;
    const target = id;
    const changed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(draft)) {
      const orig = item[k];
      if ((orig == null ? "" : String(orig)) === v) continue; // unchanged, including a missing field left empty
      changed[k] = typeof orig === "number" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v;
    }
    if (!Object.keys(changed).length) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await client.adminUpdate(flow, target, changed);
      onChanged(); // refresh the list even if the drawer is closed meanwhile
      const back = await client.adminGet(flow, target);
      if (current.current !== target) return; // the drawer moved on: the list is already refreshing
      const differ = Object.keys(changed).filter((k) => String(back[k] ?? "") !== String(changed[k]));
      setItem(back);
      setEditing(false);
      setMessage(differ.length ? { ok: false, text: `Saved, but the read-back differs for: ${differ.join(", ")}` } : { ok: true, text: `Saved and read back (${Object.keys(changed).length} field${Object.keys(changed).length === 1 ? "" : "s"}).` });
    } catch (e) {
      if (current.current === target) setMessage({ ok: false, text: errorText(e) });
    } finally {
      if (current.current === target) setBusy(false);
    }
  };

  const remove = async () => {
    if (!client || !id || item?._id !== id) return;
    const target = id;
    setBusy(true);
    try {
      await client.adminDelete(flow, target);
      onChanged(); // refresh the list even if the drawer is closed meanwhile
      // Read back: the item itself means it's still there; "not found" means gone; any other failure can't confirm.
      let outcome: "gone" | "still there" | "unconfirmed" = "gone";
      try {
        const back = await client.adminGet(flow, target);
        outcome = back._is_deleted ? "gone" : "still there";
      } catch (e) {
        outcome = /not ?found|01015|050201|404/i.test(errorText(e)) ? "gone" : "unconfirmed";
      }
      if (current.current !== target) return;
      setConfirmDelete(false);
      if (outcome === "gone") onClose();
      else setMessage({ ok: false, text: outcome === "still there" ? "The delete was accepted, but the item can still be read." : "The delete was sent, but it could not be confirmed. Reload the list to check." });
    } catch (e) {
      if (current.current === target) {
        setMessage({ ok: false, text: errorText(e) });
        setConfirmDelete(false);
      }
    } finally {
      if (current.current === target) setBusy(false);
    }
  };

  return (
    <>
      <Drawer
        open={!!id}
        onClose={onClose}
        width={640}
        title={item ? str(item, KEY_FIELD[flow]) || item._id : "Item"}
        subtitle={item ? `${str(item, "_current_step") || "—"} · ${item._id}` : undefined}
        footer={
          item && (
            <div className="flex w-full flex-wrap items-center gap-2">
              {editing ? (
                <>
                  <Button variant="primary" disabled={busy} onClick={() => void save()}>
                    {busy ? "Saving…" : "Save changes"}
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button icon={<Pencil size={15} />} onClick={startEdit}>
                  Edit fields
                </Button>
              )}
              <Button variant="ghost" className="ml-auto text-bad" icon={<Trash2 size={15} />} onClick={() => setConfirmDelete(true)}>
                Delete item
              </Button>
            </div>
          )
        }
      >
        {error && <p className="text-[13px] text-bad">{error}</p>}
        {!item && !error && <p className="text-[13px] text-ink-3">Loading…</p>}
        {item && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(str(item, "_status"))} dot>
                {str(item, "_status")}
              </Badge>
              <span className="text-[12.5px] text-ink-3">{str(item, "Case_Code")}</span>
            </div>
            {message && <p className={message.ok ? "text-[13px] text-ok" : "text-[13px] text-bad"}>{message.text}</p>}
            <div className="space-y-3">
              {fields.map(([k, v]) =>
                editing && k in draft ? (
                  <Field key={k} label={k}>
                    {(draft[k] ?? "").length > 80 || /JSON$|Text$/.test(k) ? <TextArea value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className="min-h-[90px] font-mono text-[12px]" /> : <TextInput value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />}
                  </Field>
                ) : (
                  <div key={k}>
                    <div className="text-[12px] font-medium text-ink-3">{k}</div>
                    <pre className="mt-0.5 max-h-60 overflow-auto rounded-md bg-surface-2 px-3 py-2 text-[12px] whitespace-pre-wrap text-ink">{show(v) || "—"}</pre>
                  </div>
                ),
              )}
            </div>
            <details>
              <summary className="cursor-pointer text-[12.5px] text-ink-3">System fields</summary>
              <div className="mt-2 space-y-1">
                {system.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[180px_1fr] gap-2 text-[12px]">
                    <Mono>{k}</Mono>
                    <span className="break-all text-ink-2">{show(v)}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </Drawer>
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this item?"
        subtitle={item ? str(item, KEY_FIELD[flow]) || item._id : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="primary" className="bg-bad hover:bg-bad" disabled={busy} onClick={() => void remove()}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] text-ink-2">The item is deleted through the admin route. Any supplier task on it disappears. This cannot be undone from the portal.</p>
      </Modal>
    </>
  );
}
