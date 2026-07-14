import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/WBSView.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add import
if (!content.includes('useProjectCostTotals')) {
  content = content.replace(
    'import { useBreakpoint } from "../hooks/useBreakpoint";',
    'import { useBreakpoint } from "../hooks/useBreakpoint";\nimport { useProjectCostTotals } from "../hooks/useProjectCostTotals";'
  );
}

// 2. Call hook
if (!content.includes('const { taskTotalsMap } = useProjectCostTotals(projectId);')) {
  content = content.replace(
    'const { data: laborLogs = [] } = useProjectData<any>(projectId, "labor_logs");',
    'const { data: laborLogs = [] } = useProjectData<any>(projectId, "labor_logs");\n\n  const { taskTotalsMap } = useProjectCostTotals(projectId);'
  );
}

// 3. Remove taskTotals useMemo
const taskTotalsRegex = /const taskTotals = useMemo\(\(\) => \{[\s\S]*?\}, \[tasks, entries, materialIssues, laborLogs\]\);/;
if (taskTotalsRegex.test(content)) {
  content = content.replace(taskTotalsRegex, '');
} else {
  console.log("Could not find taskTotals useMemo block!");
}

// 4. Update usage in renderTaskRow
content = content.replace(
  /const { budgeted: taskBudgetedCost, actual: taskActualCost } = taskTotals\[[\s\S]*?\] || \{ budgeted: 0, actual: 0 \};/,
  'const taskBudgetedCost = taskTotalsMap[task.id]?.totalPlanned || 0;\n    const taskActualCost = taskTotalsMap[task.id]?.totalActual || 0;'
);

fs.writeFileSync(file, content, 'utf8');
console.log("Done");
