import { doc, runTransaction, getDoc, deleteDoc } from "firebase/firestore";
import { getStorage, ref as storageRef, deleteObject } from "firebase/storage";
import { db } from "../firebase";
import type { GoodsReceiptNote, PurchaseOrder, VendorBill } from "../types";

/**
 * Deleting a goods receipt, and deleting a vendor bill, undo the same things.
 *
 * A GRN moved stock into inventory, counted against its PO, and (through its
 * ledger and cost entries) added to the vendor's balance and the project's
 * cost. A scanned bill, once posted, made exactly one such GRN and shares its
 * ledger entry (invoiceReceiptService.ts). So:
 *   - deleting a GRN reverses all of that, and if the GRN came from a bill,
 *     puts that bill back to "Pending review" (its ledger entry is gone);
 *   - deleting a posted bill reverses its GRN(s) and then deletes the bill;
 *   - deleting a pending bill only deletes the bill (it changed nothing else).
 */

async function reverseGrn(tenantPath: string, grn: GoodsReceiptNote, opts: { deleteBillId?: string } = {}) {
  await runTransaction(db, async (transaction) => {
    const grnRef = doc(db, `${tenantPath}/goodsReceiptNotes`, grn.id);
    const materialIds = Array.from(new Set((grn.lineItems || []).map((i) => i.poLineRef).filter(Boolean))) as string[];

    // ---- ALL READS FIRST ----
    const inventoryItemDocs: Record<string, any> = {};
    for (const matId of materialIds) inventoryItemDocs[matId] = await transaction.get(doc(db, `${tenantPath}/inventory`, matId));

    // The ledger entry records the exact amount added to the vendor balance
    // when this GRN was created. Reversing that same figure keeps the balance
    // and the statement in step -- any mismatch silently reappears as "opening
    // balance", since opening balance is derived, not stored.
    const ledgerDoc = grn.ledgerId ? await transaction.get(doc(db, `${tenantPath}/ledger`, grn.ledgerId)) : null;
    // The vendor from the GRN itself, so the balance is reversed even when the PO has since been deleted.
    const vendorDoc = grn.vendorId ? await transaction.get(doc(db, `${tenantPath}/suppliers`, grn.vendorId)) : null;
    const poDoc = grn.poId ? await transaction.get(doc(db, `${tenantPath}/purchase_orders`, grn.poId)) : null;
    const poData = poDoc?.exists() ? (poDoc.data() as PurchaseOrder) : null;
    const billId = (grn as any).billId as string | undefined;
    const billDoc = billId && billId !== opts.deleteBillId ? await transaction.get(doc(db, `${tenantPath}/vendor_bills`, billId)) : null;

    // ---- COMPUTE REVERSAL ----
    let reversalAmount = 0;
    if (ledgerDoc?.exists()) {
      reversalAmount = ledgerDoc.data().amount || 0;
    } else if (poData) {
      // Fallback only for legacy GRNs saved without a ledger reference.
      (grn.lineItems || []).forEach((g) => {
        const poItem = poData.lineItems?.find((i: any) => i.itemId === g.poLineRef);
        if (poItem) reversalAmount += (g.acceptedQty || 0) * (poItem.rate || 0);
      });
    }

    // ---- WRITES ----
    if (poDoc && poData) {
      const updatedLineItems = (poData.lineItems || []).map((item) => {
        const g = (grn.lineItems || []).find((i) => i.poLineRef === item.itemId);
        return g ? { ...item, receivedQty: Math.max(0, (item.receivedQty || 0) - (g.acceptedQty || 0)) } : item;
      });
      const isFullyReceived = updatedLineItems.every((i) => (i.receivedQty || 0) >= i.orderedQty);
      transaction.update(poDoc.ref, { lineItems: updatedLineItems, status: isFullyReceived ? "Completed" : "Approved" });
    }
    if (vendorDoc?.exists() && reversalAmount !== 0) {
      // Deliberately not clamped at 0: clamping is what left the balance and
      // the statement out of step and surfaced the remainder as opening balance.
      transaction.update(vendorDoc.ref, { outstandingBalance: (vendorDoc.data().outstandingBalance || 0) - reversalAmount });
    }
    if (ledgerDoc?.exists()) transaction.delete(ledgerDoc.ref);
    if (grn.costEntryId) transaction.delete(doc(db, `${tenantPath}/costs`, grn.costEntryId));
    for (const matId of materialIds) {
      const snap = inventoryItemDocs[matId];
      if (!snap?.exists()) continue;
      const qty = (grn.lineItems || []).filter((i) => i.poLineRef === matId).reduce((a, c) => a + (c.acceptedQty || 0), 0);
      transaction.update(snap.ref, { quantity: Math.max(0, (snap.data().quantity || 0) - qty) });
    }
    transaction.delete(grnRef);
    // The bill this GRN came from is no longer posted: send it back for review.
    if (billDoc?.exists()) transaction.update(billDoc.ref, { status: "pending_review", grnIds: [], ledgerId: null });
    if (opts.deleteBillId) transaction.delete(doc(db, `${tenantPath}/vendor_bills`, opts.deleteBillId));
  });
}

export async function deleteGrn(tenantPath: string, grn: GoodsReceiptNote) {
  await reverseGrn(tenantPath, grn);
}

/** Delete a vendor bill; a posted one first has its goods receipt reversed. */
export async function deleteVendorBill(tenantPath: string, bill: VendorBill) {
  const grnIds = bill.status === "pending_review" ? [] : ((bill as any).grnIds || []) as string[];
  const grns: GoodsReceiptNote[] = [];
  for (const id of grnIds) {
    const snap = await getDoc(doc(db, `${tenantPath}/goodsReceiptNotes`, id));
    if (snap.exists()) grns.push({ id: snap.id, ...(snap.data() as any) });
  }
  if (!grns.length) {
    await deleteDoc(doc(db, `${tenantPath}/vendor_bills`, bill.id));
  } else {
    // One transaction per GRN; the bill goes with the last, so a failure
    // part-way leaves the bill in place to try again.
    for (let i = 0; i < grns.length; i++) await reverseGrn(tenantPath, grns[i], i === grns.length - 1 ? { deleteBillId: bill.id } : {});
  }
  // The scanned file, best-effort.
  for (const ext of ["pdf", "jpg"]) {
    await deleteObject(storageRef(getStorage(), `${tenantPath}/vendor_bills/${bill.id}/invoice.${ext}`)).catch(() => {});
  }
}
