// Uploaded files can be opened in this browser session: the File a user drops is kept as an object URL by document id.
// Session only and never saved (localStorage keeps file names, not files): after a reload, and for the seeded data,
// a document shows its name without a link. The final document keeps names only (R-2).

const urls = new Map<string, string>();

export function rememberFile(docId: string, file: File | undefined) {
  if (!docId || !file) return;
  try {
    urls.set(docId, URL.createObjectURL(file));
  } catch {
    /* no object URLs (tests, old browsers): the name stays plain text */
  }
}

export const fileUrl = (docId: string): string | undefined => urls.get(docId);
