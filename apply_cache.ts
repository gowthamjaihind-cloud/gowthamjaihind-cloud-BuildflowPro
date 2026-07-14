import fs from 'fs';
import path from 'path';

function patchFile(filePath: string, replaceLogic: (content: string) => string) {
  const fullPath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
      console.log("NOT FOUND:", filePath);
      return;
  }
  let content = fs.readFileSync(fullPath, 'utf8');
  
  if (!content.includes('import { useQueryClient }')) {
    content = content.replace('import React', 'import { useQueryClient } from "@tanstack/react-query";\nimport React');
  }

  content = replaceLogic(content);
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log("Patched correctly:", filePath);
}

// PurchaseOrderForm.tsx
patchFile('src/components/purchase/PurchaseOrderForm.tsx', (content) => {
  if (!content.includes("const queryClient = useQueryClient();")) {
      content = content.replace('  const { user } = useAuthStore();', '  const { user } = useAuthStore();\n  const queryClient = useQueryClient();');
  }
  return content.replace(
    /       onClose\(\);\n    \} catch \(e\) \{/,
    '       queryClient.invalidateQueries({ queryKey: [\'projectData\', projectId, \'purchase_orders\'] });\n       onClose();\n    } catch (e) {'
  );
});

// PurchaseOrderDetails.tsx
patchFile('src/components/purchase/PurchaseOrderDetails.tsx', (content) => {
  if (!content.includes("const queryClient = useQueryClient();")) {
      content = content.replace('  const { user } = useAuthStore();', '  const { user } = useAuthStore();\n  const queryClient = useQueryClient();');
  }
  return content.replace(
    /      onClose\(\);\n    \} catch \(err\) \{/,
    '      queryClient.invalidateQueries({ queryKey: [\'projectData\', projectId, \'purchase_orders\'] });\n      onClose();\n    } catch (err) {'
  );
});

// WBSView.tsx
patchFile('src/components/WBSView.tsx', (content) => {
  if (!content.includes("const queryClient = useQueryClient();")) {
      content = content.replace('  const breakpoint = useBreakpoint();', '  const breakpoint = useBreakpoint();\n  const queryClient = useQueryClient();');
  }
  content = content.replace(
    /      await addDoc\(collection\(db, path\), taskData\);\n      setNewTask\(\{/,
    '      await addDoc(collection(db, path), taskData);\n      queryClient.invalidateQueries({ queryKey: [\'projectData\', projectId, \'tasks\'] });\n      queryClient.invalidateQueries({ queryKey: [\'tasks\', projectId] });\n      setNewTask({'
  );
  content = content.replace(
    /        await updateDoc\(doc\(db, `\$\{basePath\}\/tasks\/\$\{selectedTask.id\}`\), taskData\);\n        setEditingTask\(null\);\n        setSelectedTask\(null\);\n      \} catch \(error\) \{/,
    '        await updateDoc(doc(db, `${basePath}/tasks/${selectedTask.id}`), taskData);\n        queryClient.invalidateQueries({ queryKey: [\'projectData\', projectId, \'tasks\'] });\n        queryClient.invalidateQueries({ queryKey: [\'tasks\', projectId] });\n        setEditingTask(null);\n        setSelectedTask(null);\n      } catch (error) {'
  );
  return content;
});

// MobileWBSView.tsx
patchFile('src/components/schedule/MobileWBSView.tsx', (content) => {
  if (!content.includes("const queryClient = useQueryClient();")) {
      content = content.replace('  const { user } = useAuthStore();', '  const { user } = useAuthStore();\n  const queryClient = useQueryClient();');
  }
  return content.replace(
    /        await addDoc\(collection\(db, `\$\{basePath\}\/tasks`\), newTask\);\n        setIsAdding\(null\);\n        setNewTaskData\(\{/,
    '        await addDoc(collection(db, `${basePath}/tasks`), newTask);\n        queryClient.invalidateQueries({ queryKey: [\'projectData\', projectId, \'tasks\'] });\n        queryClient.invalidateQueries({ queryKey: [\'tasks\', projectId] });\n        setIsAdding(null);\n        setNewTaskData({'
  );
});

// TabletWBSView.tsx
patchFile('src/components/schedule/TabletWBSView.tsx', (content) => {
  if (!content.includes("const queryClient = useQueryClient();")) {
      content = content.replace('  const { user } = useAuthStore();', '  const { user } = useAuthStore();\n  const queryClient = useQueryClient();');
  }
  return content.replace(
    /        await addDoc\(collection\(db, `\$\{basePath\}\/tasks`\), newTask\);\n        setIsAdding\(null\);\n        setNewTaskData\(\{/,
    '        await addDoc(collection(db, `${basePath}/tasks`), newTask);\n        queryClient.invalidateQueries({ queryKey: [\'projectData\', projectId, \'tasks\'] });\n        queryClient.invalidateQueries({ queryKey: [\'tasks\', projectId] });\n        setIsAdding(null);\n        setNewTaskData({'
  );
});
