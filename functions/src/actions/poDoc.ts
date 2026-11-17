import { db } from "../db";
import { renderPoPdf } from "./poPdf";
import type { Pending } from "./preview";

/**
 * The PO PDF for a pending action: a DRAFT PREVIEW before Confirm, the
 * numbered PO after it. Same letterhead the app prints (organization name and
 * GSTIN, organizations/{orgId}/profile/company for address, logo and terms).
 */
export async function pdfForPendingPo(
  orgId: string,
  projectId: string,
  p: Extract<Pending, { kind: "po" }>,
  opts: { poNumber?: string; orderDate?: string } = {},
): Promise<{ buffer: Buffer; filename: string }> {
  const b = `organizations/${orgId}/projects/${projectId}`;
  const [orgSnap, profileSnap, projectSnap, vendorSnap] = await Promise.all([
    db.doc(`organizations/${orgId}`).get(),
    db.doc(`organizations/${orgId}/profile/company`).get(),
    db.doc(b).get(),
    p.draft.vendorId ? db.doc(`${b}/suppliers/${p.draft.vendorId}`).get() : Promise.resolve(null),
  ]);
  const org: any = orgSnap.data() || {};
  const profile: any = profileSnap.data() || {};
  const vendor: any = vendorSnap?.data() || {};
  const orderDate = opts.orderDate || new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const buffer = await renderPoPdf({
    draft: !opts.poNumber,
    poNumber: opts.poNumber,
    status: opts.poNumber ? "Draft" : undefined,
    orderDate,
    expectedDeliveryDate: p.draft.expectedDeliveryDate || undefined,
    notes: p.draft.notes || undefined,
    company: { ...profile, name: String(org.companyName || org.name || "Your company"), gstin: org.gstin || "" },
    vendor: { name: String(vendor.name || p.draft.vendorName || "Vendor not matched"), gstin: vendor.gstin, address: vendor.address, phone: vendor.phone },
    projectName: String((projectSnap.data() as any)?.name || ""),
    items: p.draft.items.map((i) => ({ name: i.name, hsn: i.hsn, unit: i.unit, orderedQty: i.orderedQty, rate: i.rate, gstRate: i.gstRate })),
  });
  const filename = opts.poNumber ? `${opts.poNumber}.pdf` : "PO-draft-preview.pdf";
  return { buffer, filename };
}
