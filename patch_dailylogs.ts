import fs from 'fs';

const file = 'src/hooks/useDailyLogs.ts';
let code = fs.readFileSync(file, 'utf8');

const helper = `
async function fetchTelegramBotLogs(user: any, projectId: string, options?: { taskId?: string, date?: string, startDate?: string, endDate?: string }) {
   if (!user || !projectId) return [];
   const parentPath = getTenantPath(user, projectId, "daily_site_reports");
   if (!parentPath) return [];

   let q = query(collection(db, parentPath));
   if (options?.date) {
     q = query(collection(db, parentPath), where("date", "==", options.date));
   } else if (options?.startDate && options?.endDate) {
     q = query(collection(db, parentPath), where("date", ">=", options.startDate), where("date", "<=", options.endDate));
   }

   const snapshot = await getDocs(q);
   const reports = snapshot.docs.map(d => ({ id: d.id, ...d.data() as any }));
   const reportLogs: DailyLogEntry[] = [];
   
   reports.forEach(report => {
       const dayTasks = report.dayTasks || [];
       if (dayTasks.length > 0) {
           dayTasks.forEach((t: any, index: number) => {
               if (options?.taskId && t.taskId !== options.taskId) return;
               
               reportLogs.push({
                   id: \`tg-\${report.id}-\${t.taskId || index}\`,
                   taskId: t.taskId || report.taskId || "unknown",
                   projectId: report.projectId || projectId,
                   workDate: report.date,
                   createdAt: report.createdAt || report.date,
                   createdByUid: "telegram-bot",
                   createdByName: "Telegram Bot",
                   progressPercent: t.progressUpdate || report.progressUpdate || 0,
                   markComplete: (t.progressUpdate || report.progressUpdate) === 100,
                   note: t.remarks || report.remarks || "",
                   photoUrls: report.photos || [],
                   materials: [], 
                   labour: []
               });
           });
       } else {
           if (options?.taskId && report.taskId !== options.taskId) return;
           
           reportLogs.push({
               id: \`tg-\${report.id}\`,
               taskId: report.taskId || "unknown",
               projectId: report.projectId || projectId,
               workDate: report.date,
               createdAt: report.createdAt || report.date,
               createdByUid: "telegram-bot",
               createdByName: "Telegram Bot",
               progressPercent: report.progressUpdate || 0,
               markComplete: report.progressUpdate === 100,
               note: report.remarks || "",
               photoUrls: report.photos || [],
               materials: [],
               labour: []
           });
       }
   });
   
   return reportLogs;
}
`;

code = code.replace("export function useDailyLogsQuery", helper + "\nexport function useDailyLogsQuery");

code = code.replace(
  `      const snapshot = await getDocs(q);\n      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as DailyLogEntry);`,
  `      const snapshot = await getDocs(q);\n      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as DailyLogEntry);\n      const tgLogs = await fetchTelegramBotLogs(user, projectId, { taskId });\n      items.push(...tgLogs);`
);

code = code.replace(
  `      const snapshot = await getDocs(q);\n      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as DailyLogEntry);\n      return items.sort((a,b) => b.workDate.localeCompare(a.workDate) || (b.createdAt || "").localeCompare(a.createdAt || ""));\n    },\n    enabled: !!user && !!projectId,\n  });\n}`,
  `      const snapshot = await getDocs(q);\n      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as DailyLogEntry);\n      const tgLogs = await fetchTelegramBotLogs(user, projectId, { date });\n      items.push(...tgLogs);\n      return items.sort((a,b) => b.workDate.localeCompare(a.workDate) || (b.createdAt || "").localeCompare(a.createdAt || ""));\n    },\n    enabled: !!user && !!projectId,\n  });\n}`
);

code = code.replace(
  `      const snapshot = await getDocs(q);\n      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as DailyLogEntry);\n      \n      // Sort in memory to avoid needing a composite index\n      return items.sort((a, b) => {`,
  `      const snapshot = await getDocs(q);\n      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as DailyLogEntry);\n      const tgLogs = await fetchTelegramBotLogs(user, projectId, { startDate, endDate });\n      items.push(...tgLogs);\n      \n      // Sort in memory to avoid needing a composite index\n      return items.sort((a, b) => {`
);

fs.writeFileSync(file, code);
console.log("Patched " + file);
