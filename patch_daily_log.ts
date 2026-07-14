import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/hooks/useDailyLogs.ts');
let content = fs.readFileSync(file, 'utf8');

const importRegex = /import \{ queryKeys \} from "\.\.\/lib\/react-query";/;
content = content.replace(importRegex, `import { queryKeys } from "../lib/react-query";\nimport { runTransaction, collection, doc } from "firebase/firestore";`);

const saveMutationStartRegex = /mutationFn: async \(newEntry: Omit<DailyLogEntry, "id" \| "createdAt" \| "createdByUid" \| "createdByName">\) => \{/;

const newSaveMutation = `mutationFn: async (newEntry: Omit<DailyLogEntry, "id" | "createdAt" | "createdByUid" | "createdByName">) => {
      if (!user) throw new Error("Unauthenticated");
      
      const logsPath = getTenantPath(user, projectId, "dailyLogs");
      const inventoryPath = getTenantPath(user, projectId, "inventory");
      const issuesPath = getTenantPath(user, projectId, "material_issues");
      if (!logsPath || !inventoryPath || !issuesPath) throw new Error("Invalid path");
      
      const now = new Date().toISOString();
      const newLogRef = doc(collection(db, logsPath));
      
      const latestEntry: DailyLogEntry = {
        ...newEntry,
        id: newLogRef.id,
        createdAt: now,
        createdByUid: user.uid,
        createdByName: user.displayName || user.email || "Unknown",
      };

      await runTransaction(db, async (transaction) => {
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
      });
`;

content = content.replace(saveMutationStartRegex, newSaveMutation);

// Also remove the old `await setDoc(newLogRef, latestEntry);`
content = content.replace('      await setDoc(newLogRef, latestEntry);', '');

fs.writeFileSync(file, content, 'utf8');
console.log("Patched daily logs hook");
