/**
 * The vendor on a bill is the SELLER: the business that issued it. The model
 * sometimes returns the "Bill to" party instead, which on a bill sent to this
 * company is this company itself (a bill from ABC Traders was read as being
 * from the builder's own firm). When the "vendor" it read is this company,
 * the buyer it read is the real seller, so swap them; if there is no buyer to
 * swap in, clear the vendor rather than match the company to itself.
 * Pure, so it is unit-tested.
 */
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function fixSeller(raw: any, company: { name?: string; gstin?: string }): { raw: any; swapped: boolean } {
  if (!raw) return { raw, swapped: false };
  const myGstin = String(company.gstin || "").toUpperCase();
  const myName = norm(company.name);
  const isMe = (name: unknown, gstin: unknown) =>
    (!!myGstin && String(gstin || "").toUpperCase() === myGstin) || (!!myName && norm(name) === myName);
  if (!isMe(raw.vendorName, raw.vendorGSTIN)) return { raw, swapped: false };
  const hasBuyer = !!(raw.buyerName || raw.buyerGSTIN) && !isMe(raw.buyerName, raw.buyerGSTIN);
  return {
    raw: {
      ...raw,
      vendorName: hasBuyer ? raw.buyerName || "" : "",
      vendorGSTIN: hasBuyer ? raw.buyerGSTIN || "" : "",
      buyerName: raw.vendorName,
      buyerGSTIN: raw.vendorGSTIN,
    },
    swapped: true,
  };
}
