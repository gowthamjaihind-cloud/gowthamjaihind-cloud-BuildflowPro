import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/hooks/useDailyLogs.ts');
let content = fs.readFileSync(file, 'utf8');

// Fix imports
content = content.replace(
  'import { runTransaction, collection, doc } from "firebase/firestore";\nimport { collection, query, where, orderBy, getDocs, doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";',
  'import { runTransaction, collection, query, where, orderBy, getDocs, doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";'
);

// We need to carefully rewrite useSaveDailyLog completely to avoid duplicates.
const extractSaveDailyLog = () => {
  const fileContent = fs.readFileSync(file, 'utf8');
  // Just rewrite useSaveDailyLog from scratch.
  
  const beforeStr = 'export function useSaveDailyLog(projectId: string) {';
  const afterStr = 'export function useUpdateDailyLog(projectId: string) {';
  
  const parts = fileContent.split(beforeStr);
  const part1 = parts[0];
  const part2 = parts[1].split(afterStr)[1];
  
  const newSaveLog = `export function useSaveDailyLog(projectId: string) {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newEntry: Omit<DailyLogEntry, "id" | "createdAt" | "createdByUid" | "createdByName">) => {
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

      // Update Task Progress
      if (newEntry.taskId) {
        const taskPath = getTenantPath(user, projectId, \`tasks/\${newEntry.taskId}\`);
        if (taskPath) {
          const taskRef = doc(db, taskPath);
          const updates: any = {
            progress: newEntry.progressPercent,
          };
          if (newEntry.markComplete || newEntry.progressPercent === 100) {
            updates.status = "Completed";
            updates.actualEndDate = newEntry.workDate;
          } else if (newEntry.progressPercent > 0) {
            updates.status = "In Progress";
            updates.actualStartDate = newEntry.workDate;
          }
          await updateDoc(taskRef, updates);
        }
      }
      
      return latestEntry;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.byTask(projectId, variables.taskId) });
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.all(projectId) });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'dailyLogs'] });
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.byDate(projectId, variables.workDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'tasks'] });
    },
  });
}

`;
  fs.writeFileSync(file, part1 + newSaveLog + afterStr + part2, 'utf8');
}
extractSaveDailyLog();
console.log("Fixed useDailyLogs.ts");
