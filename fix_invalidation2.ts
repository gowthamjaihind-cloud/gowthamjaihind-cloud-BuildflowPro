import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/hooks/useDailyLogs.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /queryClient\.invalidateQueries\(\{ queryKey: queryKeys\.tasks\(projectId\) \}\);/g,
  "queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });\n      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'tasks'] });"
);

// We should replace duplicates if any:
content = content.replace(
  /(queryClient\.invalidateQueries\(\{ queryKey: \['projectData', projectId, 'tasks'\] \}\);\s*)+/g,
  "queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'tasks'] });\n      "
);

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed invalidation 2");
