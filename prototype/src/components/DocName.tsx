// A document's file name. In the live app (a DocOpener is provided, components/docOpener.tsx; 27 Oct) it is a
// link-styled button, labelled "Open <name>", that opens Kissflow's file preview, or the name with a quiet note when
// only the supplier portal can open the file. Otherwise (the prototype, the supplier portal): a link that opens the
// file in a new tab when it was uploaded in this session, else plain text.
import { useEffect } from "react";
import { cx } from "@/components/ui";
import { PORTAL_ONLY_NOTE, useDocOpener } from "@/components/docOpener";
import { fileUrl } from "@/store/fileUrls";

/** The caller's text colour gives way to the link colour (both are colour utilities: the stylesheet, not the class
 *  order, would decide). */
const linkClass = (className?: string) => cx(className?.replace(/(^|\s)text-ink(-\d)?(?=\s|$)/g, " ").trim(), "max-w-full cursor-pointer rounded-sm text-left text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand");

export function DocName({ id, name, className }: { id: string; name: string; className?: string }) {
  const opener = useDocOpener();
  const status = opener?.status(id);
  useEffect(() => {
    if (status === "checking") opener?.prepare(id);
  }, [opener, status, id]);
  if (opener && status === "portal") {
    return (
      <span className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1.5" data-testid={`doc-portal-only-${id}`}>
        <span className={className} title={name}>
          {name}
        </span>
        <span className="text-[12px] font-normal text-ink-3">{PORTAL_ONLY_NOTE}</span>
      </span>
    );
  }
  if (opener && status) {
    return (
      <button
        type="button"
        onClick={() => void opener.open(id)}
        aria-label={`Open ${name}`}
        title={`Open ${name}`}
        aria-busy={status === "checking" || undefined}
        data-doc-state={status}
        data-testid={`doc-open-${id}`}
        className={linkClass(className)}
      >
        {name}
      </button>
    );
  }
  const url = fileUrl(id);
  if (!url) return <span className={className} title={name}>{name}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" title={`Open ${name}`} className={cx(className, "text-brand underline-offset-2 hover:underline")} data-testid={`doc-open-${id}`}>
      {name}
    </a>
  );
}
