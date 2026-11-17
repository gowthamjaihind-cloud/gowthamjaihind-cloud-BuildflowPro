import { computePoTotals, supplyKind, isValidHsn } from "../shared/poTax";
import type { Prepared } from "./parse";
import type { AiLogDraft } from "../bot/aiLog";

/**
 * What the person is shown before pressing Confirm, the same in the app and
 * the bot, and the reasons an action cannot be confirmed as it stands.
 * Pure: totals come from the same GST maths the PO form uses.
 */

export type Pending = Exclude<Prepared, { kind: "log" } | { kind: "question" } | { kind: "other" } | { kind: "approve" }> | { kind: "logs"; drafts: AiLogDraft[] };

const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const day = (d: string) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");

/** The PO's totals, given the company's and the vendor's GSTIN. */
export function poTotals(p: Extract<Pending, { kind: "po" }>, buyerGstin?: string, vendorGstin?: string) {
  const supply = supplyKind(buyerGstin, vendorGstin);
  return { ...computePoTotals(p.draft.items, {}, 0, supply.interState), interState: supply.interState };
}

/** Reasons the action cannot be confirmed as it is ([] when it can). */
export function blockers(p: Pending): string[] {
  if (p.kind !== "po") return [];
  const out: string[] = [];
  if (p.missingVendor) out.push("No vendor was matched. Say which vendor (it must already be in this project's vendors).");
  if (!p.draft.items.length) out.push("No material was matched in this project's inventory.");
  for (const i of p.draft.items) {
    if (!(i.rate > 0)) out.push(`${i.name} has no rate. Say the price per ${i.unit || "unit"}.`);
    if (i.hsn && !isValidHsn(i.hsn)) out.push(`${i.name}'s HSN code (${i.hsn}) is not 4, 6 or 8 digits. Fix it in Inventory.`);
    if ((i.gstRate || 0) > 0 && !String(i.hsn || "").trim()) out.push(`${i.name} has ${i.gstRate}% GST but no HSN code. Add it in Inventory, or use the PO form.`);
  }
  return out;
}

/** The preview, as lines of plain text (the bot adds its own bold). */
export function previewLines(p: Pending, projectName: string, opts: { buyerGstin?: string; vendorGstin?: string } = {}): string[] {
  switch (p.kind) {
    case "po": {
      const t = poTotals(p, opts.buyerGstin, opts.vendorGstin);
      return [
        `New purchase order for ${projectName}`,
        `Vendor: ${p.draft.vendorName || "not matched"}`,
        ...p.draft.items.flatMap((i, k) => [
          `• ${i.name}: ${i.orderedQty} ${i.unit} × ${inr(i.rate)}${i.rateFromRequest ? "" : " (usual rate)"}${i.gstRate ? ` + GST ${i.gstRate}%` : ""} = ${inr(t.lines[k].total)}`,
          ...(i.conversion ? [`   ↳ ${i.conversion}, rounded to 10 kg`] : []),
          ...(i.rateInclGst ? [`   ↳ ${inr(i.rateInclGst)} including ${i.gstRate}% GST = ${inr(i.rate)} before tax + GST`] : []),
          ...(i.taxSource ? [`   ↳ HSN ${i.hsn || "none"}, GST ${i.gstRate}%: ${i.taxNote || ""}`] : []),
        ]),
        ...(p.draft.expectedDeliveryDate ? [`Delivery: ${day(p.draft.expectedDeliveryDate)}`] : []),
        ...(p.draft.notes ? [`Notes: ${p.draft.notes}`] : []),
        `Value ${inr(t.subtotalTaxable)} + GST ${inr(t.totalTax)}${t.totalTax ? (t.interState ? " (IGST)" : " (CGST+SGST)") : ""} = Total ${inr(t.grandTotal)}`,
        ...(p.unmatched.length ? [`Not in inventory, left out: ${p.unmatched.join(", ")}`] : []),
        ...(p.draft.items.some((i) => i.taxSource) ? ["The HSN/GST shown is saved to these materials when you confirm."] : []),
        "It is saved as a Draft PO.",
      ];
    }
    case "payment":
      return [`Record a client payment for ${projectName}`, `Amount: ${inr(p.amount)}`, `Date: ${day(p.date)}`, `Method: ${p.method}${p.reference ? ` · Ref ${p.reference}` : ""}`, `Description: ${p.description}`];
    case "vendor":
      return [`Add a vendor to ${projectName}`, `Name: ${p.name} (${p.type})`, ...(p.phone ? [`Phone: ${p.phone}`] : []), ...(p.gstin ? [`GSTIN: ${p.gstin}`] : ["GSTIN: not given (add it later for GST purchase orders)"]), ...(p.contactPerson ? [`Contact: ${p.contactPerson}`] : []), ...(p.address ? [`Address: ${p.address}`] : [])];
    case "material":
      return [`Add a material to ${projectName}'s inventory`, `Name: ${p.name}`, `Unit: ${p.unit}`, `Rate: ${p.rate ? inr(p.rate) : "not given"}`, `HSN: ${p.hsn || "not given"} · GST: ${p.gstRate}%${p.taxNote ? ` (${p.taxNote})` : ""}`, "Stock starts at 0; goods receipts add to it."];
    case "logs":
      return [
        `Daily log${p.drafts.length > 1 ? `s (${p.drafts.length})` : ""} for ${projectName}`,
        ...p.drafts.flatMap((d) => [
          `• ${d.taskName}: ${d.currentProgress}% → ${d.progressPercent}%${d.workDate ? ` (${day(d.workDate)})` : ""}`,
          ...d.labour.map((l) => `   ${l.roleName}: ${l.headcount}`),
          ...d.materials.map((m) => `   ${m.name}: ${m.quantity} ${m.unit}`),
          ...d.equipment.map((e) => `   ${e.name}: ${e.quantity} ${e.unit}`),
        ]),
      ];
  }
}
