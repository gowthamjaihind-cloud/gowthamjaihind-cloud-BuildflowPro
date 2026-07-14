import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/LaborTrackingView.tsx');
let content = fs.readFileSync(file, 'utf8');

// Import DailyLogEntry
content = content.replace(
  'import { Vendor, LaborRateCard, RABill, VendorLedgerEntry, DailyLaborLog } from "../types";',
  'import { Vendor, LaborRateCard, RABill, VendorLedgerEntry, DailyLaborLog, DailyLogEntry, LaborLogLineItem } from "../types";'
);

// Import useProjectDataQuery
content = content.replace(
  'import { useTasksQuery } from "../hooks/queries";',
  'import { useTasksQuery, useProjectDataQuery } from "../hooks/queries";\nimport { useMemo } from "react";'
);

// Replace laborLogs
const oldQuery = `  const { data: laborLogs } = useProjectData<DailyLaborLog>(
    projectId,
    "labor_logs",
    "date",
    "desc",
  );`;

const newQuery = `  const { data: dailyLogs } = useProjectDataQuery<DailyLogEntry>(projectId, "dailyLogs");

  const laborLogs = useMemo(() => {
    if (!dailyLogs || !rateCards || !tasks || !vendors) return [];
    const logs: DailyLaborLog[] = [];
    
    dailyLogs.forEach((dailyLog) => {
      const vendorItems: Record<string, LaborLogLineItem[]> = {};
      
      dailyLog.labour?.forEach((labourItem) => {
        const rateCard = rateCards.find(r => r.id === labourItem.roleId);
        if (rateCard) {
          if (!vendorItems[rateCard.vendorId]) {
            vendorItems[rateCard.vendorId] = [];
          }
          vendorItems[rateCard.vendorId].push({
            taskId: dailyLog.taskId,
            taskName: tasks.find(t => t.id === dailyLog.taskId)?.name || "Unknown Task",
            role: rateCard.role,
            headcount: labourItem.headcount,
            shifts: 1, 
            rate: rateCard.rate,
            cost: labourItem.headcount * 1 * rateCard.rate,
          });
        }
      });

      Object.entries(vendorItems).forEach(([vendorId, items]) => {
        const vendor = vendors.find(v => v.id === vendorId);
        const totalCost = items.reduce((sum, i) => sum + i.cost, 0);
        logs.push({
          id: \`\${dailyLog.id}_\${vendorId}\`, 
          projectId,
          vendorId,
          vendorName: vendor?.name || "Unknown",
          date: dailyLog.workDate, 
          totalCost,
          status: "Approved", 
          items,
        });
      });
    });
    
    return logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [dailyLogs, rateCards, tasks, vendors]);`;

content = content.replace(oldQuery, newQuery);

fs.writeFileSync(file, content, 'utf8');
console.log("Patched LaborTrackingView dynamic logs");
