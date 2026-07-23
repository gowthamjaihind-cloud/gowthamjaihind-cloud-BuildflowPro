import React, { useState, useMemo } from "react";
import { exportToCSV } from "../utils/exportUtils";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  parseISO,
} from "date-fns";
import {
  useProjectDailyLogsQuery,
  useDateRangeLogsQuery,
  useDeleteDailyLog,
  canEditOrDeleteLog,
} from "../hooks/useDailyLogs";
import {
  useTasksQuery,
  useProjectQuery,
  useProjectDataQuery,
} from "../hooks/queries";
import { aggregateLogs } from "../utils/reportUtils";
import { useAuthStore } from "../store";
import { DailyLogEntry, MaterialIssue, DailyLaborLog } from "../types";
import { DailyLogEntryScreen } from "./DailyLogEntryScreen";
import {
  PencilSimple as Edit2,
  Trash as Trash2,
} from "@phosphor-icons/react";
import {
  DownloadSimple as Download,
  FileText,
  CheckCircle as CheckCircle2,
  Package,
  Users,
  Pulse as Activity,
  CircleNotch as Loader2,
} from "@phosphor-icons/react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface ProgressReportsViewProps {
  projectId: string;
}

export const ProgressReportsView: React.FC<ProgressReportsViewProps> = ({
  projectId,
}) => {
  const user = useAuthStore((state) => state.user);
  const { data: project } = useProjectQuery(projectId);
  const { data: tasks = [] } = useTasksQuery(projectId);

  const [reportType, setReportType] = useState<"daily" | "weekly" | "monthly">(
    "daily",
  );

  const [logToEdit, setLogToEdit] = useState<DailyLogEntry | null>(null);
  const [logToDelete, setLogToDelete] = useState<DailyLogEntry | null>(null);
  const [selectedDate, setSelectedDate] = useState(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())
  );

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const safeFormat = (dateStr: string, fmt: string) => {
    if (!dateStr) return "Invalid Date";
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) return "Invalid Date";
    const dt = new Date(y, m - 1, d);
    if (isNaN(dt.getTime())) return "Invalid Date";
    return format(dt, fmt);
  };

  const deleteLogMutation = useDeleteDailyLog(projectId);

  const handleDeleteLog = (log: DailyLogEntry) => {
    setLogToDelete(log);
  };

  const confirmDeleteLog = async () => {
    if (!logToDelete) return;
        try {
        await deleteLogMutation.mutateAsync({ id: logToDelete.id, oldLog: logToDelete });
        setLogToDelete(null);
    } catch (err) {
      console.error(err);
      alert(`Failed to delete log: ${err.message || err}`);
    }
  };

  // Derived date bounds
  const startDate = useMemo(() => {
    if (!selectedDate) return "";
    const [y, m, d] = selectedDate.split("-").map(Number);
    if (!y || !m || !d) return "";
    const dt = new Date(y, m - 1, d);
    if (reportType === "daily") return selectedDate;
    if (reportType === "weekly")
      return format(startOfWeek(dt, { weekStartsOn: 1 }), "yyyy-MM-dd");
    return format(startOfMonth(dt), "yyyy-MM-dd");
  }, [selectedDate, reportType]);

  const endDate = useMemo(() => {
    if (!selectedDate) return "";
    const [y, m, d] = selectedDate.split("-").map(Number);
    if (!y || !m || !d) return "";
    const dt = new Date(y, m - 1, d);
    if (reportType === "daily") return selectedDate;
    if (reportType === "weekly")
      return format(endOfWeek(dt, { weekStartsOn: 1 }), "yyyy-MM-dd");
    return format(endOfMonth(dt), "yyyy-MM-dd");
  }, [selectedDate, reportType]);

  const { data: rawLogs = [], isLoading: isLoadingLogs } =
    useDateRangeLogsQuery(projectId, startDate, endDate);
  const { data: allMaterialIssues = [], isLoading: isLoadingMat } =
    useProjectDataQuery<any>(projectId, "material_issues");
  const { data: allLaborLogs = [], isLoading: isLoadingLab } =
    useProjectDataQuery<DailyLaborLog>(projectId, "labor_logs");

  const logs = useMemo(() => {
    const combinedLogs: DailyLogEntry[] = [...rawLogs];

    const startDt = parseISO(startDate);
    const endDt = parseISO(endDate);

    allMaterialIssues
      .filter((issue) => !issue.remarks?.startsWith("Daily Progress") && !issue.notes?.startsWith("Daily Progress"))
      .forEach((issue) => {
        const issueDate = issue.issueDate || issue.date;
        if (issueDate && issueDate >= startDate && issueDate <= endDate) {
          const materialsList = issue.items && Array.isArray(issue.items)
            ? issue.items.map((m) => ({
                materialId: m.itemId || m.materialId || "",
                name: m.name || "",
                quantity: m.quantity || 0,
                unit: m.unit || "",
              }))
            : issue.materialId
            ? [{
                materialId: issue.materialId,
                name: "Material",
                quantity: issue.quantity || 0,
                unit: issue.unit || "",
              }]
            : [];

          combinedLogs.push({
            id: issue.id,
            taskId: issue.taskId,
            projectId: issue.projectId,
            workDate: issueDate,
            createdAt: issue.createdAt || issueDate,
            createdByUid: "",
            createdByName: "System (Procurement)",
            progressPercent: 0,
            markComplete: false,
            materials: materialsList,
            labour: [],
          });
        }
      });

    allLaborLogs.forEach((llog) => {
      if (llog.date >= startDate && llog.date <= endDate) {
        const tasks = Array.from(new Set(llog.items.map((i) => i.taskId)));
        tasks.forEach((taskId) => {
          const taskItems = llog.items.filter((i) => i.taskId === taskId);
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
            labour: taskItems.map((l) => ({
              roleId: l.role,
              roleName: l.role,
              headcount: l.headcount * (l.shifts || 1),
            })),
          });
        });
      }
    });

    combinedLogs.sort(
      (a, b) =>
        b.workDate.localeCompare(a.workDate) ||
        (b.createdAt || "").localeCompare(a.createdAt || ""),
    );
    return combinedLogs;
  }, [rawLogs, allMaterialIssues, allLaborLogs, startDate, endDate]);

  const isLoading = isLoadingLogs || isLoadingMat || isLoadingLab;

  const canExport = user?.role === "Admin" || user?.role === "Project Manager";

  const { totalLabor, materialsRollup, laborByRole } = useMemo(
    () => aggregateLogs(logs),
    [logs],
  );

  // Aggregate by Task
  const logsByTask = useMemo(() => {
    const map = new Map<string, typeof logs>();
    logs.forEach((log) => {
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

        const dateSuffix =
          reportType === "daily" ? selectedDate : `${startDate}_to_${endDate}`;
        pdf.save(
          `${project?.name || "Project"}_${reportType}_report_${dateSuffix}.pdf`,
        );
      } catch (err) {
        console.error("PDF generation error", err);
      } finally {
        setIsGeneratingPdf(false);
      }
    }, 150);
  };

  const handleExportCSV = () => {
    const headers = [
      "Date",
      "Task Name",
      "Phase",
      "Location",
      "Progress Delta (%)",
      "Current Progress (%)",
      "Labor Count",
      "Blockers",
      "Notes",
    ];
    const rows: (string | number)[][] = [];
    logs.forEach((log) => {
      (log.entries || []).forEach((entry) => {
        const task = tasks.find((t) => t.id === entry.taskId);
        rows.push([
          log.date || "",
          task?.name || entry.taskId || "General Task",
          task?.phase || "-",
          task?.location || "-",
          entry.progressDelta || 0,
          entry.currentProgress || 0,
          entry.laborCount || 0,
          entry.blockers || "-",
          entry.notes || log.notes || "-",
        ]);
      });
    });
    const dateSuffix = reportType === "daily" ? selectedDate : `${startDate}_to_${endDate}`;
    exportToCSV(`${project?.name || "Project"}_${reportType}_Report_${dateSuffix}`, headers, rows);
  };

  const getDayProgressDelta = () => {
    if (logs.length === 0) return 0;
    let cumulative = 0;
    Array.from(logsByTask.entries()).forEach(([taskId, tLogs]) => {
      // get earliest and latest progress for this task in the window
      const sorted = [...tLogs].sort(
        (a, b) =>
          a.workDate.localeCompare(b.workDate) ||
          a.createdAt.localeCompare(b.createdAt),
      );
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      // Simple average overall progress could be derived, but typically we just report the latest % for each task.
    });
    return 0;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-20 text-ink-muted flex-col gap-4">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="font-bold text-sm tracking-widest uppercase">
          Aggregating Report Data...
        </p>
      </div>
    );
  }

  const isDaily = reportType === "daily";

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-surface/70 backdrop-blur-xl p-5 md:p-6 rounded-2xl border border-white/20 shadow-sm gap-6">
        <div>
          <h2 className="text-2xl font-black text-ink tracking-tight leading-none mb-1">
            Progress Reports
          </h2>
          <p className="text-sm font-bold text-ink-muted">
            Generate project updates from daily logs.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex bg-panel/50 p-1.5 rounded-xl border border-divider shadow-sm">
            {(["daily", "weekly", "monthly"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setReportType(t)}
                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${reportType === t ? "bg-white text-primary shadow" : "text-ink-muted hover:text-ink"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 bg-surface p-4 rounded-2xl border border-divider shadow-sm flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-ink-muted">
            Report Date/Period
          </span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-panel border-none outline-none font-bold text-sm text-ink px-3 py-1.5 rounded-lg"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={logs.length === 0 || !canExport}
            className={`flex items-center gap-2 px-5 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-md ${logs.length === 0 || !canExport ? "bg-panel text-ink-muted cursor-not-allowed" : "bg-panel border border-divider hover:bg-divider text-ink active:scale-95 cursor-pointer"}`}
          >
            <Download className="w-4 h-4 text-ink/80" />
            Export CSV
          </button>
          <button
            onClick={handleExportPDF}
            disabled={logs.length === 0 || !canExport || isGeneratingPdf}
            className={`flex items-center gap-2 px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg ${logs.length === 0 || !canExport ? "bg-panel text-ink-muted cursor-not-allowed" : "bg-primary text-white hover:bg-primary/80 active:scale-95 cursor-pointer"}`}
          >
            {isGeneratingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {canExport ? "Export PDF" : "Manager Access Required"}
          </button>
        </div>
      </div>

      {!canExport && (
        <p className="text-xs text-[#C0653F] bg-[#D97D54]/10 p-3 rounded-lg border border-[#D97D54]/20 font-bold uppercase tracking-widest">
          Note: PDF Export is restricted to Admin or Manager roles.
        </p>
      )}

      {logs.length === 0 ? (
        <div className="bg-surface rounded-3xl p-12 text-center border shadow-sm">
          <FileText className="w-12 h-12 text-ink-muted/30 mx-auto mb-4" />
          <h3 className="text-lg font-black text-ink mb-1">No work logged</h3>
          <p className="text-sm font-bold text-ink-muted">
            There are no daily logs for {isDaily ? "this date" : "this period"}.
          </p>
        </div>
      ) : (
        <div className="bg-white overflow-hidden rounded-3xl border shadow-lg">
          {/* This ID is targeted by HTML2Canvas */}
          <div
            id="report-printable-area"
            className="p-8 md:p-12 text-ink bg-white"
          >
            {/* Report Header */}
            <div className="border-b-2 border-onyx pb-6 mb-8 flex justify-between items-end">
              <div>
                <h1 className="text-3xl font-black uppercase tracking-tighter mb-2">
                  {project?.name || "Project"}
                </h1>
                <h2 className="text-lg font-bold text-[#56778E] uppercase tracking-widest">
                  {reportType.charAt(0).toUpperCase() + reportType.slice(1)}{" "}
                  Progress Report
                </h2>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-ink-muted uppercase tracking-widest mb-1">
                  Period
                </p>
                <p className="text-base font-black">
                  {isDaily
                    ? safeFormat(selectedDate, "dd MMM yyyy")
                    : `${safeFormat(startDate, "dd MMM yyyy")} to ${safeFormat(endDate, "dd MMM yyyy")}`}
                </p>
              </div>
            </div>

            {/* Summary Band */}
            <div className="grid grid-cols-3 gap-6 mb-10">
              <div className="bg-page p-5 border border-divider rounded-xl">
                <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-ink-muted mb-2">
                  <Activity className="w-3.5 h-3.5" /> Tasks Active
                </span>
                <p className="text-2xl font-black font-mono">
                  {logsByTask.size}
                </p>
              </div>
              <div className="bg-page p-5 border border-divider rounded-xl">
                <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-ink-muted mb-2">
                  <Users className="w-3.5 h-3.5" /> Total Labour Days
                </span>
                <p className="text-2xl font-black font-mono">{totalLabor}</p>
              </div>
              <div className="bg-page p-5 border border-divider rounded-xl">
                <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-ink-muted mb-2">
                  <Package className="w-3.5 h-3.5" /> Unique Materials
                </span>
                <p className="text-2xl font-black font-mono">
                  {materialsRollup.length}
                </p>
              </div>
            </div>

            {/* Site-Wide Totals (Weekly/Monthly like tables) */}
            {!isDaily && (
              <div className="mb-10">
                <h3 className="text-sm font-black uppercase tracking-widest mb-4 bg-onyx text-white py-2 px-4 rounded">
                  Period Consolidation
                </h3>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-ink-muted mb-3 border-b pb-2">
                      Material Consumption
                    </h4>
                    <table className="w-full text-sm">
                      <tbody>
                        {materialsRollup.map((m, i) => (
                          <tr
                            key={i}
                            className="border-b border-divider/60 last:border-0"
                          >
                            <td className="py-2 pr-4 font-medium">{m.name}</td>
                            <td className="py-2 text-right font-mono font-bold">
                              {m.count}{" "}
                              <span className="text-[10px] text-ink-muted uppercase">
                                {m.unit}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-ink-muted mb-3 border-b pb-2">
                      Labour Deployment
                    </h4>
                    <table className="w-full text-sm">
                      <tbody>
                        {laborByRole.map((l, i) => (
                          <tr
                            key={i}
                            className="border-b border-divider/60 last:border-0"
                          >
                            <td className="py-2 pr-4 font-medium">
                              {l.roleName}
                            </td>
                            <td className="py-2 text-right font-mono font-bold">
                              {l.count}{" "}
                              <span className="text-[10px] text-ink-muted uppercase">
                                shifts
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Per-Task Breakdown */}
            <h3 className="text-sm font-black uppercase tracking-widest mb-6 bg-onyx text-white py-2 px-4 rounded">
              Task Progress Details
            </h3>
            <div className="space-y-8">
              {Array.from(logsByTask.entries()).map(([taskId, tLogs]) => {
                const task = tasks.find((t) => t.id === taskId);
                const sortedLogs = [...tLogs].sort(
                  (a, b) =>
                    b.workDate.localeCompare(a.workDate) ||
                    String(b.createdAt || "").localeCompare(
                      String(a.createdAt || ""),
                    ),
                );
                const latestLog =
                  sortedLogs.find(
                    (l) =>
                      l.progressPercent !== undefined &&
                      l.progressPercent !== 0,
                  ) || sortedLogs[0];

                const taskAgg = aggregateLogs(tLogs);

                return (
                  <div
                    key={taskId}
                    className="border border-divider rounded-2xl p-6"
                  >
                    <div className="flex justify-between items-start mb-4 border-b border-divider/60 pb-4">
                      <div>
                        <h4 className="text-lg font-black tracking-tight">
                          {task?.name || `Task ${taskId}`}
                        </h4>
                        {task?.phase && (
                          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
                            Phase: {task.phase}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-black text-primary font-mono leading-none">
                          {latestLog.progressPercent}%
                        </span>
                        <span className="block text-[8px] font-bold uppercase tracking-widest text-ink-muted/80 mt-1">
                          Cum. Progress
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {(taskAgg.materialsRollup.length > 0 ||
                        taskAgg.laborByRole.length > 0) && (
                        <div className="space-y-4">
                          {taskAgg.materialsRollup.length > 0 && (
                            <div>
                              <h5 className="text-[10px] font-bold uppercase tracking-widest text-ink-muted/80 mb-2">
                                Materials
                              </h5>
                              <ul className="text-xs space-y-1">
                                {taskAgg.materialsRollup.map((m, i) => (
                                  <li
                                    key={i}
                                    className="flex justify-between border-b border-divider/40 pb-1"
                                  >
                                    <span>{m.name}</span>
                                    <span className="font-mono font-bold">
                                      {m.count} {m.unit}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {taskAgg.laborByRole.length > 0 && (
                            <div>
                              <h5 className="text-[10px] font-bold uppercase tracking-widest text-ink-muted/80 mb-2">
                                Labour
                              </h5>
                              <ul className="text-xs space-y-1">
                                {taskAgg.laborByRole.map((l, i) => (
                                  <li
                                    key={i}
                                    className="flex justify-between border-b border-divider/40 pb-1"
                                  >
                                    <span>{l.roleName}</span>
                                    <span className="font-mono font-bold">
                                      {l.count} shifts
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      <div>
                        <h5 className="text-[10px] font-bold uppercase tracking-widest text-ink-muted/80 mb-2">
                          Remarks / Notes
                        </h5>
                        <div className="text-xs space-y-2 text-ink/80 font-medium italic">
                          {tLogs
                            .filter((l) => l.note)
                            .map((l, i) => (
                              <p key={i}>
                                "{l.note}"{" "}
                                {!isDaily && (
                                  <span className="text-[8px] not-italic text-ink-muted/80 ml-1">
                                    ({l.workDate})
                                  </span>
                                )}
                              </p>
                            ))}
                          {tLogs.filter((l) => l.note).length === 0 && (
                            <span className="text-ink-muted/80">
                              No remarks provided.
                            </span>
                          )}
                        </div>

                        {/* Photos cap at 4 per task in PDF to avoid massive sizes */}
                        {tLogs.some(
                          (l) => l.photoUrls && l.photoUrls.length > 0,
                        ) && (
                          <div className="mt-4">
                            <h5 className="text-[10px] font-bold uppercase tracking-widest text-ink-muted/80 mb-2">
                              Photos attached
                            </h5>
                            <div className="flex gap-2 flex-wrap">
                              {tLogs
                                .flatMap((l) => l.photoUrls || [])
                                .slice(0, 4)
                                .map((url, i) => (
                                  <img
                                    key={i}
                                    src={url}
                                    className="w-16 h-16 object-cover rounded border"
                                    alt="Site shot"
                                    crossOrigin="anonymous"
                                  />
                                ))}
                              {tLogs.flatMap((l) => l.photoUrls || []).length >
                                4 && (
                                <div className="w-16 h-16 bg-page rounded border flex items-center justify-center text-[10px] font-bold text-ink-muted/80">
                                  +
                                  {tLogs.flatMap((l) => l.photoUrls || [])
                                    .length - 4}
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

            
            {/* Daily Logs History */}
            <div className="mt-12 break-before-page">
              <h3 className="text-sm font-black uppercase tracking-widest mb-6 bg-onyx text-white py-2 px-4 rounded">
                Daily Logs History
              </h3>
              <div className="space-y-4">
                {logs.length === 0 ? (
                  <p className="text-sm text-ink-muted italic">No daily logs found for this period.</p>
                ) : (
                  logs.map((log, index) => {
                    const task = tasks.find((t) => t.id === log.taskId);
                    return (
                      <div key={`${log.id}-${index}`} className="border border-divider rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                          <h4 className="text-sm font-bold text-ink mb-1">{task?.name || 'Unknown Task'}</h4>
                          <p className="text-xs text-ink-muted">
                            <span className="font-mono">{log.workDate}</span> • {log.progressPercent}% progress
                            {log.markComplete ? ' (Completed)' : ''}
                          </p>
                          <div className="mt-2 text-xs text-[#56778E]">
                            {log.materials && log.materials.length > 0 && (
                              <span className="mr-3"><b>Mat:</b> {log.materials.length} items</span>
                            )}
                            {log.labour && log.labour.length > 0 && (
                              <span><b>Lab:</b> {log.labour.reduce((s, l) => s + (l.headcount || 0), 0)} people</span>
                            )}
                          </div>
                        </div>
                        {canEditOrDeleteLog(user, log) && (
                        <div className="print:hidden flex items-center gap-2">
                          <button
                          onClick={() => setLogToEdit(log)}
                          className="text-xs font-bold text-ink-muted hover:text-primary flex items-center gap-1.5 px-4 py-2 rounded-xl border border-divider hover:bg-[#F7E4DB] transition-colors whitespace-nowrap"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Edit Log
                        </button>
                          <button
                            onClick={() => handleDeleteLog(log)}
                            className="text-xs font-bold text-[#9C3B2E] hover:text-[#9C3B2E] flex items-center justify-center p-2 rounded-xl border border-divider hover:bg-[#9C3B2E]/8 transition-colors"
                            title="Delete Log"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-12 pt-6 border-t border-divider flex justify-between text-[10px] font-bold text-ink-muted/80 uppercase tracking-widest">
              <span>Generated via BuildFlow Pro</span>
              <span>
                Generated by {user?.displayName || user?.email} on{" "}
                {format(new Date(), "dd MMM yyyy HH:mm")}
              </span>
            </div>
          </div>
        </div>
      )}
      
      {logToEdit && (
        <DailyLogEntryScreen
          projectId={projectId}
          taskId={logToEdit.taskId}
          editLog={logToEdit}
          onClose={() => setLogToEdit(null)}
        />
      )}
      {logToDelete && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-panel w-full max-w-sm rounded-3xl p-6 shadow-2xl relative">
            <h3 className="text-xl font-bold text-ink mb-2 text-center">
              Delete Log Entry?
            </h3>
            <p className="text-sm font-medium text-ink-muted text-center mb-8">
              This will update the task's progress, dates, and material/labour
              rollups. This action cannot be undone.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setLogToDelete(null)}
                className="py-3.5 px-6 rounded-2xl font-bold bg-panel hover:bg-divider text-ink transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteLog}
                className="py-3.5 px-6 rounded-2xl font-bold bg-[#9C3B2E] hover:bg-[#8A3428] text-white transition shadow-[0_4px_20px_rgba(239,68,68,0.3)] cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};