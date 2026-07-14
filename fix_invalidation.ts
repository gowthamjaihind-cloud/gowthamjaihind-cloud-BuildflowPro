import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/hooks/useDailyLogs.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });",
  "queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });\n      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'tasks'] });"
);

// We need to also do this in update mutation.
const updateSuccess = `    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.byTask(projectId, variables.updates.taskId || variables.oldLog.taskId) });
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.all(projectId) });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'dailyLogs'] });
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.byDate(projectId, variables.updates.workDate || variables.oldLog.workDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'tasks'] });
    },`;

content = content.replace(/onSuccess: \(\_, variables\) => \{\n      queryClient\.invalidateQueries\(\{ queryKey: dailyLogKeys\.byTask\(projectId, variables\.updates\.taskId \|\| variables\.oldLog\.taskId\) \}\);\n      queryClient\.invalidateQueries\(\{ queryKey: dailyLogKeys\.all\(projectId\) \}\);\n      queryClient\.invalidateQueries\(\{ queryKey: \['projectData', projectId, 'dailyLogs'\] \}\);\n      queryClient\.invalidateQueries\(\{ queryKey: dailyLogKeys\.byDate\(projectId, variables\.updates\.workDate \|\| variables\.oldLog\.workDate\) \}\);\n    \},/g, updateSuccess);

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed invalidation");
