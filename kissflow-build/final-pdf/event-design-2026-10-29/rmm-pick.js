// "CIQ Case - Send Final Release to RMM" · step "RMM pick case" (design 29 Oct): the one case the final document service
// named (exact _id: the Search is a full-text q, so a follow-up or reactivated case that mentions this id can be in the
// rows too), and its filed PDF. Refuses unless the case is completed with a confirmed final release, its
// Final_Document_Hash names the document seal the service sent, and Final_PDF holds the service's file.
// The recipients never come from the payload (the next step reads the RMM role), so a forged call can at most re-send a
// filed PDF to the RMM role.
const parse = (v) => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch (e) { return null; } };
const id = String(inputData.caseItemId || "").trim();
const seal = String(inputData.seal || "").trim().toLowerCase();
if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) throw new Error("NO MAIL: the webhook named no valid case item id");
if (!/^[0-9a-f]{16}$/.test(seal)) throw new Error(`NO MAIL: the webhook named no valid document seal for ${id}`);
const rows = parse(inputData.rows);
const c = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
if (!c) throw new Error(`NO MAIL: CIQ Case ${id} was not found`);
const code = String(c.Case_Code || "");
if (c._status !== "Completed") throw new Error(`NO MAIL: CIQ Case ${code || id} is ${c._status || "of unknown status"}, not Completed`);
if (c.Final_Release_Confirm !== "Confirmed") throw new Error(`NO MAIL: CIQ Case ${code} has no confirmed final release`);
if (String(c.Final_Document_Hash || "").indexOf(`seal:${seal} `) !== 0) throw new Error(`NO MAIL: CIQ Case ${code} has no final document with seal ${seal}`);
const name = `${code}-final-document.pdf`;
const files = parse(c.Final_PDF);
const mine = (Array.isArray(files) ? files : []).filter((a) => a && typeof a === "object" && (a.key || a.id) && a.name === name);
if (!mine.length) throw new Error(`NO MAIL: Final_PDF of ${code} holds no ${name} (the service may have used its Drive fallback)`);
const att = mine[mine.length - 1]; // uploads add, never replace: the newest is last
return {
  caseId: c._id,
  caseCode: code,
  tradeName: String(c.Trade_Name || ""),
  supplier: String(c.Supplier_Legal_Name || ""),
  ownerName: String((c.Owner_RMM && c.Owner_RMM.Name) || ""),
  seal,
  fileName: String(att.name),
  fileSize: Number(att.size) || 0,
  attachments: [att],
};
