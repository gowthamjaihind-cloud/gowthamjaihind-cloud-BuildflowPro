import {
  db,
  doc,
  collection,
  runTransaction,
} from "../firebase";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { updateDoc } from "firebase/firestore";
import { round2 } from "../utils/num";
import { UserProfile, VendorBill } from "../types";

const tenantPathFor = (user: any, projectId: string) =>
  user?.currentOrgId
    ? `organizations/${user.currentOrgId}/projects/${projectId}`
    : `projects/${projectId}`;

interface PostArgs {
  user: UserProfile;
  projectId: string;
  bill: VendorBill;          // reviewed draft (must have poId + gst-itemized lines)
  sourceFile?: File | null;  // scanned invoice, stored for audit
  draftBillId?: string;      // when posting a pending draft (e.g. from Telegram),
                             // reuse its doc id so the draft becomes the posted bill
}

// Posts a GST vendor invoice against its PO in one transaction:
//  • GRN (quantities, taxMode gst-itemized, ex-GST rate per line, billId link)
//  • Vendor Bill (money + tax) — this is the financial source of truth
//  • Vendor ledger CREDIT = grand total (incl-GST); the GRN posts NO separate
//    credit, so there's no double-count
//  • Inventory valued at the bill's ex-GST rate (cost stays ex-GST; GST is ITC)
//  • PO received quantities + status
// Returns { grnId, billId, grnNumber }.
export async function postInvoiceReceipt({ user, projectId, bill, sourceFile, draftBillId }: PostArgs) {
  if (!user) throw new Error("Not signed in.");
  if (!bill.poId) throw new Error("A matching PO is required to post this invoice.");

  const tenantPath = tenantPathFor(user, projectId);
  const grnId = doc(collection(db, `${tenantPath}/goodsReceiptNotes`)).id;
  // Reuse the pending draft's id when posting one, so it becomes the posted bill.
  const billId = draftBillId || doc(collection(db, `${tenantPath}/vendor_bills`)).id;

  let grnNumber = "";

  await runTransaction(db, async (transaction) => {
    const counterRef = doc(db, `${tenantPath}/system`, "grnCounter");
    const poRef = doc(db, `${tenantPath}/purchase_orders`, bill.poId!);

    // ---- READS FIRST ----
    const counterDoc = await transaction.get(counterRef);
    const poDoc = await transaction.get(poRef);
    if (!poDoc.exists()) throw new Error("The linked PO no longer exists.");
    const poData: any = poDoc.data();

    const vendorRef = doc(db, `${tenantPath}/suppliers`, poData.vendorId);
    const vendorDoc = await transaction.get(vendorRef);

    // Build GRN lines from bill lines that map to a PO line.
    const grnLines = (bill.lineItems || [])
      .filter((l) => l.poLineRef)
      .map((l) => {
        const poItem = (poData.lineItems || []).find((p: any) => p.itemId === l.poLineRef);
        return {
          poLineRef: l.poLineRef!,
          materialId: l.materialId || poItem?.materialId || l.poLineRef!,
          name: l.name,
          orderedQty: poItem?.orderedQty || 0,
          receivedQty: l.qty,
          acceptedQty: l.qty,
          rejectedQty: 0,
          unit: l.unit || poItem?.unit || "",
          rate: l.rate, // ex-GST — drives inventory valuation
        };
      });
    if (grnLines.length === 0) throw new Error("No invoice lines matched the PO.");

    const materialIds = Array.from(
      new Set(grnLines.map((l) => l.poLineRef).filter(Boolean)),
    ) as string[];
    const invDocs: Record<string, any> = {};
    for (const matId of materialIds) {
      invDocs[matId] = await transaction.get(doc(db, `${tenantPath}/inventory`, matId));
    }

    // ---- over-receipt guard (same as manual GRN) ----
    const over: string[] = [];
    grnLines.forEach((g) => {
      const poItem = (poData.lineItems || []).find((i: any) => i.itemId === g.poLineRef);
      if (!poItem) return;
      const remaining = (poItem.orderedQty || 0) - (poItem.receivedQty || 0);
      if (g.acceptedQty > remaining + 0.001) {
        over.push(`• ${g.name}: ${g.acceptedQty} but only ${remaining} remain.`);
      }
    });
    if (over.length) {
      const err: any = new Error(
        `This invoice exceeds what's outstanding on ${poData.poNumber}. It may already be recorded.\n\n${over.join("\n")}`,
      );
      err.isValidation = true;
      throw err;
    }

    // ---- GRN number ----
    const newCount = (counterDoc.exists() ? counterDoc.data()?.count || 0 : 0) + 1;
    grnNumber = `GRN-${new Date().getFullYear()}-${String(newCount).padStart(4, "0")}`;

    const ledgerRef = doc(collection(db, `${tenantPath}/ledger`));
    const costRef = doc(collection(db, `${tenantPath}/costs`));
    const grnRef = doc(db, `${tenantPath}/goodsReceiptNotes`, grnId);
    const billRef = doc(db, `${tenantPath}/vendor_bills`, billId);

    const chargesTotal =
      (bill.charges?.loading || 0) + (bill.charges?.transport || 0) + (bill.charges?.other || 0);
    const now = new Date().toISOString();

    // ---- GRN (physical receipt; no ledger credit of its own) ----
    transaction.set(grnRef, {
      id: grnId,
      grnNumber,
      projectId,
      poId: bill.poId,
      poNumber: poData.poNumber,
      vendorId: poData.vendorId,
      vendorName: poData.vendorName,
      receiptDate: bill.invoiceDate || now.split("T")[0],
      challanNumber: bill.invoiceNumber || undefined,
      lineItems: grnLines,
      charges: chargesTotal > 0 ? bill.charges : undefined,
      materialIds,
      billId,
      taxMode: "gst-itemized",
      ledgerId: ledgerRef.id,
      costEntryId: costRef.id,
      createdByUid: user.uid,
      createdByName: user.displayName || user.email || "Unknown",
      createdAt: now,
    });

    // ---- Vendor Bill (financial doc + GST) ----
    transaction.set(billRef, {
      ...bill,
      id: billId,
      projectId,
      status: "posted",
      grnIds: [grnId],
      ledgerId: ledgerRef.id,
      createdVia: bill.createdVia || "web",
      createdByUid: user.uid,
      createdByName: user.displayName || user.email || "Unknown",
      createdAt: now,
    });

    // ---- PO received qty + status ----
    const updatedLines = (poData.lineItems || []).map((item: any) => {
      const g = grnLines.find((x) => x.poLineRef === item.itemId);
      return g ? { ...item, receivedQty: (item.receivedQty || 0) + g.acceptedQty } : item;
    });
    const fully = updatedLines.every((i: any) => (i.receivedQty || 0) >= (i.orderedQty || 0));
    transaction.update(poRef, {
      lineItems: updatedLines,
      status: fully ? "Completed" : "Partially Received",
    });

    // ---- Vendor payable = incl-GST grand total (the Bill posts it) ----
    if (vendorDoc.exists()) {
      transaction.update(vendorRef, {
        outstandingBalance: (vendorDoc.data()?.outstandingBalance || 0) + bill.grandTotal,
      });
    }
    transaction.set(ledgerRef, {
      projectId,
      vendorId: poData.vendorId,
      date: bill.invoiceDate || now.split("T")[0],
      type: "CREDIT",
      amount: bill.grandTotal,
      referenceType: "BILL",
      referenceId: billId,
      description: `Vendor bill ${bill.invoiceNumber || ""} (PO: ${poData.poNumber}) incl. GST`,
    });

    // ---- Cost accrual (ex-GST material + freight); excluded from actuals like the manual GRN ----
    transaction.set(costRef, {
      id: costRef.id,
      projectId,
      date: bill.invoiceDate || now.split("T")[0],
      category: "Material",
      type: "Actual",
      amount: bill.subtotalTaxable + chargesTotal,
      description: `Vendor bill ${bill.invoiceNumber || ""} (${poData.vendorName})`,
      taskId: "",
      isAccrual: true,
    });

    // ---- Inventory: quantity up, valued at ex-GST rate ----
    for (const matId of materialIds) {
      const snap = invDocs[matId];
      if (!snap || !snap.exists()) continue;
      const data = snap.data();
      const lines = grnLines.filter((l) => l.poLineRef === matId);
      const qNew = lines.reduce((a, l) => a + l.acceptedQty, 0);
      const taxableNew = lines.reduce((a, l) => a + l.acceptedQty * (l.rate || 0), 0);
      const cNew = round2(qNew > 0 ? taxableNew / qNew : 0); // ex-GST unit cost
      const qExisting = data.quantity || 0;
      const cExisting = data.avgUnitCost || data.unitCost || 0;
      const totalQty = qExisting + qNew;
      const newAvg = round2(totalQty > 0 ? (qExisting * cExisting + qNew * cNew) / totalQty : cExisting);
      const fields: any = { quantity: totalQty, avgUnitCost: newAvg };
      if (!data.unitCost) fields.unitCost = newAvg;
      transaction.update(snap.ref, fields);
    }

    transaction.set(counterRef, { count: newCount }, { merge: true });
  });

  // ---- store the scanned invoice for audit (best-effort, after commit) ----
  if (sourceFile) {
    try {
      const ext = sourceFile.type === "application/pdf" ? "pdf" : "jpg";
      const path = `${tenantPath}/vendor_bills/${billId}/invoice.${ext}`;
      const sRef = storageRef(getStorage(), path);
      await uploadBytes(sRef, sourceFile);
      const url = await getDownloadURL(sRef);
      await updateDoc(doc(db, `${tenantPath}/vendor_bills`, billId), { sourceFileUrl: url });
    } catch (e) {
      console.error("Invoice file upload failed (bill saved without it):", e);
    }
  }

  return { grnId, billId, grnNumber };
}
