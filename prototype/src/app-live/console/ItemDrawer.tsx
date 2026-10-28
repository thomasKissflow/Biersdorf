// One item of a CIQ Digital flow, read in full (a process through the admin route, a form row by its own read: a list
// row lacks the child tables), as the portal's admin ItemDrawer (src/portal/admin/ItemDrawer.tsx):
// - View: every business field (JSON pretty-printed), the child tables, the system fields folded away.
// - Edit: every field but system fields and formulas, the child-table rows cell by cell (console/fields.ts sends only
//   what changed: a process by the admin update, a form row by its update; child rows as "Table::<model>" deltas). A
//   JSON text must parse before it is sent. Kissflow leaves never-filled fields out of an item, so the editor also
//   offers every scalar field seen on the flow's other items, empty, and any field id typed in.
// - New row (forms): the same editor on an empty row; create + submit, then the new row is shown (its read-back: not
//   read again).
// - Delete (26 Oct, Thomas: "just delete the item"): that item alone, ONE call (remove.ts deleteItem: a form row by
//   formDelete, a process item by the admin delete), after "Delete <key>?" (a process item: its key typed); no
//   dependency search, no read-back. Success closes the drawer and drops the row from the session's list (session.ts);
//   a refusal shows in the dialog. No step moves here.
// - Delete of a CIQ Case (27 Oct, Thomas: "say I delete a case in the admin, all associated to that also gets deleted,
//   like how it was before"): the case WITH everything that belongs to it (CaseCascadeDialog, caseDelete.ts): found
//   from the session's lists, its code typed, then one item at a time, paced, the case last, no read-backs. When the
//   dialog closes after the case item was deleted, the drawer closes too.
// The item is read in full ONCE when the drawer opens and kept while it stays open. An edit is read back: the drawer
// says whether Kissflow holds what was sent, or names what differs, and the read-back replaces the row in the list (the
// list is not read again). A CIQ Supplier row (26 Oct) also shows its contacts' portal users, each with Set / Change /
// Remove (PortalUsers.tsx).
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Drawer, Field, Modal, Mono, TextInput } from "@/components/ui";
import { errorText, type KfData } from "@/portal/kf/sdk";
import { str, type RawItem } from "@/portal/data/raw";
import type { FlowKey, FormKey } from "../types";
import { childRowId } from "../write/encode";
import { CHILD_MODELS, FLOW_LABEL, KEY_FIELD, formulasOf, isProcess, need, statusTone } from "./common";
import { CaseCascadeDialog } from "./CaseCascadeDialog";
import { useDataConsole } from "./ConsoleContext";
import { deleteItem, deleteProblem } from "./remove";
import { editText, fieldPatch, isSystem, kindOf, readBackProblems, rowDrafts, tableColumns, tableDelta, tableRows, tablesOf, TABLE, type EditField, type RowDraft } from "./fields";
import { FieldEditor, FieldView, TableEditor, TableView } from "./FieldViews";
import { PortalUsersPanel } from "./PortalUsers";

/** The drawer's id for a form row not created yet. */
export const NEW_ROW = "__new__";

const FIELD_ID = /^[A-Za-z][A-Za-z0-9_]*$/;
type Message = { ok: boolean; text: string };

