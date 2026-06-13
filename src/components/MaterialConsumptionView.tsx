import React, { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval } from "date-fns";
import { useProjectDataQuery, useTasksQuery } from "../hooks/queries";
import { useDateRangeLogsQuery } from "../hooks/useDailyLogs";
import { MaterialIssue } from "../types";
import { Download, Package, Activity, Loader2, Calendar, FileText } from "lucide-react";

interface MaterialConsumptionViewProps {
  projectId: string;
}

const MaterialConsumptionView: React.FC<MaterialConsumptionViewProps> = ({ projectId }) => {
  const [selectedMonth, setSelectedMonth] = useState(
    format(new Date(), "yyyy-MM")
  );

  const startDate = useMemo(() => {
     return startOfMonth(parseISO(selectedMonth + "-01"));
  }, [selectedMonth]);

  const endDate = useMemo(() => {
     return endOfMonth(parseISO(selectedMonth + "-01"));
  }, [selectedMonth]);

  const startStr = format(startDate, "yyyy-MM-dd");
  const endStr = format(endDate, "yyyy-MM-dd");

  const { data: allIssues = [], isLoading: isIssuesLoading } = useProjectDataQuery<MaterialIssue>(projectId, "material_issues");
  const { data: logs = [], isLoading: isLogsLoading } = useDateRangeLogsQuery(projectId, startStr, endStr);
  const { data: tasks = [], isLoading: isTasksLoading } = useTasksQuery(projectId);

  // Derive consumption from daily logs and material issues
  const consumptionRecords = useMemo(() => {
    let records: any[] = [];
    allIssues.forEach(issue => {
       const issueDate = new Date(issue.issueDate);
       if (isWithinInterval(issueDate, { start: startDate, end: endDate })) {
         issue.items.forEach(m => {
            records.push({
               id: `${issue.id}-${m.itemId}`,
               date: issue.issueDate,
               taskName: issue.taskName || `Task ${issue.taskId}`,
               materialName: m.name,
               quantity: m.quantity || 0,
               unit: "", 
               note: issue.remarks || "From Material Issue",
               logId: issue.id
            });
         });
       }
    });

    logs.forEach(log => {
       const taskName = tasks.find(t => t.id === log.taskId)?.name || `Task ${log.taskId}`;
       log.materials.forEach(m => {
          records.push({
             id: `${log.id}-${m.materialId}`,
             date: log.workDate,
             taskName,
             materialName: m.name,
             quantity: m.quantity || 0,
             unit: m.unit,
             note: log.note || "From Daily Log",
             logId: log.id
          });
       });
    });

    // Sort by date desc
    return records.sort((a,b) => b.date.localeCompare(a.date));
  }, [allIssues, logs, tasks, startDate, endDate]);

  const isLoading = isIssuesLoading || isLogsLoading || isTasksLoading;

  if (isLoading) {
    return (
      <div className="flex justify-center p-20 text-ink-muted">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-12 pb-24 md:pb-32">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 bg-surface/70 backdrop-blur-xl p-6 md:p-8 rounded-[24px] md:rounded-[32px] border border-white shadow-sm">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-ink tracking-tight leading-none mb-2">
            Consumption History
          </h2>
          <p className="text-ink-muted font-bold text-xs md:text-sm tracking-tight uppercase tracking-[0.1em]">
            Read-only record sourced from Material Issues logistics.
          </p>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-ink-muted bg-panel p-2 rounded-xl">
           <Calendar className="w-4 h-4"/> Month Filter:
           <input 
              type="month" 
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-transparent border-none outline-none font-bold text-ink"
           />
        </div>
      </div>

      <div className="bg-surface rounded-[24px] md:rounded-[40px] shadow-[0_10px_40px_rgba(0,0,0,0.02)] border border-slate-50 overflow-hidden">
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left min-w-[800px]">
            <thead>
              <tr className="bg-panel/50 border-b border-divider">
                <th className="px-10 py-6">
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-ink-muted">
                    Date
                  </div>
                </th>
                <th className="px-10 py-6">
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-ink-muted">
                    Material
                  </div>
                </th>
                <th className="px-10 py-6">
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-ink-muted">
                    Consumed In Task
                  </div>
                </th>
                <th className="px-10 py-6 text-right">
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-ink-muted">
                    Quantity
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {consumptionRecords.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-24 text-center">
                    <div className="w-20 h-20 bg-panel rounded-full flex items-center justify-center mx-auto mb-6 border border-divider">
                      <FileText className="text-ink-muted w-10 h-10" />
                    </div>
                    <p className="text-ink-muted font-black uppercase tracking-[0.2em] text-[10px] italic">
                      No material consumption logged this month.
                    </p>
                  </td>
                </tr>
              ) : (
                consumptionRecords.map((record) => (
                  <tr
                    key={record.id}
                    className="group hover:bg-panel/50 apple-transition"
                  >
                    <td className="px-10 py-8 font-mono text-[10px] font-black text-ink-muted group-hover:text-ink apple-transition whitespace-nowrap">
                      {record.date}
                    </td>
                    <td className="px-10 py-8">
                       <span className="font-bold text-sm tracking-tight text-ink">{record.materialName}</span>
                    </td>
                    <td className="px-10 py-8">
                       <span className="font-bold text-xs uppercase tracking-widest text-ink">{record.taskName}</span>
                    </td>
                    <td className="px-10 py-8 text-right font-mono text-sm tracking-tighter text-ink">
                       {record.quantity} <span className="text-[10px] text-ink-muted">{record.unit}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MaterialConsumptionView;
