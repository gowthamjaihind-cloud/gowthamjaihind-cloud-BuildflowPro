import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/hooks/useDailyLogs.ts');
let content = fs.readFileSync(file, 'utf8');

const saveMutationOld = `      await setDoc(newLogRef, latestEntry);
      
      return latestEntry;`;
const saveMutationNew = `      await setDoc(newLogRef, latestEntry);

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
      
      return latestEntry;`;

if (content.includes(saveMutationOld)) {
  content = content.replace(saveMutationOld, saveMutationNew);
}

const updateMutationOld = `      await updateDoc(logRef, updates);

      // Write audit log`;
const updateMutationNew = `      await updateDoc(logRef, updates);

      // Update Task Progress if changed
      if (updates.taskId || oldLog.taskId) {
        const targetTaskId = updates.taskId || oldLog.taskId;
        const taskPath = getTenantPath(user, projectId, \`tasks/\${targetTaskId}\`);
        if (taskPath) {
          const taskRef = doc(db, taskPath);
          const taskUpdates: any = {};
          if (updates.progressPercent !== undefined) {
            taskUpdates.progress = updates.progressPercent;
            if (updates.markComplete || updates.progressPercent === 100) {
              taskUpdates.status = "Completed";
              taskUpdates.actualEndDate = updates.workDate || oldLog.workDate;
            } else if (updates.progressPercent > 0) {
              taskUpdates.status = "In Progress";
              // Don't overwrite actualStartDate for updates unless needed, but let's just set it
            }
          }
          if (Object.keys(taskUpdates).length > 0) {
            await updateDoc(taskRef, taskUpdates);
          }
        }
      }

      // Write audit log`;

if (content.includes(updateMutationOld)) {
  content = content.replace(updateMutationOld, updateMutationNew);
}

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed task update logic");
