import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { db } from "../db";


async function deletePhotos(photoUrls: string[]) {
  if (!photoUrls || !Array.isArray(photoUrls) || photoUrls.length === 0) return;
  const bucket = admin.storage().bucket();
  for (const photoUrl of photoUrls) {
    try {
      const urlObj = new URL(photoUrl);
      const pathPos = urlObj.pathname.indexOf('/o/');
      if (pathPos !== -1) {
        const fileParams = urlObj.pathname.substring(pathPos + 3);
        const filePath = decodeURIComponent(fileParams);
        await bucket.file(filePath).delete().catch(e => {
          // Ignore if it's already deleted (404)
          console.error("Failed to delete photo from storage", e);
        });
      }
    } catch (e) {
      console.error("Error parsing photo URL", photoUrl, e);
    }
  }
}

async function handleDailyLogRollup(
  projectId: string,
  taskId: string,
  logsPath: string,
  taskRef: admin.firestore.DocumentReference
) {
  const allLogsSnap = await db.collection(logsPath).where("taskId", "==", taskId).get();
  const allLogs = allLogsSnap.docs.map((d) => d.data() as any);

  if (allLogs.length === 0) {
    // If all logs deleted, we don't strictly have to reset, but let's be safe
    // The prompt says "recomputes [...] actualEndDate [...] cleared if none."
    const taskSnap = await taskRef.get();
    if (taskSnap.exists) {
      const currentTask = taskSnap.data() || {};
      let nextStatus = currentTask.status || "Pending";
      if (nextStatus === "Completed" || nextStatus === "In Progress") {
        nextStatus = "Pending";
      }

      await taskRef.update({
        progress: 0,
        actualStartDate: admin.firestore.FieldValue.delete(),
        actualEndDate: admin.firestore.FieldValue.delete(),
        status: nextStatus,
      });
    }
    return;
  }

  // 1. actualStartDate: earliest workDate
  let actualStart = allLogs[0].workDate;
  for (const log of allLogs) {
    if (log.workDate < actualStart) {
      actualStart = log.workDate;
    }
  }

  // 2. actualEndDate: LATEST completing entry's workDate
  const completingEntries = allLogs.filter((log) => log.markComplete || log.progressPercent === 100);
  let actualEnd: string | null = null;
  if (completingEntries.length > 0) {
    // Sort descending by workDate
    const sortedCompletions = completingEntries.sort((a, b) => b.workDate.localeCompare(a.workDate));
    actualEnd = sortedCompletions[0].workDate;
  }

  // 3. progress: latest workDate (tie-break createdAt desc)
  const sortedLogsDesc = [...allLogs].sort((a, b) => {
    if (a.workDate !== b.workDate) {
      return b.workDate.localeCompare(a.workDate);
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
  const currentProgress = sortedLogsDesc[0].progressPercent;

  // 4. status auto advance
  const taskSnap = await taskRef.get();
  if (!taskSnap.exists) return; // Task got deleted
  const taskData = taskSnap.data() || {};

  let currentStatus = taskData.status || "Pending";
  if (currentProgress > 0 && currentStatus === "Pending") {
    currentStatus = "In Progress";
  }
  if (currentProgress >= 100 || sortedLogsDesc[0].markComplete) {
    currentStatus = "Completed";
  } else if (currentStatus === "Completed" && currentProgress < 100) {
    // In case of correction undoing completion
    currentStatus = "In Progress";
  }

  const updates: any = {
    progress: currentProgress,
    actualStartDate: actualStart,
    status: currentStatus,
  };

  if (actualEnd) {
    updates.actualEndDate = actualEnd;
  } else {
    updates.actualEndDate = admin.firestore.FieldValue.delete();
  }

  await taskRef.update(updates);
}

async function handleInventoryRollup(
  logsPath: string,
  inventoryPath: string,
  beforeData: any,
  afterData: any
) {
  const materialsToUpdate = new Set<string>();

  if (beforeData?.materials) {
    beforeData.materials.forEach((m: any) => {
      if (m.materialId) materialsToUpdate.add(m.materialId);
    });
  }
  if (afterData?.materials) {
    afterData.materials.forEach((m: any) => {
      if (m.materialId) materialsToUpdate.add(m.materialId);
    });
  }

  if (materialsToUpdate.size === 0) return;

  const allLogsSnap = await db.collection(logsPath).get();

  const consumptionByMaterial = new Map<string, number>();
  for (const matId of materialsToUpdate) {
    consumptionByMaterial.set(matId, 0);
  }

  for (const doc of allLogsSnap.docs) {
    const data = doc.data();
    if (data.materials && Array.isArray(data.materials)) {
      for (const m of data.materials) {
        if (m.materialId && materialsToUpdate.has(m.materialId)) {
          const curr = consumptionByMaterial.get(m.materialId) || 0;
          consumptionByMaterial.set(m.materialId, curr + (m.quantity || 0));
        }
      }
    }
  }

  const batch = db.batch();
  for (const [matId, totalConsumed] of consumptionByMaterial.entries()) {
    const invRef = db.doc(`${inventoryPath}/${matId}`);
    batch.update(invRef, { consumed: totalConsumed });
  }

  await batch.commit().catch(e => console.error("Error committing inventory updates", e));
}

export const onProjectDailyLogWritten = onDocumentWritten(
  "projects/{projectId}/dailyLogs/{logId}",
  async (event: any) => {
    const { projectId } = event.params;
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    const logData = afterData || beforeData;
    if (!logData) return;

    if (!afterData && beforeData?.photoUrls) {
      // Document was deleted. Clean up storage files.
      await deletePhotos(beforeData.photoUrls);
    }

    const logsPath = `projects/${projectId}/dailyLogs`;
    const inventoryPath = `projects/${projectId}/inventory`;

    if (logData.taskId) {
      const taskRef = db.doc(`projects/${projectId}/tasks/${logData.taskId}`);
      await handleDailyLogRollup(projectId, logData.taskId, logsPath, taskRef);
    }
    
    await handleInventoryRollup(logsPath, inventoryPath, beforeData, afterData);
  }
);

export const onOrgDailyLogWritten = onDocumentWritten(
  "organizations/{orgId}/projects/{projectId}/dailyLogs/{logId}",
  async (event: any) => {
    const { orgId, projectId } = event.params;
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    const logData = afterData || beforeData;
    if (!logData) return;

    if (!afterData && beforeData?.photoUrls) {
      // Document was deleted. Clean up storage files.
      await deletePhotos(beforeData.photoUrls);
    }

    const logsPath = `organizations/${orgId}/projects/${projectId}/dailyLogs`;
    const inventoryPath = `organizations/${orgId}/projects/${projectId}/inventory`;

    if (logData.taskId) {
      const taskRef = db.doc(`organizations/${orgId}/projects/${projectId}/tasks/${logData.taskId}`);
      await handleDailyLogRollup(projectId, logData.taskId, logsPath, taskRef);
    }

    await handleInventoryRollup(logsPath, inventoryPath, beforeData, afterData);
  }
);
