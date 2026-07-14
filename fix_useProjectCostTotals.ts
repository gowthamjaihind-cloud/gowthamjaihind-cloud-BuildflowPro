import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/hooks/useProjectCostTotals.ts');
let content = fs.readFileSync(file, 'utf8');

// 1. Add laborRates to imports and query
if (!content.includes('"labor_rates"')) {
  // Find where useProjectDataQuery is used
  content = content.replace(
    'const { data: dailyLogs = [] } = useProjectDataQuery<any>(projectId, "dailyLogs");',
    'const { data: dailyLogs = [] } = useProjectDataQuery<any>(projectId, "dailyLogs");\n  const { data: laborRates = [] } = useProjectDataQuery<any>(projectId, "labor_rate_cards");'
  );
}

// 2. Add laborRates to useMemo dependencies
content = content.replace(
  '[tasks, entries, dailyLogs, laborLogs, inventory, materialIssues]',
  '[tasks, entries, dailyLogs, laborLogs, inventory, materialIssues, laborRates]'
);

// 3. Update logLab computation to include dailyLogs labour
const logLabRegex = /const logLab = laborLogs\.filter[\s\S]*?reduce\(\(s, i\) => s \+ i\.cost, 0\), 0\);/;
const replacementLogLab = `const logLab = laborLogs.filter((log) => log.items.some((item) => item.taskId === taskId)).reduce((sum, log) => sum + log.items.filter((item) => item.taskId === taskId).reduce((s, i) => s + i.cost, 0), 0);
        const dailyLogLab = dailyLogs.filter((log: any) => log.taskId === taskId).reduce((sum: number, log: any) => {
          return sum + (log.labour || []).reduce((s: number, l: any) => {
            const rateCard = laborRates.find((r: any) => r.id === l.roleId);
            const rate = rateCard ? rateCard.dailyRate : 0;
            return s + (l.headcount || 0) * rate;
          }, 0);
        }, 0);`;

if (content.match(logLabRegex)) {
  content = content.replace(logLabRegex, replacementLogLab);
}

// 4. Update actualLabor assignment
content = content.replace(
  'actualLabor = entryLab + logLab;',
  'actualLabor = entryLab + logLab + dailyLogLab;'
);

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed useProjectCostTotals.ts");
