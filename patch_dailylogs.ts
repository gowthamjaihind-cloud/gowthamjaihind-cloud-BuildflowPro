import * as fs from "fs";

const file = "src/hooks/useDailyLogs.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
`      await runTransaction(db, async (transaction) => {
        // Handle Materials
        if (newEntry.materials && newEntry.materials.length > 0) {
          for (const mat of newEntry.materials) {
            if (mat.quantity > 0) {
              const invRef = doc(db, inventoryPath, mat.materialId);
              const invDoc = await transaction.get(invRef);
              if (invDoc.exists()) {
                const currentQty = invDoc.data().quantity || 0;
                transaction.update(invRef, {
                  quantity: Math.max(0, currentQty - mat.quantity)
                });
                
                const issueRef = doc(collection(db, issuesPath));
                transaction.set(issueRef, {
                  projectId,
                  date: newEntry.workDate,
                  taskId: newEntry.taskId,
                  materialId: mat.materialId,
                  quantity: mat.quantity,
                  unit: mat.unit,
                  notes: \`Daily Progress: \${newEntry.taskId}\`,
                  createdAt: now
                });
              }
            }
          }
        }
        transaction.set(newLogRef, latestEntry);
      });`,
`      await runTransaction(db, async (transaction) => {
        // All reads first
        const validMaterials = (newEntry.materials || []).filter(m => m.quantity > 0);
        const invDocs: Record<string, any> = {};
        for (const mat of validMaterials) {
            const invRef = doc(db, inventoryPath, mat.materialId);
            invDocs[mat.materialId] = await transaction.get(invRef);
        }

        // Now perform writes
        for (const mat of validMaterials) {
            const invDoc = invDocs[mat.materialId];
            if (invDoc && invDoc.exists()) {
                const currentQty = invDoc.data().quantity || 0;
                const invRef = doc(db, inventoryPath, mat.materialId);
                transaction.update(invRef, {
                  quantity: Math.max(0, currentQty - mat.quantity)
                });
                
                const issueRef = doc(collection(db, issuesPath));
                transaction.set(issueRef, {
                  projectId,
                  date: newEntry.workDate,
                  taskId: newEntry.taskId,
                  materialId: mat.materialId,
                  quantity: mat.quantity,
                  unit: mat.unit,
                  notes: \`Daily Progress: \${newEntry.taskId}\`,
                  createdAt: now
                });
            }
        }
        transaction.set(newLogRef, latestEntry);
      });`
);

fs.writeFileSync(file, content);
