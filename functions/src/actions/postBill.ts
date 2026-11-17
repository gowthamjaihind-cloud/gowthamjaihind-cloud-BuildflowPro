import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../db";
import { loadWho } from "./run";
import { denial } from "./permissions";
import { receiptFor } from "./billReceipt";
import { relinkToPo } from "../shared/lineMatch";

/**
 * Posting a scanned bill from the bot: the bill, its goods receipt (GRN), the
 * vendor payable, the cost accrual, inventory and the PO's received
 * quantities, in one transaction. A server copy of the app's Review & Post
 * (src/services/invoiceReceiptService.ts), field for field, so the Bills,
 * Goods Receipt and vendor screens cannot tell which one posted it.
 *
 * Who: managers and site engineers ("bill.post"), checked here because the
 * Admin SDK bypasses firestore.rules.
 */

const round2 = (n: number) => Math.round((Number(n) || 0) * 100 + Number.EPSILON) / 100;
const base = (orgId: string, projectId: string) => `organizations/${orgId}/projects/${projectId}`;

export interface BillCheck {
  billId: string; invoiceNumber: string; vendorId: string; vendorName: string; grandTotal: number;
  poId?: string; poNumber?: string; poStatus?: string;
  linked: { name: string; qty: number; unit: string; poLine: string }[];
  notOnPo: string[]; over: string[];
}

async function guard(uid: string, orgId: string, projectId: string) {
  const { who, user, project } = await loadWho(uid, orgId, projectId);
  if (!project) throw new HttpsError("not-found", "That project was not found.");
  const no = denial("bill.post", who);
  if (no) throw new HttpsError("permission-denied", no);
  return user;
}

/**
 * Link a pending bill to a PO (re-matching its lines to that PO's lines) and
 * say what posting it would do. Nothing is posted.
 */
export async function linkBillToPo(uid: string, orgId: string, projectId: string, billId: string, poId?: string): Promise<BillCheck> {
  await guard(uid, orgId, projectId);
  const billRef = db.doc(`${base(orgId, projectId)}/vendor_bills/${billId}`);
  const bill: any = (await billRef.get()).data();
  if (!bill) throw new HttpsError("not-found", "That bill was deleted.");
  if (bill.status !== "pending_review") throw new HttpsError("failed-precondition", "That bill is already posted.");
  const useId = poId || bill.poId;
  const poSnap = useId ? await db.doc(`${base(orgId, projectId)}/purchase_orders/${useId}`).get() : null;
  const po: any = poSnap?.exists ? poSnap.data() : null;
  if (po && poId && poId !== bill.poId) {
    bill.lineItems = relinkToPo(bill.lineItems || [], po.lineItems || []);
    bill.poId = poId;
    bill.poNumber = po.poNumber;
    await billRef.update({ lineItems: bill.lineItems, poId, poNumber: po.poNumber, matchStatus: "Has Discrepancies" });
  }
  const r = po ? receiptFor(bill, po) : { lines: [], over: [], notOnPo: (bill.lineItems || []).map((l: any) => l.name) };
  return {
    billId, invoiceNumber: String(bill.invoiceNumber || ""), vendorId: String(bill.vendorId || ""), vendorName: String(bill.vendorName || ""), grandTotal: Number(bill.grandTotal) || 0,
    ...(po ? { poId: useId, poNumber: String(po.poNumber || ""), poStatus: String(po.status || "") } : {}),
    linked: r.lines.map((l) => ({ name: l.name, qty: l.acceptedQty, unit: l.unit, poLine: (po?.lineItems || []).find((x: any) => x.itemId === l.poLineRef)?.name || "" })),
    notOnPo: r.notOnPo, over: r.over,
  };
}

/** POs a bill could be posted against (vendor's first), and that vendor's Drafts. */
export async function postablePos(orgId: string, projectId: string, vendorId: string) {
  const snap = await db.collection(`${base(orgId, projectId)}/purchase_orders`).where("status", "in", ["Approved", "Partially Received", "Draft"]).limit(100).get();
  const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const pick = (p: any) => ({ id: p.id as string, poNumber: String(p.poNumber || ""), vendorName: String(p.vendorName || ""), status: String(p.status || "") });
  const open = all.filter((p) => p.status !== "Draft");
  return {
    open: [...open.filter((p) => p.vendorId === vendorId), ...open.filter((p) => p.vendorId !== vendorId)].slice(0, 4).map(pick),
    drafts: all.filter((p) => p.status === "Draft" && p.vendorId === vendorId).slice(0, 2).map(pick),
  };
}

