import React, { useState, useMemo } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
import { useProjectDailyLogsQuery, useDateRangeLogsQuery } from "../hooks/useDailyLogs";
import { useTasksQuery, useProjectQuery, useProjectDataQuery } from "../hooks/queries";
import { aggregateLogs } from "../utils/reportUtils";
import { useAuthStore } from "../store";
import { DailyLogEntry, MaterialIssue, DailyLaborLog } from "../types";
import { Download, FileText, CheckCircle2, Package, Users, Activity, Loader2 } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface ProgressReportsViewProps {
  projectId: string;
}

export const ProgressReportsView: React.FC<ProgressReportsViewProps> = ({ projectId }) => {
  const user = useAuthStore((state) => state.user);
  const { data: project } = useProjectQuery(projectId);
  const { data: tasks = [] } = useTasksQuery(projectId);

  const [reportType, setReportType] = useState<"daily" | "weekly" | "monthly">("daily");
  
  const [selectedDate, setSelectedDate] = useState(
    new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).toISOString().split('T')[0]
  );
  
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Derived date bounds
  const startDate = useMemo(() => {
    const d = new Date(selectedDate);
    if (reportType === "daily") return selectedDate;
    if (reportType === "weekly") return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
    return format(startOfMonth(d), "yyyy-MM-dd");
  }, [selectedDate, reportType]);

  const endDate = useMemo(() => {
    const d = new Date(selectedDate);
    if (reportType === "daily") return selectedDate;
    if (reportType === "weekly") return format(endOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
    return format(endOfMonth(d), "yyyy-MM-dd");
  }, [selectedDate, reportType]);

  const { data: rawLogs = [], isLoading: isLoadingLogs } = useDateRangeLogsQuery(projectId, startDate, endDate);
  const { data: allMaterialIssues = [], isLoading: isLoadingMat } = useProjectDataQuery<MaterialIssue>(projectId, "material_issues");
  const { data: allLaborLogs = [], isLoading: isLoadingLab } = useProjectDataQuery<DailyLaborLog>(projectId, "labor_logs");

  const logs = useMemo(() => {
     const combinedLogs: DailyLogEntry[] = [...rawLogs];
     
     const startDt = parseISO(startDate);
     const endDt = parseISO(endDate);

     allMaterialIssues.forEach(issue => {
        const issueObjDate = parseISO(issue.issueDate);
        // check date bounds by strings directly or date objects
        if (issue.issueDate >= startDate && issue.issueDate <= endDate) {
           combinedLogs.push({
              id: issue.id,
              taskId: issue.taskId,
              projectId: issue.projectId,
              workDate: issue.issueDate,
              createdAt: issue.issueDate,
              createdByUid: "",
              createdByName: "System (Procurement)",
              progressPercent: 0, 
              markComplete: false,
              materials: issue.items.map(m => ({ materialId: m.itemId, name: m.name, quantity: m.quantity, unit: "" })),
              labour: []
           });
        }
     });

     allLaborLogs.forEach(llog => {
        if (llog.date >= startDate && llog.date <= endDate) {
            const tasks = Array.from(new Set(llog.items.map(i => i.taskId)));
            tasks.forEach(taskId => {
               const taskItems = llog.items.filter(i => i.taskId === taskId);
               combinedLogs.push({
                 id: `${llog.id}-${taskId}`,
                 taskId,
                 projectId: llog.projectId,
                 workDate: llog.date,
                 createdAt: llog.date,
                 createdByUid: "",
                 createdByName: "System (Labor)",
                 progressPercent: 0,
                 markComplete: false,
                 materials: [],
                 labour: taskItems.map(l => ({ roleId: l.role, roleName: l.role, headcount: l.headcount * (l.shifts || 1) }))
               });
            });
        }
     });

     combinedLogs.sort((a,b) => b.workDate.localeCompare(a.workDate) || (b.createdAt || "").localeCompare(a.createdAt || ""));
     return combinedLogs;
  }, [rawLogs, allMaterialIssues, allLaborLogs, startDate, endDate]);

  const isLoading = isLoadingLogs || isLoadingMat || isLoadingLab;

  const canExport = user?.role === "Admin" || user?.role === "Project Manager";

  const { totalLabor, materialsRollup, laborByRole } = useMemo(() => aggregateLogs(logs), [logs]);

  // Aggregate by Task
  const logsByTask = useMemo(() => {
    const map = new Map<string, typeof logs>();
    logs.forEach(log => {
      const arr = map.get(log.taskId) || [];
      arr.push(log);
      map.set(log.taskId, arr);
    });
    return map;
  }, [logs]);

  const handleExportPDF = async () => {
    setIsGeneratingPdf(true);
    setTimeout(async () => {
      try {
        const element = document.getElementById("report-printable-area");
        if (!element) return;

        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          logging: false,
          windowWidth: 1000,
        });

        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        const pdf = new jsPDF("p", "mm", "a4");
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        let position = 0;
        const pageHeight = pdf.internal.pageSize.getHeight();

        pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, pdfHeight);
        let heightLeft = pdfHeight - pageHeight;

        while (heightLeft >= 0) {
          position = heightLeft - pdfHeight;
          pdf.addPage();
          pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, pdfHeight);
          heightLeft -= pageHeight;
        }

        const dateSuffix = reportType === "daily" ? selectedDate : `${startDate}_to_${endDate}`;
        pdf.save(`${project?.name || "Project"}_${reportType}_report_${dateSuffix}.pdf`);
      } catch (err) {
        console.error("PDF generation error", err);
      } finally {
        setIsGeneratingPdf(false);
      }
    }, 150);
  };

  const getDayProgressDelta = () => {
     if (logs.length === 0) return 0;
     let cumulative = 0;
     Array.from(logsByTask.entries()).forEach(([taskId, tLogs]) => {
         // get earliest and latest progress for this task in the window
         const sorted = [...tLogs].sort((a,b) => a.workDate.localeCompare(b.workDate) || a.createdAt.localeCompare(b.createdAt));
         const first = sorted[0];
         const last = sorted[sorted.length - 1];
         // Simple average overall progress could be derived, but typically we just report the latest % for each task.
     });
     return 0;
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-20 text-ink-muted flex-col gap-4">
       <Loader2 className="w-8 h-8 animate-spin" />
       <p className="font-bold text-sm tracking-widest uppercase">Aggregating Report Data...</p>
    </div>;
  }

  const isDaily = reportType === "daily";

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-surface/70 backdrop-blur-xl p-6 rounded-[32px] border border-white/20 shadow-[0_10px_40px_rgba(0,0,0,0.03)] gap-6">
         <div>
            <h2 className="text-2xl font-black text-ink tracking-tight leading-none mb-1">
              Progress Reports
            </h2>
            <p className="text-sm font-bold text-ink-muted">Generate project updates from daily logs.</p>
         </div>
         <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex bg-panel/50 p-1.5 rounded-xl border border-divider shadow-sm">
               {(["daily", "weekly", "monthly"] as const).map(t => (
                  <button 
                     key={t}
                     onClick={() => setReportType(t)}
                     className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${reportType === t ? "bg-white text-indigo-600 shadow" : "text-ink-muted hover:text-ink"}`}
                  >
                     {t}
                  </button>
               ))}
            </div>
         </div>
      </div>

      <div className="flex items-center gap-4">
         <div className="flex-1 bg-surface p-4 rounded-2xl border border-divider shadow-sm flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-ink-muted">Report Date/Period</span>
            <input 
              type="date" 
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-panel border-none outline-none font-bold text-sm text-ink px-3 py-1.5 rounded-lg"
            />
         </div>
         <button 
           onClick={handleExportPDF}
           disabled={logs.length === 0 || !canExport || isGeneratingPdf}
           className={`flex items-center gap-2 px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg ${logs.length === 0 || !canExport ? "bg-panel text-ink-muted cursor-not-allowed" : "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95"}`}
         >
           {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
           {canExport ? "Export PDF" : "Manager Access Required"}
         </button>
      </div>

      {!canExport && (
         <p className="text-xs text-orange-600 bg-orange-50 p-3 rounded-lg border border-orange-100 font-bold uppercase tracking-widest">
            Note: PDF Export is restricted to Admin or Manager roles.
         </p>
      )}

      {logs.length === 0 ? (
        <div className="bg-surface rounded-3xl p-12 text-center border shadow-sm">
           <FileText className="w-12 h-12 text-ink-muted/30 mx-auto mb-4" />
           <h3 className="text-lg font-black text-ink mb-1">No work logged</h3>
           <p className="text-sm font-bold text-ink-muted">There are no daily logs for {isDaily ? "this date" : "this period"}.</p>
        </div>
      ) : (
        <div className="bg-white overflow-hidden rounded-3xl border shadow-lg">
           {/* This ID is targeted by HTML2Canvas */}
           <div id="report-printable-area" className="p-8 md:p-12 text-black bg-white">
              
              {/* Report Header */}
              <div className="border-b-2 border-black pb-6 mb-8 flex justify-between items-end">
                 <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter mb-2">{project?.name || "Project"}</h1>
                    <h2 className="text-lg font-bold text-gray-600 uppercase tracking-widest">
                       {reportType.charAt(0).toUpperCase() + reportType.slice(1)} Progress Report
                    </h2>
                 </div>
                 <div className="text-right">
                    <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Period</p>
                    <p className="text-base font-black">
                       {isDaily ? format(new Date(selectedDate), "dd MMM yyyy") : `${format(new Date(startDate), "dd MMM yyyy")} to ${format(new Date(endDate), "dd MMM yyyy")}`}
                    </p>
                 </div>
              </div>

              {/* Summary Band */}
              <div className="grid grid-cols-3 gap-6 mb-10">
                 <div className="bg-gray-50 p-5 border border-gray-200 rounded-xl">
                    <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
                       <Activity className="w-3.5 h-3.5" /> Tasks Active
                    </span>
                    <p className="text-2xl font-black font-mono">{logsByTask.size}</p>
                 </div>
                 <div className="bg-gray-50 p-5 border border-gray-200 rounded-xl">
                    <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
                       <Users className="w-3.5 h-3.5" /> Total Labour Days
                    </span>
                    <p className="text-2xl font-black font-mono">{totalLabor}</p>
                 </div>
                 <div className="bg-gray-50 p-5 border border-gray-200 rounded-xl">
                    <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
                       <Package className="w-3.5 h-3.5" /> Unique Materials
                    </span>
                    <p className="text-2xl font-black font-mono">{materialsRollup.length}</p>
                 </div>
              </div>

              {/* Site-Wide Totals (Weekly/Monthly like tables) */}
              {!isDaily && (
                 <div className="mb-10">
                    <h3 className="text-sm font-black uppercase tracking-widest mb-4 bg-black text-white py-2 px-4 rounded">Period Consolidation</h3>
                    <div className="grid grid-cols-2 gap-8">
                       <div>
                          <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3 border-b pb-2">Material Consumption</h4>
                          <table className="w-full text-sm">
                             <tbody>
                                {materialsRollup.map((m, i) => (
                                   <tr key={i} className="border-b border-gray-100 last:border-0">
                                      <td className="py-2 pr-4 font-medium">{m.name}</td>
                                      <td className="py-2 text-right font-mono font-bold">{m.count} <span className="text-[10px] text-gray-500 uppercase">{m.unit}</span></td>
                                   </tr>
                                ))}
                             </tbody>
                          </table>
                       </div>
                       <div>
                          <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3 border-b pb-2">Labour Deployment</h4>
                          <table className="w-full text-sm">
                             <tbody>
                                {laborByRole.map((l, i) => (
                                   <tr key={i} className="border-b border-gray-100 last:border-0">
                                      <td className="py-2 pr-4 font-medium">{l.roleName}</td>
                                      <td className="py-2 text-right font-mono font-bold">{l.count} <span className="text-[10px] text-gray-500 uppercase">shifts</span></td>
                                   </tr>
                                ))}
                             </tbody>
                          </table>
                       </div>
                    </div>
                 </div>
              )}

              {/* Per-Task Breakdown */}
              <h3 className="text-sm font-black uppercase tracking-widest mb-6 bg-black text-white py-2 px-4 rounded">Task Progress Details</h3>
              <div className="space-y-8">
                 {Array.from(logsByTask.entries()).map(([taskId, tLogs]) => {
                    const task = tasks.find(t => t.id === taskId);
                    const sortedLogs = [...tLogs].sort((a,b) => b.workDate.localeCompare(a.workDate) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
                    const latestLog = sortedLogs.find(l => l.progressPercent !== undefined && l.progressPercent !== 0) || sortedLogs[0];
                    
                    const taskAgg = aggregateLogs(tLogs);
                    
                    return (
                       <div key={taskId} className="border border-gray-200 rounded-2xl p-6">
                          <div className="flex justify-between items-start mb-4 border-b border-gray-100 pb-4">
                             <div>
                                <h4 className="text-lg font-black tracking-tight">{task?.name || `Task ${taskId}`}</h4>
                                {task?.phase && <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Phase: {task.phase}</span>}
                             </div>
                             <div className="text-right">
                                <span className="text-2xl font-black text-indigo-600 font-mono leading-none">{latestLog.progressPercent}%</span>
                                <span className="block text-[8px] font-bold uppercase tracking-widest text-gray-400 mt-1">Cum. Progress</span>
                             </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             {(taskAgg.materialsRollup.length > 0 || taskAgg.laborByRole.length > 0) && (
                                <div className="space-y-4">
                                   {taskAgg.materialsRollup.length > 0 && (
                                      <div>
                                         <h5 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Materials</h5>
                                         <ul className="text-xs space-y-1">
                                            {taskAgg.materialsRollup.map((m, i) => (
                                               <li key={i} className="flex justify-between border-b border-gray-50 pb-1">
                                                  <span>{m.name}</span>
                                                  <span className="font-mono font-bold">{m.count} {m.unit}</span>
                                               </li>
                                            ))}
                                         </ul>
                                      </div>
                                   )}
                                   {taskAgg.laborByRole.length > 0 && (
                                      <div>
                                         <h5 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Labour</h5>
                                         <ul className="text-xs space-y-1">
                                            {taskAgg.laborByRole.map((l, i) => (
                                               <li key={i} className="flex justify-between border-b border-gray-50 pb-1">
                                                  <span>{l.roleName}</span>
                                                  <span className="font-mono font-bold">{l.count} shifts</span>
                                               </li>
                                            ))}
                                         </ul>
                                      </div>
                                   )}
                                </div>
                             )}

                             <div>
                                <h5 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Remarks / Notes</h5>
                                <div className="text-xs space-y-2 text-gray-700 font-medium italic">
                                   {tLogs.filter(l => l.note).map((l, i) => (
                                      <p key={i}>"{l.note}" {!isDaily && <span className="text-[8px] not-italic text-gray-400 ml-1">({l.workDate})</span>}</p>
                                   ))}
                                   {tLogs.filter(l => l.note).length === 0 && <span className="text-gray-400">No remarks provided.</span>}
                                </div>

                                {/* Photos cap at 4 per task in PDF to avoid massive sizes */}
                                {tLogs.some(l => l.photoUrls && l.photoUrls.length > 0) && (
                                   <div className="mt-4">
                                      <h5 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Photos attached</h5>
                                      <div className="flex gap-2 flex-wrap">
                                         {tLogs.flatMap(l => l.photoUrls || []).slice(0, 4).map((url, i) => (
                                            <img key={i} src={url} className="w-16 h-16 object-cover rounded border" alt="Site shot" crossOrigin="anonymous"/>
                                         ))}
                                         {tLogs.flatMap(l => l.photoUrls || []).length > 4 && (
                                            <div className="w-16 h-16 bg-gray-50 rounded border flex items-center justify-center text-[10px] font-bold text-gray-400">
                                               +{tLogs.flatMap(l => l.photoUrls || []).length - 4}
                                            </div>
                                         )}
                                      </div>
                                   </div>
                                )}
                             </div>
                          </div>
                       </div>
                    );
                 })}
              </div>

              {/* Footer */}
              <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                 <span>Generated via BuildFlow Pro</span>
                 <span>Generated by {user?.displayName || user?.email} on {format(new Date(), "dd MMM yyyy HH:mm")}</span>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
