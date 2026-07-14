import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/WBSView.tsx');
let content = fs.readFileSync(file, 'utf8');

const regex = /const \{ budgeted: taskBudgetedCost, actual: taskActualCost \} = taskTotals\[\s*task\.id\s*\] \|\| \{ budgeted: 0, actual: 0 \};/;
content = content.replace(
  regex,
  'const taskBudgetedCost = taskTotalsMap[task.id]?.totalPlanned || 0;\n    const taskActualCost = taskTotalsMap[task.id]?.totalActual || 0;'
);

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed renderTaskRow");