/** Post the bill and its goods receipt. */
export async function postBill(uid: string, orgId: string, projectId: string, billId: string): Promise<{ grnNumber: string; poNumber: string; grandTotal: number }> {
  const user = await guard(uid, orgId, projectId);
  const b = base(orgId, projectId);
  const billRef = db.doc(`${b}/vendor_bills/${billId}`);
  const counterRef = db.doc(`${b}/system/grnCounter`);
  const grnRef = db.collection(`${b}/goodsReceiptNotes`).doc();
  const ledgerRef = db.collection(`${b}/ledger`).doc();
  const costRef = db.collection(`${b}/costs`).doc();
  const by = { createdByUid: uid, createdByName: String(user.displayName || user.email || "Unknown") };

  return db.runTransaction(async (tx) => {
    // ---- READS ----
    const billSnap = await tx.get(billRef);
    const bill: any = billSnap.data();
    if (!bill) throw new HttpsError("not-found", "That bill was deleted.");
    if (bill.status !== "pending_review") throw new HttpsError("failed-precondition", "That bill is already posted.");
    if (!bill.poId) throw new HttpsError("failed-precondition", "Link the bill to an approved purchase order first.");
    const poRef = db.doc(`${b}/purchase_orders/${bill.poId}`);
    const poSnap = await tx.get(poRef);
    const po: any = poSnap.data();
    if (!po) throw new HttpsError("not-found", "The linked purchase order no longer exists.");
    if (po.status !== "Approved" && po.status !== "Partially Received") {
      throw new HttpsError("failed-precondition", `${po.poNumber} is ${po.status === "Draft" ? "still a Draft. Approve it first" : String(po.status).toLowerCase()}.`);
    }
    const { lines, over } = receiptFor(bill, po);
    if (!lines.length) throw new HttpsError("failed-precondition", `None of the bill's items match ${po.poNumber}'s items. Link them in the app (Bills, Review & Post).`);
    if (over.length) throw new HttpsError("failed-precondition", `This bill is more than is outstanding on ${po.poNumber}; it may already be recorded.\n${over.join("\n")}`);
    const vendorSnap = await tx.get(db.doc(`${b}/suppliers/${po.vendorId}`));
    const materialIds = [...new Set(lines.map((l) => l.poLineRef))];
    const invSnaps = await Promise.all(materialIds.map((id) => tx.get(db.doc(`${b}/inventory/${id}`))));
    const counter = await tx.get(counterRef);

    // ---- WRITES ----
    const n = (Number(counter.data()?.count) || 0) + 1;
    const grnNumber = `GRN-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
    const now = new Date().toISOString();
    const day = bill.invoiceDate || now.slice(0, 10);
    const ch = bill.charges || {};
    const chargesTotal = (Number(ch.loading) || 0) + (Number(ch.transport) || 0) + (Number(ch.other) || 0);
    const grandTotal = Number(bill.grandTotal) || 0;

    tx.set(grnRef, {
      id: grnRef.id, grnNumber, projectId, poId: bill.poId, poNumber: po.poNumber, vendorId: po.vendorId, vendorName: po.vendorName,
      receiptDate: day, ...(bill.invoiceNumber ? { challanNumber: bill.invoiceNumber } : {}), lineItems: lines,
      ...(chargesTotal > 0 ? { charges: ch } : {}), materialIds, billId, taxMode: "gst-itemized",
      ledgerId: ledgerRef.id, costEntryId: costRef.id, ...by, createdVia: "telegram", createdAt: now,
    });
    tx.update(billRef, { status: "posted", grnIds: [grnRef.id], ledgerId: ledgerRef.id, postedByUid: uid, postedByName: by.createdByName, postedAt: now });

    const updatedLines = (po.lineItems || []).map((item: any) => {
      const g = lines.find((x) => x.poLineRef === item.itemId);
      return g ? { ...item, receivedQty: (Number(item.receivedQty) || 0) + g.acceptedQty } : item;
    });
    const fully = updatedLines.every((i: any) => (Number(i.receivedQty) || 0) >= (Number(i.orderedQty) || 0));
    tx.update(poRef, { lineItems: updatedLines, status: fully ? "Completed" : "Partially Received" });

    if (vendorSnap.exists) tx.update(vendorSnap.ref, { outstandingBalance: (Number(vendorSnap.data()?.outstandingBalance) || 0) + grandTotal });
    tx.set(ledgerRef, {
      projectId, vendorId: po.vendorId, date: day, type: "CREDIT", amount: grandTotal, referenceType: "BILL", referenceId: billId,
      description: `Vendor bill ${bill.invoiceNumber || ""} (PO: ${po.poNumber}) incl. GST`,
    });
    tx.set(costRef, {
      id: costRef.id, projectId, date: day, category: "Material", type: "Actual", amount: round2((Number(bill.subtotalTaxable) || 0) + chargesTotal),
      description: `Vendor bill ${bill.invoiceNumber || ""} (${po.vendorName})`, taskId: "", isAccrual: true,
    });
    invSnaps.forEach((snap, k) => {
      if (!snap.exists) return;
      const d: any = snap.data();
      const mine = lines.filter((l) => l.poLineRef === materialIds[k]);
      const qNew = mine.reduce((a, l) => a + l.acceptedQty, 0);
      const cNew = round2(qNew > 0 ? mine.reduce((a, l) => a + l.acceptedQty * l.rate, 0) / qNew : 0);
      const qOld = Number(d.quantity) || 0;
      const cOld = Number(d.avgUnitCost || d.unitCost) || 0;
      const total = qOld + qNew;
      const fields: any = { quantity: total, avgUnitCost: round2(total > 0 ? (qOld * cOld + qNew * cNew) / total : cOld) };
      if (!d.unitCost) fields.unitCost = fields.avgUnitCost;
      tx.update(snap.ref, fields);
    });
    tx.set(counterRef, { count: n }, { merge: true });
    return { grnNumber, poNumber: String(po.poNumber || ""), grandTotal };
  });
}
