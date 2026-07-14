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

// PurchaseOrderForm.tsx
patchFile('src/components/purchase/PurchaseOrderForm.tsx', [
  {
    match: '  const { user } = useAuthStore();',
    replace: '  const { user } = useAuthStore();\n  const queryClient = useQueryClient();'
  },
  {
    match: '       onClose();\n    } catch (error) {',
    replace: '       queryClient.invalidateQueries({ queryKey: [\'projectData\', projectId, \'purchase_orders\'] });\n       onClose();\n    } catch (error) {'
  }
]);

// PurchaseOrderDetails.tsx
patchFile('src/components/purchase/PurchaseOrderDetails.tsx', [
  {
    match: '  const { user } = useAuthStore();',
    replace: '  const { user } = useAuthStore();\n  const queryClient = useQueryClient();'
  },
  {
    match: '      onClose();\n    } catch (error) {',
    replace: '      queryClient.invalidateQueries({ queryKey: [\'projectData\', projectId, \'purchase_orders\'] });\n      onClose();\n    } catch (error) {'
  }
]);

// WBSView.tsx
patchFile('src/components/WBSView.tsx', [
  {
    match: '  const breakpoint = useBreakpoint();',
    replace: '  const breakpoint = useBreakpoint();\n  const queryClient = useQueryClient();'
  },
  {
    match: '      await addDoc(collection(db, path), taskData);\n      setNewTask({',
    replace: '      await addDoc(collection(db, path), taskData);\n      queryClient.invalidateQueries({ queryKey: [\'projectData\', projectId, \'tasks\'] });\n      queryClient.invalidateQueries({ queryKey: [\'tasks\', projectId] });\n      setNewTask({'
  },
  {
    match: '        await updateDoc(doc(db, `${basePath}/tasks/${selectedTask.id}`), taskData);\n        setEditingTask(null);\n        setSelectedTask(null);\n      } catch (error) {',
    replace: '        await updateDoc(doc(db, `${basePath}/tasks/${selectedTask.id}`), taskData);\n        queryClient.invalidateQueries({ queryKey: [\'projectData\', projectId, \'tasks\'] });\n        queryClient.invalidateQueries({ queryKey: [\'tasks\', projectId] });\n        setEditingTask(null);\n        setSelectedTask(null);\n      } catch (error) {'
  }
]);
