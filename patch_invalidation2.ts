import fs from 'fs';
import path from 'path';

function patchFile(filePath: string, changes: {match: string, replace: string}[]) {
  const fullPath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) return;
  let content = fs.readFileSync(fullPath, 'utf8');
  
  if (!content.includes('import { useQueryClient }')) {
    content = content.replace('import React', 'import { useQueryClient } from "@tanstack/react-query";\nimport React');
  }

  for (const c of changes) {
    content = content.replace(c.match, c.replace);
  }
  
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log("Patched:", filePath);
}

// MobileWBSView.tsx
patchFile('src/components/schedule/MobileWBSView.tsx', [
  {
    match: '  const { user } = useAuthStore();',
    replace: '  const { user } = useAuthStore();\n  const queryClient = useQueryClient();'
  },
  {
    match: '        await addDoc(collection(db, `${basePath}/tasks`), newTask);\n        setIsAdding(null);\n        setNewTaskData({',
    replace: '        await addDoc(collection(db, `${basePath}/tasks`), newTask);\n        queryClient.invalidateQueries({ queryKey: [\'projectData\', projectId, \'tasks\'] });\n        queryClient.invalidateQueries({ queryKey: [\'tasks\', projectId] });\n        setIsAdding(null);\n        setNewTaskData({'
  }
]);

// TabletWBSView.tsx
patchFile('src/components/schedule/TabletWBSView.tsx', [
  {
    match: '  const { user } = useAuthStore();',
    replace: '  const { user } = useAuthStore();\n  const queryClient = useQueryClient();'
  },
  {
    match: '        await addDoc(collection(db, `${basePath}/tasks`), newTask);\n        setIsAdding(null);\n        setNewTaskData({',
    replace: '        await addDoc(collection(db, `${basePath}/tasks`), newTask);\n        queryClient.invalidateQueries({ queryKey: [\'projectData\', projectId, \'tasks\'] });\n        queryClient.invalidateQueries({ queryKey: [\'tasks\', projectId] });\n        setIsAdding(null);\n        setNewTaskData({'
  }
]);
