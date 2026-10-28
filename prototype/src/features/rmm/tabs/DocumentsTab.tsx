// Documents tab of the case page: every upload by file name and upload date (BRM v2: no versions). A new upload is
// added next to the earlier ones; suppliers never delete uploads. 27 Oct (Thomas): no size column (Kissflow's attachment
// size is not shown anywhere in the app).
import { DocName } from "@/components/DocName";
import { FileText } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, Mono, Table, Td, Tr } from "@/components/ui";
import { sectionOf } from "@/domain/catalog";
import { docSectionId } from "@/domain/requestedDocs";
import { fmtDateTime, placeLabel } from "@/domain/selectors";
import type { CiqCase } from "@/domain/types";
import { useStore } from "@/store/store";
import { PersonCell } from "../shared";

export function DocumentsTab({ c }: { c: CiqCase }) {
  const { state } = useStore();
  const docs = [...c.documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  if (!docs.length) {
    return (
      <Card data-testid="empty-documents">
        <EmptyState icon={<FileText size={28} />} title="No documents yet">
          The supplier uploads evidence at the question it belongs to (SDS, CoA, specification, analyses, certificates), also when answering a document request. Each upload shows its file name and date.
        </EmptyState>
      </Card>
    );
  }
  const at = (id: string) => c.openPoints.find((p) => p.thread.some((m) => m.documentId === id));
  return (
    <Card data-testid="case-documents">
      <CardHeader title="Documents" subtitle={`${docs.length} file${docs.length === 1 ? "" : "s"} · newest first. A new upload is added next to the earlier ones; suppliers cannot delete uploads.`} />
      <Table head={["Document", "Type", "Section / question", "Uploaded by", "Upload date"]}>
        {docs.map((d) => {
          const u = state.users.find((x) => x.id === d.uploadedBy);
          const op = at(d.id);
          return (
            <Tr key={d.id} data-testid={`doc-row-${d.id}`}>
              <Td className="max-w-[320px] min-w-[220px]">
                <span className="flex items-center gap-2">
                  <FileText size={15} className="shrink-0 text-ink-3" aria-hidden />
                  <DocName id={d.id} name={d.name} className="truncate font-medium" />
                </span>
                {op && <span className="mt-0.5 block truncate pl-[23px] text-[12px] text-ink-3">Referenced in {op.id}</span>}
              </Td>
              <Td>
                <Badge tone="neutral">{d.kind}</Badge>
              </Td>
              <Td className="max-w-[260px] min-w-[160px]">
                <Mono className="text-ink">{sectionOf(docSectionId(c, d, state.config), c.templateVersion)?.code ?? docSectionId(c, d, state.config)}</Mono>
                {d.fieldId && <span className="block truncate text-[12px] text-ink-3">{placeLabel(c, d.fieldId)}</span>}
              </Td>
              <Td>
                <PersonCell state={state} id={d.uploadedBy} sub={u?.side === "supplier" ? "Supplier" : "Beiersdorf"} />
              </Td>
              <Td className="whitespace-nowrap text-ink-2">{fmtDateTime(d.uploadedAt)}</Td>
            </Tr>
          );
        })}
      </Table>
    </Card>
  );
}
