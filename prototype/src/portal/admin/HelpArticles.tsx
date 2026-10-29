// Help articles (CIQP Help Article form): list, create, edit, delete. Every write is followed by a re-list.
// Phones (Thomas, 30 Oct): one card per article, opened to read only (AdminShell's "Use a larger screen to edit").
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Card, CardList, CardListItem, Drawer, EmptyState, Field, Modal, PageHeader, Table, Td, TextArea, TextInput, Tr } from "@/components/ui";
import { useIsPhone } from "@/shell/useLayoutMode";
import { errorText } from "../kf/sdk";
import { num, str, type RawItem } from "../data/raw";
import { usePortalMode } from "../mode";
import { useAsync } from "./common";

interface Draft {
  id?: string;
  title: string;
  body: string;
  sort: string;
}

export function HelpArticles() {
  const { client } = usePortalMode();
  const q = useAsync(() => client!.formList("helpArticle"), [client]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const phone = useIsPhone();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sortValid = !draft || draft.sort.trim() === "" || Number.isFinite(Number(draft.sort));
  const rows = [...(q.data ?? [])].sort((a, b) => (num(a, "Sort_Order") ?? 999) - (num(b, "Sort_Order") ?? 999));

  const open = (r?: RawItem) => {
    setError(null);
    setDraft(r ? { id: r._id, title: str(r, "Article_Title"), body: str(r, "Article_Body"), sort: str(r, "Sort_Order") } : { title: "", body: "", sort: String(((num(rows.at(-1), "Sort_Order") ?? 0) as number) + 10) });
  };

  const save = async () => {
    if (!draft || !client) return;
    setBusy(true);
    setError(null);
    // A cleared order is sent as empty (null) so the stored value matches the form; an unchanged blank is left out.
    const sort = draft.sort.trim() ? Number(draft.sort) : draft.id ? null : undefined;
    const data = { Article_Title: draft.title.trim(), Article_Body: draft.body, ...(sort !== undefined ? { Sort_Order: sort } : {}) };
    try {
      if (draft.id) await client.formUpdate("helpArticle", draft.id, data);
      else await client.formCreate("helpArticle", data);
      await q.reload();
      setDraft(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft?.id || !client) return;
    setBusy(true);
    setError(null);
    try {
      await client.formDelete("helpArticle", draft.id);
      await q.reload();
      setConfirmDelete(false);
      setDraft(null);
    } catch (e) {
      setConfirmDelete(false); // show the error in the drawer, not hidden behind the modal
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Help articles"
        subtitle="Shown to every supplier contact under Help"
        actions={
          // a phone views the articles only (AdminShell: "Use a larger screen to edit")
          phone ? undefined : (
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => open()}>
              New article
            </Button>
          )
        }
      />
      {phone && !q.error && rows.length > 0 ? (
        <CardList label="Help articles" data-testid="help-article-cards">
          {rows.map((r) => (
            <CardListItem key={r._id} title={str(r, "Article_Title")} meta={`Order ${str(r, "Sort_Order") || "—"}`} onClick={() => open(r)}>
              <span className="line-clamp-2">{str(r, "Article_Body")}</span>
            </CardListItem>
          ))}
        </CardList>
      ) : (
        <Card>
          {q.loading && !q.data ? (
            <div className="p-6 text-[13px] text-ink-3">Loading…</div>
          ) : q.error ? (
            <EmptyState title="Could not load the articles">{q.error}</EmptyState>
          ) : rows.length === 0 ? (
            <EmptyState title="No articles">Create the first help article for suppliers.</EmptyState>
          ) : (
            <Table head={["Order", "Title", "Text"]}>
              {rows.map((r) => (
                <Tr key={r._id} onClick={() => open(r)}>
                  <Td>{str(r, "Sort_Order")}</Td>
                  <Td className="font-medium">{str(r, "Article_Title")}</Td>
                  <Td className="max-w-[520px] truncate text-ink-3">{str(r, "Article_Body")}</Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>
      )}
      <Drawer
        open={!!draft}
        onClose={() => setDraft(null)}
        title={phone ? draft?.title || "Article" : draft?.id ? "Edit article" : "New article"}
        footer={
          phone ? undefined : (
            <div className="flex w-full items-center gap-2">
              <Button variant="primary" disabled={busy || !draft?.title.trim() || !draft?.body.trim() || !sortValid} onClick={() => void save()}>
                {busy ? "Saving…" : "Save"}
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              {draft?.id && (
                <Button variant="ghost" className="ml-auto text-bad" icon={<Trash2 size={15} />} disabled={busy} onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              )}
            </div>
          )
        }
      >
        {draft && phone && (
          <div className="space-y-3 text-[13.5px]">
            <p className="whitespace-pre-line text-ink-2">{draft.body}</p>
            {draft.sort && <p className="text-[12.5px] text-ink-3">Order {draft.sort}</p>}
          </div>
        )}
        {draft && !phone && (
          <div className="space-y-4">
            {error && <p className="text-[13px] text-bad">{error}</p>}
            <Field label="Title" required>
              <TextInput value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <Field label="Text" required>
              <TextArea className="min-h-[220px]" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </Field>
            <Field label="Order" hint="Lower numbers are shown first" error={sortValid ? undefined : "Enter a number, or leave it empty."}>
              <TextInput className="w-28" inputMode="numeric" value={draft.sort} onChange={(e) => setDraft({ ...draft, sort: e.target.value })} />
            </Field>
          </div>
        )}
      </Drawer>
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this article?"
        subtitle={draft?.title}
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
        <p className="text-[13.5px] text-ink-2">Suppliers will no longer see it under Help. This cannot be undone from the portal.</p>
      </Modal>
    </div>
  );
}
