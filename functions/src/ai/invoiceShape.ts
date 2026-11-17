/**
 * The model's answer for a bill, in the one shape the reader uses.
 *
 * Asked for one JSON object, it sometimes answers with a list holding the
 * object, or wraps it ({"invoice": {...}}). Taken as it came, every field was
 * then undefined and an EMPTY bill was saved (no vendor, no number, no lines,
 * ₹0). This unwraps those shapes, and returns null when nothing usable was
 * read, so the caller says "couldn't read it" instead of saving a blank bill.
 * Pure, so it is unit-tested.
 */
const looksLikeBill = (o: any) =>
  !!o && typeof o === "object" && !Array.isArray(o) &&
  ("lineItems" in o || "vendorName" in o || "invoiceNumber" in o || "grandTotal" in o || "docType" in o);

export function normalizeInvoiceJson(parsed: any): any | null {
  let o = parsed;
  for (let i = 0; i < 3 && o && !looksLikeBill(o); i++) {
    if (Array.isArray(o)) o = o.find((x) => x && typeof x === "object") ?? null;
    else if (typeof o === "object") o = Object.values(o).find((v) => looksLikeBill(v) || Array.isArray(v)) ?? null;
    else o = null;
  }
  if (!looksLikeBill(o)) return null;
  // A payment receipt or something else entirely: the caller decides (ai/invoiceReader.ts).
  if (o.docType === "payment") return o.payment && typeof o.payment === "object" ? o : null;
  if (o.docType === "other") return o;
  const lines = Array.isArray(o.lineItems) ? o.lineItems : [];
  const read = !!String(o.invoiceNumber || "").trim() || lines.length > 0 || Number(o.grandTotal) > 0;
  return read ? { ...o, lineItems: lines } : null;
}
