import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/hooks/useDailyLogs.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'queryClient.invalidateQueries({ queryKey: dailyLogKeys.byTask(projectId, deletedLog.taskId) });',
  'queryClient.invalidateQueries({ queryKey: dailyLogKeys.byTask(projectId, deletedLog.taskId) });\n      queryClient.invalidateQueries({ queryKey: [\'projectData\', projectId, \'dailyLogs\'] });'
);

fs.writeFileSync(file, content, 'utf8');
console.log("Updated delete");
