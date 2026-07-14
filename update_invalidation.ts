import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/hooks/useDailyLogs.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'queryClient.invalidateQueries({ queryKey: dailyLogKeys.byTask(projectId, variables.taskId) });',
  'queryClient.invalidateQueries({ queryKey: dailyLogKeys.byTask(projectId, variables.taskId) });\n      queryClient.invalidateQueries({ queryKey: dailyLogKeys.all(projectId) });\n      queryClient.invalidateQueries({ queryKey: [\'projectData\', projectId, \'dailyLogs\'] });'
);

content = content.replace(
  'queryClient.invalidateQueries({ queryKey: dailyLogKeys.byTask(projectId, data.taskId) });',
  'queryClient.invalidateQueries({ queryKey: dailyLogKeys.byTask(projectId, data.taskId) });\n      queryClient.invalidateQueries({ queryKey: dailyLogKeys.all(projectId) });\n      queryClient.invalidateQueries({ queryKey: [\'projectData\', projectId, \'dailyLogs\'] });'
);

fs.writeFileSync(file, content, 'utf8');
console.log("Updated invalidation");
