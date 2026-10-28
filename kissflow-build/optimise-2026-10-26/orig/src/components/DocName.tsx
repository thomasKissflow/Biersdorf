// A document's file name: a link that opens the file in a new tab when it was uploaded in this session, else plain text.
import { cx } from "@/components/ui";
import { fileUrl } from "@/store/fileUrls";

export function DocName({ id, name, className }: { id: string; name: string; className?: string }) {
  const url = fileUrl(id);
  if (!url) return <span className={className} title={name}>{name}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" title={`Open ${name}`} className={cx(className, "text-brand underline-offset-2 hover:underline")} data-testid={`doc-open-${id}`}>
      {name}
    </a>
  );
}
