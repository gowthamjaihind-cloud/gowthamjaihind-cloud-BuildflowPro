import React, { useState, useMemo } from "react";
import { exportToCSV, exportToPDF } from "../utils/exportUtils";
import { useProjectDataQuery, useTasksQuery } from "../hooks/queries";
import { useProjectDailyLogsQuery } from "../hooks/useDailyLogs";
import {
  DownloadSimple as Download,
  Package,
  Pulse as Activity,
  CircleNotch as Loader2,
  Calendar,
  FileText,
  MagnifyingGlass as Search,
  SlidersHorizontal,
  ArrowCounterClockwise as RotateCcw,
  TrendUp as TrendingUp,
  Stack as Layers,
  ArrowsDownUp as ArrowUpDown,
  Funnel as Filter,
} from "@phosphor-icons/react";

interface MaterialConsumptionViewProps {
  projectId: string;
}

const MaterialConsumptionView: React.FC<MaterialConsumptionViewProps> = ({
  projectId,
}) => {
  // Local Filter state for Active Material Tab
  const [localTaskSearch, setLocalTaskSearch] = useState("");
  const [localStartDate, setLocalStartDate] = useState("");
  const [localEndDate, setLocalEndDate] = useState("");

  // Advanced Filter state
  const [advMaterial, setAdvMaterial] = useState("");
  const [advTask, setAdvTask] = useState("");
  const [advStartDate, setAdvStartDate] = useState("");
  const [advEndDate, setAdvEndDate] = useState("");
  const [advMinQty, setAdvMinQty] = useState("");
  const [advMaxQty, setAdvMaxQty] = useState("");
  const [advSource, setAdvSource] = useState(""); // "", "Material Issue", "Daily Log"
  
  // Advanced Filter sorting
  const [sortField, setSortField] = useState<"date" | "quantity">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Fetch from Firebase via React Query hooks
  const { data: allIssues = [], isLoading: isIssuesLoading } =
    useProjectDataQuery<any>(projectId, "material_issues");
  const { data: allLogs = [], isLoading: isLogsLoading } =
    useProjectDailyLogsQuery(projectId);
  const { data: tasks = [], isLoading: isTasksLoading } =
    useTasksQuery(projectId);

  // Derive all consumption records from issues and logs
  const allRecords = useMemo(() => {
    let records: any[] = [];
    allIssues
      .filter((issue) => !issue.remarks?.startsWith("Daily Progress") && !issue.notes?.startsWith("Daily Progress"))
      .forEach((issue) => {
        if (issue.items && Array.isArray(issue.items)) {
          issue.items.forEach((m) => {
            records.push({
              id: `${issue.id}-${m.itemId || m.materialId || Math.random()}`,
              date: issue.issueDate || issue.date || "",
              taskName: issue.taskName || `Task ${issue.taskId}`,
              materialName: m.name,
              quantity: m.quantity || 0,
              unit: m.unit || "",
              note: issue.remarks || "From Material Issue",
              logId: issue.id,
              source: "Material Issue",
            });
          });
        } else if (issue.materialId) {
          records.push({
            id: issue.id,
            date: issue.date || "",
            taskName: `Task ${issue.taskId}`,
            materialName: issue.notes || "Material Issue",
            quantity: issue.quantity || 0,
            unit: issue.unit || "",
            note: issue.notes || "From Material Issue",
            logId: issue.id,
            source: "Material Issue",
          });
        }
      });

    allLogs.forEach((log) => {
      const taskName =
        tasks.find((t) => t.id === log.taskId)?.name || `Task ${log.taskId}`;
      if (log.materials && Array.isArray(log.materials)) {
        log.materials.forEach((m: any) => {
          records.push({
            id: `${log.id}-${m.materialId || Math.random()}`,
            date: log.workDate || "",
            taskName,
            materialName: m.name,
            quantity: m.quantity || 0,
            unit: m.unit || "",
            note: log.note || "From Daily Log",
            logId: log.id,
            source: "Daily Log",
          });
        });
      }
    });

    return records.sort((a, b) => b.date.localeCompare(a.date));
  }, [allIssues, allLogs, tasks]);

  // Distinct Materials list for Tabs
  const distinctMaterials = useMemo(() => {
    const uniq = Array.from(new Set(allRecords.map((r) => r.materialName))).filter(Boolean);
    return uniq.sort();
  }, [allRecords]);

  // Distinct Tasks list for dropdowns
  const distinctTasks = useMemo(() => {
    const uniq = Array.from(new Set(allRecords.map((r) => r.taskName))).filter(Boolean);
    return uniq.sort();
  }, [allRecords]);

  // Tab State
  const defaultTab = useMemo(() => {
    if (distinctMaterials.length > 0) {
      return distinctMaterials[0];
    }
    return "advanced-filter";
  }, [distinctMaterials]);

  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const activeTab = selectedTab || defaultTab;

  // Change tabs cleaner
  const handleTabChange = (tabName: string) => {
    setSelectedTab(tabName);
    // Reset local filters on tab change
    setLocalTaskSearch("");
    setLocalStartDate("");
    setLocalEndDate("");
  };

  // Records filtered for the Active Material tab
  const activeMaterialRecords = useMemo(() => {
    if (activeTab === "advanced-filter") return [];
    
    return allRecords.filter((record) => {
      if (record.materialName !== activeTab) return false;

      const matchesTask = localTaskSearch
        ? record.taskName.toLowerCase().includes(localTaskSearch.toLowerCase())
        : true;
      const matchesStart = localStartDate ? record.date >= localStartDate : true;
      const matchesEnd = localEndDate ? record.date <= localEndDate : true;

      return matchesTask && matchesStart && matchesEnd;
    });
  }, [allRecords, activeTab, localTaskSearch, localStartDate, localEndDate]);

  // Insights for the selected material tab
  const materialInsights = useMemo(() => {
    if (activeTab === "advanced-filter" || activeMaterialRecords.length === 0) {
      return { total: 0, count: 0, avg: 0, unit: "" };
    }
    const total = activeMaterialRecords.reduce((sum, r) => sum + r.quantity, 0);
    const count = activeMaterialRecords.length;
    const avg = total / count;
    const unit = activeMaterialRecords[0]?.unit || "";
    return { total, count, avg, unit };
  }, [activeTab, activeMaterialRecords]);

  // Advanced Filter computation
  const advancedFilteredRecords = useMemo(() => {
    let result = [...allRecords];

    if (advMaterial) {
      result = result.filter((r) => r.materialName === advMaterial);
    }
    if (advTask) {
      result = result.filter((r) => r.taskName === advTask);
    }
    if (advStartDate) {
      result = result.filter((r) => r.date >= advStartDate);
    }
    if (advEndDate) {
      result = result.filter((r) => r.date <= advEndDate);
    }
    if (advMinQty) {
      const minVal = parseFloat(advMinQty);
      if (!isNaN(minVal)) {
        result = result.filter((r) => r.quantity >= minVal);
      }
    }
    if (advMaxQty) {
      const maxVal = parseFloat(advMaxQty);
      if (!isNaN(maxVal)) {
        result = result.filter((r) => r.quantity <= maxVal);
      }
    }
    if (advSource) {
      result = result.filter((r) => r.source === advSource);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === "date") {
        comparison = a.date.localeCompare(b.date);
      } else if (sortField === "quantity") {
        comparison = a.quantity - b.quantity;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [
    allRecords,
    advMaterial,
    advTask,
    advStartDate,
    advEndDate,
    advMinQty,
    advMaxQty,
    advSource,
    sortField,
    sortOrder,
  ]);

  const getExportData = (recordsToExport: any[]) => {
    const headers = ["Date", "Material Name", "Consumed In Task", "Quantity", "Unit", "Source Type", "Log Note"];
    const rows = recordsToExport.map((r) => [
      r.date || "",
      r.materialName || "",
      r.taskName || "",
      r.quantity || 0,
      r.unit || "",
      r.source || "",
      r.note || "",
    ]);
    return { headers, rows };
  };

  const handleExportCSV = (recordsToExport: any[]) => {
    const { headers, rows } = getExportData(recordsToExport);
    const dateStr = new Date().toISOString().split("T")[0];
    exportToCSV(`Material_Consumption_${activeTab === "advanced-filter" ? "Filtered" : activeTab.replace(/\s+/g, "_")}_${dateStr}`, headers, rows);
  };

  const handleExportPDF = (recordsToExport: any[]) => {
    const { headers, rows } = getExportData(recordsToExport);
    const dateStr = new Date().toISOString().split("T")[0];
    exportToPDF("Material Consumption Log", `Project ID: ${projectId}`, headers, rows, `Material_Consumption_${activeTab === "advanced-filter" ? "Filtered" : activeTab.replace(/\s+/g, "_")}_${dateStr}`);
  };

  const handleResetAdvancedFilters = () => {
    setAdvMaterial("");
    setAdvTask("");
    setAdvStartDate("");
    setAdvEndDate("");
    setAdvMinQty("");
    setAdvMaxQty("");
    setAdvSource("");
    setSortField("date");
    setSortOrder("desc");
  };

  const isLoading = isIssuesLoading || isLogsLoading || isTasksLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center p-24 text-ink-muted gap-3" id="loading-container">
        <Loader2 className="w-10 h-10 animate-spin text-[#D97D54]" />
        <p className="text-xs font-bold uppercase tracking-widest animate-pulse">Syncing consumption databases...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-32" id="consumption-view-container">
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-surface/80 backdrop-blur-xl p-6 md:p-8 rounded-[24px] border border-divider shadow-sm" id="header-bar">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-ink tracking-tight mb-2">
            Material Consumption
          </h2>
          <p className="text-ink-muted font-bold text-[10px] md:text-xs uppercase tracking-[0.15em]">
            Aggregated and analyzed logs from site daily diaries and material dispatch receipts.
          </p>
        </div>
        
        {allRecords.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              id="export-current-csv-btn"
              onClick={() => handleExportCSV(activeTab === "advanced-filter" ? advancedFilteredRecords : activeMaterialRecords)}
              disabled={activeTab === "advanced-filter" ? advancedFilteredRecords.length === 0 : activeMaterialRecords.length === 0}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-panel hover:bg-divider border border-divider rounded-xl text-xs font-bold uppercase tracking-wider text-ink transition duration-200 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Download className="w-4 h-4 text-[#D97D54]" />
              Export CSV
            </button>
            <button
              id="export-current-pdf-btn"
              onClick={() => handleExportPDF(activeTab === "advanced-filter" ? advancedFilteredRecords : activeMaterialRecords)}
              disabled={activeTab === "advanced-filter" ? advancedFilteredRecords.length === 0 : activeMaterialRecords.length === 0}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-[#C0653F] hover:bg-[#A0522F] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition duration-200 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Export PDF
            </button>
          </div>
        )}
      </div>

      {/* NO RECORDS GENERAL STATE */}
      {allRecords.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-divider p-20 text-center" id="empty-state-container">
          <div className="w-20 h-20 bg-panel rounded-full flex items-center justify-center mx-auto mb-6 border border-divider">
            <Package className="text-ink-muted w-10 h-10" />
          </div>
          <h3 className="text-lg font-black text-ink mb-1 uppercase tracking-wider">No Consumption Logs Yet</h3>
          <p className="text-ink-muted text-xs max-w-md mx-auto">
            Once tasks start recording materials used in their Daily Logs or formal Material Issues are processed, they will appear aggregated here.
          </p>
        </div>
      ) : (
        <div className="space-y-6" id="consumption-analytics-content">
          {/* TAB BAR */}
          <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between" id="navigation-tabs-section">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide flex-1" id="tab-pill-list">
              {distinctMaterials.map((materialName) => {
                const countOfMaterialLogs = allRecords.filter((r) => r.materialName === materialName).length;
                const isActive = activeTab === materialName;
                return (
                  <button
                    key={materialName}
                    id={`tab-material-${materialName.replace(/\s+/g, "-")}`}
                    onClick={() => handleTabChange(materialName)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold tracking-tight uppercase transition duration-150 flex items-center gap-2 shrink-0 border cursor-pointer ${
                      isActive
                        ? "bg-surface border-[#D97D54] text-[#D97D54] shadow-md shadow-[#D97D54]/5"
                        : "bg-panel hover:bg-divider border-divider text-ink-muted hover:text-ink"
                    }`}
                  >
                    <Package className={`w-3.5 h-3.5 ${isActive ? "text-[#D97D54]" : "text-ink-muted"}`} />
                    <span>{materialName}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black ${isActive ? "bg-[#D97D54]/10 text-[#D97D54]" : "bg-surface text-ink-muted"}`}>
                      {countOfMaterialLogs}
                    </span>
                  </button>
                );
              })}

              <button
                id="tab-advanced-filter"
                onClick={() => handleTabChange("advanced-filter")}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold tracking-tight uppercase transition duration-150 flex items-center gap-2 shrink-0 border cursor-pointer ${
                  activeTab === "advanced-filter"
                    ? "bg-[#D97D54] border-[#D97D54] text-white shadow-md shadow-[#D97D54]/10"
                    : "bg-panel hover:bg-divider border-divider text-ink-muted hover:text-ink"
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Advanced Search Engine</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black ${activeTab === "advanced-filter" ? "bg-white/20 text-white" : "bg-surface text-ink-muted"}`}>
                  {allRecords.length}
                </span>
              </button>
            </div>
          </div>

          {/* ACTIVE CONTENT GRID */}
          {activeTab !== "advanced-filter" ? (
            <div className="space-y-6" id="material-tab-panel">
              {/* INSIGHTS METRICS BAR */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="material-insights-grid">
                <div className="bg-surface p-5 rounded-2xl border border-divider shadow-sm flex items-center justify-between" id="card-total-consumed">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-ink-muted mb-1">Total Consumed</p>
                    <p className="text-2xl font-black text-ink font-mono">
                      {materialInsights.total.toLocaleString("en-IN")}{" "}
                      <span className="text-xs font-normal text-ink-muted">{materialInsights.unit}</span>
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-[#87BCBF]/12 text-[#3E8388] flex items-center justify-center border border-[#87BCBF]/30">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-surface p-5 rounded-2xl border border-divider shadow-sm flex items-center justify-between" id="card-total-logs">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-ink-muted mb-1">Logging Events</p>
                    <p className="text-2xl font-black text-ink font-mono">{materialInsights.count}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-[#6E8CA0]/10 text-[#56778E] flex items-center justify-center border border-[#6E8CA0]/20">
                    <FileText className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-surface p-5 rounded-2xl border border-divider shadow-sm flex items-center justify-between" id="card-avg-consumption">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-ink-muted mb-1">Avg. Consumption per Log</p>
                    <p className="text-2xl font-black text-ink font-mono">
                      {materialInsights.avg.toLocaleString("en-IN", { maximumFractionDigits: 1 })}{" "}
                      <span className="text-xs font-normal text-ink-muted">{materialInsights.unit}</span>
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-[#D97D54]/10 text-[#C0653F] flex items-center justify-center border border-[#D97D54]/20">
                    <Activity className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* LOCAL FILTER MODULE FOR SPECIFIC MATERIAL */}
              <div className="bg-panel p-4 rounded-2xl border border-divider flex flex-col md:flex-row items-stretch md:items-center gap-4 justify-between" id="local-filter-module">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  <div className="flex items-center gap-2 bg-surface px-3 py-2 border border-divider rounded-xl flex-1 md:flex-none">
                    <Search className="w-4 h-4 text-ink-muted" />
                    <input
                      type="text"
                      placeholder="Filter by Task..."
                      value={localTaskSearch}
                      onChange={(e) => setLocalTaskSearch(e.target.value)}
                      className="bg-transparent border-none outline-none font-bold text-ink text-xs w-full sm:w-44 placeholder:text-ink-muted/50"
                    />
                  </div>

                  <div className="flex items-center gap-2 bg-surface px-3 py-2 border border-divider rounded-xl text-[10px] font-black uppercase tracking-widest text-ink-muted">
                    <Calendar className="w-3.5 h-3.5" />
                    <input
                      type="date"
                      value={localStartDate}
                      onChange={(e) => setLocalStartDate(e.target.value)}
                      className="bg-transparent border-none outline-none font-bold text-ink text-[10px]"
                    />
                    <span className="opacity-40">TO</span>
                    <input
                      type="date"
                      value={localEndDate}
                      onChange={(e) => setLocalEndDate(e.target.value)}
                      className="bg-transparent border-none outline-none font-bold text-ink text-[10px]"
                    />
                  </div>
                </div>

                {(localTaskSearch || localStartDate || localEndDate) && (
                  <button
                    id="clear-local-filter-btn"
                    onClick={() => {
                      setLocalTaskSearch("");
                      setLocalStartDate("");
                      setLocalEndDate("");
                    }}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface text-ink-muted text-[10px] font-black uppercase tracking-wider hover:text-ink border border-divider transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset Filters
                  </button>
                )}
              </div>

              {/* MATERIAL SPECIFIC TABLE */}
              <div className="bg-surface rounded-2xl border border-divider shadow-sm overflow-hidden" id="material-logs-table-wrapper">
                <div className="overflow-x-auto scrollbar-hide">
                  <table className="w-full text-left min-w-[700px]">
                    <thead>
                      <tr className="bg-panel border-b border-divider">
                        <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted">Date</th>
                        <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted">Task Description</th>
                        <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted">Source Channel</th>
                        <th className="px-6 py-4 text-right text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted">Quantity Consumed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-divider/40">
                      {activeMaterialRecords.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-16 text-center">
                            <FileText className="text-ink-muted/50 w-8 h-8 mx-auto mb-3" />
                            <p className="text-ink-muted text-xs font-bold uppercase tracking-wider">No matching logs found</p>
                          </td>
                        </tr>
                      ) : (
                        activeMaterialRecords.map((record) => (
                          <tr key={record.id} className="hover:bg-panel/30 transition duration-150">
                            <td className="px-6 py-5 font-mono text-xs text-ink-muted whitespace-nowrap">{record.date}</td>
                            <td className="px-6 py-5">
                              <div className="font-bold text-xs tracking-tight text-ink">{record.taskName}</div>
                              <div className="text-[10px] text-ink-muted italic mt-0.5 line-clamp-1" title={record.note}>
                                {record.note}
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                  record.source === "Material Issue"
                                    ? "bg-[#D97D54]/10 text-[#D97D54] border border-[#D97D54]/20"
                                    : "bg-[#6E8CA0]/10 text-[#46617C] border border-[#6E8CA0]/20"
                                }`}
                              >
                                {record.source}
                              </span>
                            </td>
                            <td className="px-6 py-5 text-right font-mono text-xs font-bold text-ink">
                              {record.quantity.toLocaleString("en-IN")}{" "}
                              <span className="text-[9px] text-ink-muted font-normal">{record.unit}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* ADVANCED FILTER PANEL */
            <div className="space-y-6" id="advanced-search-engine-panel">
              <div className="bg-surface border border-divider rounded-2xl p-6 shadow-sm space-y-6" id="advanced-filters-block">
                <div className="flex items-center gap-2 pb-3 border-b border-divider">
                  <Filter className="w-4 h-4 text-[#D97D54]" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-ink">Multi-Parameter Search Filters</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Material Selector */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-ink-muted block ml-1">Material Name</label>
                    <select
                      id="filter-material"
                      value={advMaterial}
                      onChange={(e) => setAdvMaterial(e.target.value)}
                      className="w-full bg-panel border border-divider rounded-xl p-2.5 text-xs font-bold text-ink focus:border-[#D97D54] outline-none"
                    >
                      <option value="">All Materials</option>
                      {distinctMaterials.map((mat) => (
                        <option key={mat} value={mat}>{mat}</option>
                      ))}
                    </select>
                  </div>

                  {/* Task Selector */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-ink-muted block ml-1">Task Category</label>
                    <select
                      id="filter-task"
                      value={advTask}
                      onChange={(e) => setAdvTask(e.target.value)}
                      className="w-full bg-panel border border-divider rounded-xl p-2.5 text-xs font-bold text-ink focus:border-[#D97D54] outline-none"
                    >
                      <option value="">All Tasks</option>
                      {distinctTasks.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* Source Channel Selector */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-ink-muted block ml-1">Source Channel</label>
                    <select
                      id="filter-source"
                      value={advSource}
                      onChange={(e) => setAdvSource(e.target.value)}
                      className="w-full bg-panel border border-divider rounded-xl p-2.5 text-xs font-bold text-ink focus:border-[#D97D54] outline-none"
                    >
                      <option value="">All Sources</option>
                      <option value="Material Issue">Material Issue Documents</option>
                      <option value="Daily Log">Daily Progress Logs</option>
                    </select>
                  </div>

                  {/* Date Range Start */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-ink-muted block ml-1">From Date</label>
                    <input
                      id="filter-start-date"
                      type="date"
                      value={advStartDate}
                      onChange={(e) => setAdvStartDate(e.target.value)}
                      className="w-full bg-panel border border-divider rounded-xl p-2 text-xs font-bold text-ink focus:border-[#D97D54] outline-none"
                    />
                  </div>

                  {/* Date Range End */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-ink-muted block ml-1">To Date</label>
                    <input
                      id="filter-end-date"
                      type="date"
                      value={advEndDate}
                      onChange={(e) => setAdvEndDate(e.target.value)}
                      className="w-full bg-panel border border-divider rounded-xl p-2 text-xs font-bold text-ink focus:border-[#D97D54] outline-none"
                    />
                  </div>

                  {/* Min Quantity */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-ink-muted block ml-1">Min Quantity</label>
                    <input
                      id="filter-min-qty"
                      type="number"
                      placeholder="e.g. 5"
                      value={advMinQty}
                      onChange={(e) => setAdvMinQty(e.target.value)}
                      className="w-full bg-panel border border-divider rounded-xl p-2 text-xs font-bold text-ink focus:border-[#D97D54] outline-none placeholder:text-ink-muted/30 font-mono"
                    />
                  </div>

                  {/* Max Quantity */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-ink-muted block ml-1">Max Quantity</label>
                    <input
                      id="filter-max-qty"
                      type="number"
                      placeholder="e.g. 100"
                      value={advMaxQty}
                      onChange={(e) => setAdvMaxQty(e.target.value)}
                      className="w-full bg-panel border border-divider rounded-xl p-2 text-xs font-bold text-ink focus:border-[#D97D54] outline-none placeholder:text-ink-muted/30 font-mono"
                    />
                  </div>

                  {/* RESET BUTTON */}
                  <div className="flex items-end">
                    <button
                      id="reset-advanced-filters-btn"
                      onClick={handleResetAdvancedFilters}
                      className="w-full py-2.5 px-4 rounded-xl border border-divider bg-panel hover:bg-divider text-ink-muted hover:text-ink text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition duration-200 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset Search
                    </button>
                  </div>
                </div>
              </div>

              {/* SEARCH SUMMARY BAR */}
              <div className="flex justify-between items-center bg-panel px-5 py-4 rounded-xl border border-divider" id="search-summary-bar">
                <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wider">
                  Found <span className="font-black text-ink">{advancedFilteredRecords.length}</span> matching consumption entries
                </span>
                
                {/* Advanced Sorting Toggles */}
                <div className="flex items-center gap-4 text-xs font-bold" id="search-sort-toggles">
                  <div className="flex items-center gap-1.5 text-ink-muted">
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    Sort:
                  </div>
                  <button
                    id="sort-by-date"
                    onClick={() => {
                      if (sortField === "date") {
                        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                      } else {
                        setSortField("date");
                        setSortOrder("desc");
                      }
                    }}
                    className={`uppercase tracking-wider text-[10px] ${sortField === "date" ? "text-[#D97D54] font-black" : "text-ink-muted hover:text-ink"}`}
                  >
                    Date {sortField === "date" && (sortOrder === "asc" ? "▲" : "▼")}
                  </button>
                  <button
                    id="sort-by-qty"
                    onClick={() => {
                      if (sortField === "quantity") {
                        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                      } else {
                        setSortField("quantity");
                        setSortOrder("desc");
                      }
                    }}
                    className={`uppercase tracking-wider text-[10px] ${sortField === "quantity" ? "text-[#D97D54] font-black" : "text-ink-muted hover:text-ink"}`}
                  >
                    Quantity {sortField === "quantity" && (sortOrder === "asc" ? "▲" : "▼")}
                  </button>
                </div>
              </div>

              {/* ADVANCED FILTERED TABLE */}
              <div className="bg-surface rounded-2xl border border-divider shadow-sm overflow-hidden" id="advanced-logs-table-wrapper">
                <div className="overflow-x-auto scrollbar-hide">
                  <table className="w-full text-left min-w-[800px]">
                    <thead>
                      <tr className="bg-panel border-b border-divider">
                        <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted">Date</th>
                        <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted">Material Name</th>
                        <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted">Consumed In Task</th>
                        <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted">Channel</th>
                        <th className="px-6 py-4 text-right text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-divider/40">
                      {advancedFilteredRecords.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-20 text-center">
                            <FileText className="text-ink-muted/50 w-10 h-10 mx-auto mb-4" />
                            <p className="text-ink-muted text-xs font-bold uppercase tracking-wider">No records match the active search filters</p>
                            <button
                              id="reset-filter-link"
                              onClick={handleResetAdvancedFilters}
                              className="mt-3 text-xs text-[#D97D54] font-bold hover:underline uppercase tracking-widest"
                            >
                              Reset filters & view all
                            </button>
                          </td>
                        </tr>
                      ) : (
                        advancedFilteredRecords.map((record) => (
                          <tr key={record.id} className="hover:bg-panel/30 transition duration-150">
                            <td className="px-6 py-5 font-mono text-xs text-ink-muted whitespace-nowrap">{record.date}</td>
                            <td className="px-6 py-5">
                              <span className="font-bold text-xs tracking-tight text-ink">{record.materialName}</span>
                            </td>
                            <td className="px-6 py-5">
                              <div className="font-bold text-xs tracking-tight text-ink">{record.taskName}</div>
                              <div className="text-[10px] text-ink-muted italic mt-0.5 line-clamp-1" title={record.note}>
                                {record.note}
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                  record.source === "Material Issue"
                                    ? "bg-[#D97D54]/10 text-[#D97D54] border border-[#D97D54]/20"
                                    : "bg-[#6E8CA0]/10 text-[#46617C] border border-[#6E8CA0]/20"
                                }`}
                              >
                                {record.source}
                              </span>
                            </td>
                            <td className="px-6 py-5 text-right font-mono text-xs font-bold text-ink">
                              {record.quantity.toLocaleString("en-IN")}{" "}
                              <span className="text-[9px] text-ink-muted font-normal">{record.unit}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MaterialConsumptionView;
