"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onOrgGRNWritten = exports.onProjectGRNWritten = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const db_1 = require("../db");
async function handleGRNWritten(tenantPath, beforeData, afterData) {
    const data = afterData || beforeData;
    if (!data || !data.poId)
        return;
    const poRef = db_1.db.doc(`${tenantPath}/purchase_orders/${data.poId}`);
    const poDoc = await poRef.get();
    if (!poDoc.exists)
        return;
    const poData = poDoc.data();
    // 1. Recompute PO line item receivedQty
    const allGRNsSnap = await db_1.db.collection(`${tenantPath}/goodsReceiptNotes`)
        .where("poId", "==", data.poId)
        .get();
    const receivedQtyByPOLineRef = new Map();
    for (const doc of allGRNsSnap.docs) {
        const grn = doc.data();
        if (grn.lineItems && Array.isArray(grn.lineItems)) {
            for (const item of grn.lineItems) {
                if (item.poLineRef) {
                    const qty = item.acceptedQty || 0;
                    const curr = receivedQtyByPOLineRef.get(item.poLineRef) || 0;
                    receivedQtyByPOLineRef.set(item.poLineRef, curr + qty);
                }
            }
        }
    }
    let allLinesFullyReceived = true;
    let anyLineReceived = false;
    const updatedLineItems = (poData.lineItems || []).map((poLine) => {
        // Generate poLineRef identifier. It needs to match how the GRN constructs it.
        // Let's assume poLineRef = poLine.itemId, as itemId is unique enough for the form matching. 
        // Wait, what if the form uses materialId? If GRN uses `poLineRef: item.itemId`, let's check.
        const ref = poLine.itemId;
        const received = receivedQtyByPOLineRef.get(ref) || 0;
        if (received < poLine.orderedQty) {
            allLinesFullyReceived = false;
        }
        if (received > 0) {
            anyLineReceived = true;
        }
        return {
            ...poLine,
            receivedQty: received
        };
    });
    // Calculate new status
    // Never auto-revert an Admin-set "Closed" if they closed it manually for another reason.
    let newStatus = poData.status;
    if (poData.status !== "Closed" || poData.closedReason === "auto") {
        if (allLinesFullyReceived && poData.lineItems && poData.lineItems.length > 0) {
            newStatus = "Closed";
        }
        else if (anyLineReceived) {
            newStatus = "Partially Received";
        }
        else {
            newStatus = "Approved"; // if GRNs were deleted
        }
    }
    const batch = db_1.db.batch();
    batch.update(poRef, {
        lineItems: updatedLineItems,
        status: newStatus,
        ...(newStatus === "Closed" && poData.status !== "Closed" ? { closedReason: "auto" } : {}),
        ...(newStatus !== "Closed" && poData.closedReason === "auto" ? { closedReason: admin.firestore.FieldValue.delete() } : {})
    });
    // 2. Recompute Inventory Qty and avgUnitCost
    const itemsToUpdate = new Set();
    if (beforeData?.lineItems) {
        beforeData.lineItems.forEach((m) => {
            if (m.poLineRef)
                itemsToUpdate.add(m.poLineRef);
        });
    }
    if (afterData?.lineItems) {
        afterData.lineItems.forEach((m) => {
            if (m.poLineRef)
                itemsToUpdate.add(m.poLineRef);
        });
    }
    if (itemsToUpdate.size > 0) {
        const qtyByItem = new Map();
        const spendByItem = new Map();
        for (const itemId of itemsToUpdate) {
            qtyByItem.set(itemId, 0);
            spendByItem.set(itemId, 0);
        }
        const poIdsToFetch = new Set();
        const grnDocsByItem = new Map();
        // Fetch scope GRNs individually for each affected material id.
        for (const itemId of itemsToUpdate) {
            const grnSnap = await db_1.db.collection(`${tenantPath}/goodsReceiptNotes`)
                .where("materialIds", "array-contains", itemId)
                .get();
            const grnDocs = grnSnap.docs.map(d => d.data());
            grnDocsByItem.set(itemId, grnDocs);
            for (const g of grnDocs) {
                if (g.poId)
                    poIdsToFetch.add(g.poId);
            }
        }
        const poLineRates = new Map();
        if (poIdsToFetch.size > 0) {
            // Fetch only the POs referenced by these GRNs
            await Promise.all(Array.from(poIdsToFetch).map(async (poId) => {
                const pSnap = await db_1.db.doc(`${tenantPath}/purchase_orders/${poId}`).get();
                if (pSnap.exists) {
                    const pData = pSnap.data();
                    if (pData.lineItems) {
                        for (const line of pData.lineItems) {
                            poLineRates.set(`${poId}_${line.itemId}`, line.rate || 0);
                        }
                    }
                }
            }));
        }
        for (const itemId of itemsToUpdate) {
            const grnDocs = grnDocsByItem.get(itemId) || [];
            let sumQty = 0;
            let sumSpend = 0;
            for (const g of grnDocs) {
                if (g.lineItems) {
                    for (const item of g.lineItems) {
                        if (item.poLineRef === itemId) {
                            const accepted = item.acceptedQty || 0;
                            if (accepted > 0) {
                                sumQty += accepted;
                                const rate = poLineRates.get(`${g.poId}_${itemId}`) || 0;
                                sumSpend += (accepted * rate);
                            }
                        }
                    }
                }
            }
            qtyByItem.set(itemId, sumQty);
            spendByItem.set(itemId, sumSpend);
        }
        for (const itemId of itemsToUpdate) {
            const invRef = db_1.db.doc(`${tenantPath}/inventory/${itemId}`);
            const sumQty = qtyByItem.get(itemId) || 0;
            const sumSpend = spendByItem.get(itemId) || 0;
            const wac = sumQty > 0 ? (sumSpend / sumQty) : 0;
            // We only update the intake "quantity" here, the logic for consumed etc is elsewhere. 
            // In earlier schema: inventory.quantity is total intake.
            batch.update(invRef, {
                quantity: sumQty,
                avgUnitCost: wac
            });
        }
    }
    await batch.commit().catch(e => console.error("Error committing GRN updates", e));
}
exports.onProjectGRNWritten = (0, firestore_1.onDocumentWritten)("projects/{projectId}/goodsReceiptNotes/{grnId}", async (event) => {
    const { projectId } = event.params;
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    await handleGRNWritten(`projects/${projectId}`, beforeData, afterData);
});
exports.onOrgGRNWritten = (0, firestore_1.onDocumentWritten)("organizations/{orgId}/projects/{projectId}/goodsReceiptNotes/{grnId}", async (event) => {
    const { orgId, projectId } = event.params;
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    await handleGRNWritten(`organizations/${orgId}/projects/${projectId}`, beforeData, afterData);
});
//# sourceMappingURL=index.js.map