export function ItemDrawer({ flow, id, knownFields = [], onClose, onCreated }: { flow: FlowKey; id: string | null; knownFields?: string[]; onClose: () => void; onCreated: (id: string) => void }) {
  const { client, session, changed } = useDataConsole();
  const proc = isProcess(flow) ? flow : null;
  const form = proc ? null : (flow as FormKey);
  const creating = id === NEW_ROW;
  const models = CHILD_MODELS[flow] ?? [];
  const formulas = formulasOf(flow);
  const [item, setItem] = useState<RawItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [tables, setTables] = useState<Record<string, RowDraft[]>>({});
  const [extra, setExtra] = useState<string[]>([]);
  const [newField, setNewField] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** A CIQ Case's delete with everything that belongs to it (CaseCascadeDialog). */
  const [cascade, setCascade] = useState(false);
  const [typed, setTyped] = useState("");
  /** The delete's refusal, shown in its dialog. */
  const [deleteError, setDeleteError] = useState<string | null>(null);
  /** The item on screen now: answers for an earlier item (a slow read, a save) are ignored. */
  const current = useRef(id);
  current.current = id;
  /** A message to show on the next item (the row just created). */
  const carry = useRef<Message | null>(null);
  /** The next item as already read (the row just created, read back): shown without reading it again. */
  const carryItem = useRef<RawItem | null>(null);

  const read = (target: string) => (proc ? client.adminGet(proc, target) : client.formGet(form!, target));

  useEffect(() => {
    setItem(null);
    setError(null);
    setMessage(carry.current);
    carry.current = null;
    setBusy(false);
    setConfirmDelete(false);
    setCascade(false);
    setDeleteError(null);
    setExtra([]);
    setNewField("");
    const kept = carryItem.current;
    carryItem.current = null;
    if (!id) return;
    if (id === NEW_ROW) {
      const empty = { _id: "" } as RawItem;
      setItem(empty);
      startEdit(empty, []);
      return;
    }
    setEditing(false);
    if (kept && kept._id === id) {
      setItem(kept);
      return;
    }
    let live = true;
    read(id)
      .then((x) => {
        if (!live) return;
        setItem(x);
        if (proc) session.noteStep(proc, x); // the table's step column gets it for free
      })
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
    // read and startEdit change with every render: the item is read again only for another client, flow or id
  }, [client, flow, id]);

  const fieldsOf = (it: RawItem, added: string[]): EditField[] => {
    const present = Object.keys(it).filter((k) => !isSystem(k) && kindOf(k, it[k], formulas, models) !== "table");
    const missing = [...knownFields, ...added].filter((k) => !isSystem(k) && !(k in it) && !k.startsWith(TABLE));
    return [...new Set([...present, ...missing])].map((k) => ({ id: k, value: it[k], kind: kindOf(k, it[k], formulas, models) }));
  };
  const fields = item ? fieldsOf(item, extra) : [];
  const tableModels = item ? tablesOf(item, models) : [];
  /** A child table's columns: what its rows carry (a table without rows has none known here). */
  const columnsOf = (model: string) => tableColumns(tableRows(item ?? undefined, model));
  const system = item ? Object.entries(item).filter(([k]) => isSystem(k)) : [];

  function startEdit(it: RawItem, added: string[]) {
    setDraft(Object.fromEntries(fieldsOf(it, added).map((f) => [f.id, editText(f.value, f.kind)])));
    setTables(Object.fromEntries(tablesOf(it, models).map((m) => [m, rowDrafts(tableRows(it, m), tableColumns(tableRows(it, m)))])));
    setEditing(true);
    setMessage(null);
  }

  const addField = () => {
    const f = newField.trim();
    if (!FIELD_ID.test(f) || isSystem(f) || fields.some((x) => x.id === f)) return;
    setExtra((x) => [...x, f]);
    setDraft((d) => ({ ...d, [f]: "" }));
    setNewField("");
  };
  const newFieldProblem = newField.trim() && (!FIELD_ID.test(newField.trim()) ? "A field id: letters, digits and underscores, starting with a letter." : isSystem(newField.trim()) ? "System fields are set by Kissflow." : fields.some((x) => x.id === newField.trim()) ? "This field is already in the list." : undefined);

  /** What the editor would send: changed fields and child-table deltas; or the texts that can't be sent. */
  const patch = (): { data: KfData; problems: Record<string, string> } => {
    const out = fieldPatch(fields, draft);
    for (const m of tableModels) {
      const delta = tableDelta(m, tableRows(item ?? undefined, m), tables[m] ?? [], childRowId);
      if (delta) out.data[`${TABLE}${m}`] = delta;
    }
    return out;
  };

  const save = async () => {
    if (!item || !id) return;
    const target = id;
    const { data, problems } = patch();
    if (Object.keys(problems).length) {
      setMessage({ ok: false, text: `Not sent: ${Object.entries(problems).map(([k, why]) => `${k}: ${why}`).join("; ")}` });
      return;
    }
    if (!Object.keys(data).length) {
      if (!creating) setEditing(false);
      else setMessage({ ok: false, text: "Fill in at least one field first." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (creating) {
        const newId = await client.formCreate(form!, data);
        changed();
        const back = await read(newId);
        session.putRow(flow, back); // the list gets the new row as read back, without a list read
        const differ = readBackProblems(data, back);
        if (current.current !== target) return;
        carry.current = differ.length ? { ok: false, text: `Created as ${newId}, but the read-back differs for: ${differ.join(", ")}` } : { ok: true, text: `Created as ${newId} and read back (${Object.keys(data).length} field${Object.keys(data).length === 1 ? "" : "s"}).` };
        carryItem.current = back;
        onCreated(newId);
        return;
      }
      if (proc) await need(client.adminUpdate?.bind(client), "The admin update")(proc, target, data);
      else await client.formUpdate(form!, target, data);
      changed();
      const back = await read(target);
      session.putRow(flow, back); // the row as Kissflow holds it now, even if the drawer moved on
      if (current.current !== target) return;
      const differ = readBackProblems(data, back);
      setItem(back);
      setEditing(false);
      setMessage(differ.length ? { ok: false, text: `Saved, but the read-back differs for: ${differ.join(", ")}` } : { ok: true, text: `Saved and read back (${Object.keys(data).length} field${Object.keys(data).length === 1 ? "" : "s"}${Object.keys(data).some((k) => k.startsWith(TABLE)) ? ", child rows included" : ""}).` });
    } catch (e) {
      if (current.current === target) setMessage({ ok: false, text: errorText(e) });
    } finally {
      if (current.current === target) setBusy(false);
    }
  };

  const keyText = item ? str(item, KEY_FIELD[flow]) || item._id : "";
  /** ONE call; an answer without an error is success: the row leaves the list, the drawer closes. Nothing is read. */
  const remove = async () => {
    if (!id || !item || item._id !== id) return;
    const target = id;
    setBusy(true);
    setDeleteError(null);
    try {
      await deleteItem(client, flow, target);
      changed();
      session.removeRow(flow, target);
      if (current.current !== target) return;
      setConfirmDelete(false);
      onClose();
    } catch (e) {
      if (current.current === target) setDeleteError(deleteProblem(errorText(e)));
    } finally {
      if (current.current === target) setBusy(false);
    }
  };

  const open = (n: boolean) => {
    setTyped("");
    setDeleteError(null);
    setConfirmDelete(n);
  };
  const title = creating ? `New row · ${FLOW_LABEL[flow]}` : item ? keyText : "Item";
  const subtitle = creating ? "Fill in the fields to create; empty fields are left out." : item ? [proc ? str(item, "_current_step") || "—" : FLOW_LABEL[flow], item._id].join(" · ") : undefined;

  return (
    <>
      <Drawer
        open={!!id}
        onClose={onClose}
        width={760}
        dismissible={!editing}
        title={title}
        subtitle={subtitle}
        data-testid="data-drawer"
        footer={
          item && (
            <div className="flex w-full flex-wrap items-center gap-2">
              {editing ? (
                <>
                  <Button variant="primary" disabled={busy} onClick={() => void save()} data-testid="data-save">
                    {busy ? "Saving…" : creating ? "Create row" : "Save changes"}
                  </Button>
                  <Button variant="ghost" onClick={() => (creating ? onClose() : setEditing(false))} data-testid="data-cancel">
                    Cancel
                  </Button>
                </>
              ) : (
                <Button icon={<Pencil size={15} />} onClick={() => startEdit(item, extra)} data-testid="data-edit">
                  {proc ? "Edit fields (admin)" : "Edit row"}
                </Button>
              )}
              {!creating && (
                <Button
                  variant="ghost"
                  className="ml-auto text-bad"
                  icon={<Trash2 size={15} />}
                  disabled={busy}
                  onClick={() => (flow === "case" ? setCascade(true) : open(true))}
                  data-testid="data-delete"
                >
                  {flow === "case" ? "Delete case" : proc ? "Delete item" : "Delete row"}
                </Button>
              )}
            </div>
          )
        }
      >
        {error && <p className="text-[13px] text-bad">{error}</p>}
        {!item && !error && <p className="text-[13px] text-ink-3">Loading…</p>}
        {item && (
          <div className="space-y-5">
            {!creating && (
              <div className="flex flex-wrap items-center gap-2">
                {proc && (
                  <Badge tone={statusTone(str(item, "_status"))} dot>
                    {str(item, "_status") || "—"}
                  </Badge>
                )}
                {str(item, "Case_Code") && <span className="text-[12.5px] text-ink-3">{str(item, "Case_Code")}</span>}
                <span className="text-[12.5px] text-ink-3">{fields.filter((f) => f.value !== undefined).length} fields</span>
              </div>
            )}
            {message && (
              <p className={message.ok ? "text-[13px] text-ok" : "text-[13px] text-bad"} data-testid="data-message" role={message.ok ? "status" : "alert"}>
                {message.text}
              </p>
            )}
            {editing && proc && <p className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-ink-2">The admin update writes any field at any step, read-only ones too. Steps do not move.</p>}
            {flow === "supplier" && !editing && !creating && (
              <PortalUsersPanel
                client={client}
                item={item}
                onSaved={(back) => {
                  setItem(back);
                  changed();
                  session.putRow("supplier", back);
                }}
              />
            )}
            <div className="space-y-3">
              {fields.map((f) => (editing ? <FieldEditor key={f.id} id={f.id} value={f.value} kind={f.kind} text={draft[f.id] ?? ""} onChange={(t) => setDraft((d) => ({ ...d, [f.id]: t }))} /> : <FieldView key={f.id} id={f.id} value={f.value} kind={f.kind} />))}
            </div>
            {editing && (
              <Field label="Add a field" hint="Its field id, as Kissflow names it (e.g. Change_Note)." error={newFieldProblem || undefined}>
                <div className="flex gap-2">
                  <TextInput value={newField} onChange={(e) => setNewField(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addField()} placeholder="Field_Id" data-testid="data-add-field" />
                  <Button icon={<Plus size={15} />} disabled={!newField.trim() || !!newFieldProblem} onClick={addField} data-testid="data-add-field-button">
                    Add
                  </Button>
                </div>
              </Field>
            )}
            {tableModels.map((m) =>
              !editing ? (
                <TableView key={m} model={m} rows={tableRows(item, m)} columns={columnsOf(m)} />
              ) : columnsOf(m).length ? (
                <TableEditor key={m} model={m} columns={columnsOf(m)} drafts={tables[m] ?? []} formulas={formulasOf(m)} onChange={(d) => setTables((t) => ({ ...t, [m]: d }))} />
              ) : (
                <p key={m} className="text-[12.5px] text-ink-3">
                  <Mono>Table::{m}</Mono> has no rows here, so its columns are not known: its rows can't be added in the console.
                </p>
              ),
            )}
            {!creating && (
              <details>
                <summary className="cursor-pointer text-[12.5px] text-ink-3">System fields</summary>
                <div className="mt-2 space-y-1">
                  {system.map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[180px_1fr] gap-2 text-[12px]">
                      <Mono>{k}</Mono>
                      <span className="break-all text-ink-2">{typeof v === "string" ? v : JSON.stringify(v)}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </Drawer>
      <Modal
        open={confirmDelete}
        onClose={() => !busy && open(false)}
        dismissible={!busy}
        title={`Delete ${keyText}?`}
        subtitle={FLOW_LABEL[flow]}
        data-testid="data-delete-confirm"
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => open(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={busy || (!!proc && typed.trim() !== keyText)} onClick={() => void remove()} data-testid="data-delete-go">
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {proc ? (
            <p className="text-[13.5px] text-ink-2">Only this item is deleted, through the admin route, at whatever step it is: its tasks disappear and nothing is handed on. This cannot be undone here.</p>
          ) : (
            <p className="text-[13.5px] text-ink-2">Only this row is deleted from {FLOW_LABEL[flow]}. The CIQ screens no longer see it. This cannot be undone here.</p>
          )}
          {proc && (
            <Field label={<>Type <Mono>{keyText}</Mono> to confirm</>}>
              <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-testid="data-delete-typed" />
            </Field>
          )}
          {deleteError && (
            <p role="alert" className="text-[13px] text-bad" data-testid="data-delete-error">
              {deleteError}
            </p>
          )}
        </div>
      </Modal>
      {cascade && item && id && item._id === id && (
        <CaseCascadeDialog
          cases={[{ id, code: str(item, "Case_Code"), item }]}
          confirm="code"
          onClose={(deletedCases) => {
            setCascade(false);
            if (deletedCases.includes(id)) onClose();
          }}
        />
      )}
    </>
  );
}
