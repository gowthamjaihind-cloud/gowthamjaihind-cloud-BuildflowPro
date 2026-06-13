import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

const db = admin.firestore();

async function handleReceiptWAC(
  receiptsPath: string,
  inventoryPath: string,
  beforeData: any,
  afterData: any
) {
  const materialsToUpdate = new Set<string>();

  if (beforeData?.items) {
    beforeData.items.forEach((m: any) => {
      if (m.itemId) materialsToUpdate.add(m.itemId);
    });
  }
  if (afterData?.items) {
    afterData.items.forEach((m: any) => {
      if (m.itemId) materialsToUpdate.add(m.itemId);
    });
  }

  if (materialsToUpdate.size === 0) return;

  const allReceiptsSnap = await db.collection(receiptsPath).get();

  const spendByMaterial = new Map<string, number>();
  const quantityByMaterial = new Map<string, number>();
  
  for (const matId of materialsToUpdate) {
    spendByMaterial.set(matId, 0);
    quantityByMaterial.set(matId, 0);
  }

  for (const doc of allReceiptsSnap.docs) {
    const data = doc.data();
    if (data.items && Array.isArray(data.items)) {
      for (const item of data.items) {
        if (item.itemId && materialsToUpdate.has(item.itemId)) {
          const qty = item.quantity || 0;
          let cost = 0;
          if (item.totalPrice !== undefined) {
             cost = item.totalPrice;
          } else {
             cost = qty * (item.unitRate || 0);
          }
          
          if (qty > 0) {
            const currSpend = spendByMaterial.get(item.itemId) || 0;
            const currQty = quantityByMaterial.get(item.itemId) || 0;
            spendByMaterial.set(item.itemId, currSpend + cost);
            quantityByMaterial.set(item.itemId, currQty + qty);
          }
        }
      }
    }
  }

  const batch = db.batch();
  for (const matId of materialsToUpdate) {
    const invRef = db.doc(`${inventoryPath}/${matId}`);
    const sumSpend = spendByMaterial.get(matId) || 0;
    const sumQty = quantityByMaterial.get(matId) || 0;
    
    // We set avgUnitCost to 0 if all receipts were deleted or quantity sum is 0.
    const wac = sumQty > 0 ? (sumSpend / sumQty) : 0;
    
    batch.update(invRef, { avgUnitCost: wac });
  }

  await batch.commit().catch(e => console.error("Error committing WAC updates", e));
}

export const onProjectReceiptWritten = onDocumentWritten(
  "projects/{projectId}/receipts/{receiptId}",
  async (event: any) => {
    const { projectId } = event.params;
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    const logData = afterData || beforeData;
    if (!logData) return;

    const receiptsPath = `projects/${projectId}/receipts`;
    const inventoryPath = `projects/${projectId}/inventory`;

    await handleReceiptWAC(receiptsPath, inventoryPath, beforeData, afterData);
  }
);

export const onOrgReceiptWritten = onDocumentWritten(
  "organizations/{orgId}/projects/{projectId}/receipts/{receiptId}",
  async (event: any) => {
    const { orgId, projectId } = event.params;
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    const logData = afterData || beforeData;
    if (!logData) return;

    const receiptsPath = `organizations/${orgId}/projects/${projectId}/receipts`;
    const inventoryPath = `organizations/${orgId}/projects/${projectId}/inventory`;

    await handleReceiptWAC(receiptsPath, inventoryPath, beforeData, afterData);
  }
);
