import React, { useState, useMemo } from "react";
import { exportToCSV, exportToPDF } from "../utils/exportUtils";
import { useProjectDataQuery, useTasksQuery } from "../hooks/queries";
import { useProjectDailyLogsQuery } from "../hooks/useDailyLogs";
import { CountUp } from "./motion";
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
  Users,
  CurrencyInr as IndianRupee,
  HardHat,
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
  const [advGroupCode, setAdvGroupCode] = useState("");
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

  // Labor tab filter state
  const [laborTask, setLaborTask] = useState("");
  const [laborRole, setLaborRole] = useState("");
  const [laborVendor, setLaborVendor] = useState("");
  const [laborStartDate, setLaborStartDate] = useState("");
  const [laborEndDate, setLaborEndDate] = useState("");

  // Fetch from Firebase via React Query hooks
  const { data: allIssues = [], isLoading: isIssuesLoading } =
    useProjectDataQuery<any>(projectId, "material_issues");
  const { data: allLogs = [], isLoading: isLogsLoading } =
    useProjectDailyLogsQuery(projectId);
  const { data: tasks = [], isLoading: isTasksLoading } =
    useTasksQuery(projectId);
  const { data: inventory = [] } =
    useProjectDataQuery<any>(projectId, "inventory");
  const { data: rateCards = [] } =
    useProjectDataQuery<any>(projectId, "labor_rate_cards");
  const { data: suppliers = [] } =
    useProjectDataQuery<any>(projectId, "suppliers");
  const { data: legacyLaborLogs = [] } =
    useProjectDataQuery<any>(projectId, "labor_logs");

  // material name -> group code (from inventory), for the advanced group-code filter
  const materialGroupCodeMap = useMemo(() => {
    const map: Record<string, string> = {};
    inventory.forEach((item: any) => {
      if (item.name) map[item.name] = item.groupCode || "Ungrouped";
    });
    return map;
  }, [inventory]);

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

  // Distinct group codes (from the materials actually consumed) for the advanced filter
  const distinctGroupCodes = useMemo(() => {
    const uniq = Array.from(
      new Set(distinctMaterials.map((m) => materialGroupCodeMap[m] || "Ungrouped")),
    ).filter(Boolean);
    return uniq.sort();
  }, [distinctMaterials, materialGroupCodeMap]);

  // ---- LABOR CONSUMPTION records (mirrors LaborTrackingView derivation) ----
  const laborRecords = useMemo(() => {
    const records: any[] = [];

    // 1. Legacy labor_logs documents (already have per-task line items)
    (legacyLaborLogs || []).forEach((logDoc: any) => {
      (logDoc.items || []).forEach((it: any) => {
        records.push({
          id: `${logDoc.id}-${it.taskId}-${it.role}`,
          date: logDoc.date || "",
          taskName: it.taskName || tasks.find((t) => t.id === it.taskId)?.name || "Unknown Task",
          role: it.role || "Labour",
          vendorName: logDoc.vendorName || suppliers.find((v: any) => v.id === logDoc.vendorId)?.name || "—",
          headcount: it.headcount || 0,
          shifts: it.shifts || 1,
          cost: it.cost || 0,
          source: "Labor Log",
        });
      });
    });

    // 2. Labour entries embedded in daily logs (resolve role/rate/vendor via rate cards)
    (allLogs || []).forEach((log: any) => {
      const taskName = tasks.find((t) => t.id === log.taskId)?.name || `Task ${log.taskId}`;
      (log.labour || []).forEach((li: any) => {
        const rateCard = rateCards.find((r: any) => r.id === li.roleId);
        const vendor = rateCard ? suppliers.find((v: any) => v.id === rateCard.vendorId) : null;
        const headcount = li.headcount || 0;
        const rate = rateCard?.rate || 0;
        records.push({
          id: `${log.id}-${li.roleId || li.roleName || Math.random()}`,
          date: log.workDate || "",
          taskName,
          role: rateCard?.role || li.roleName || "Labour",
          vendorName: vendor?.name || "—",
          headcount,
          shifts: 1,
          cost: headcount * rate,
          source: "Daily Log",
        });
      });
    });

    return records.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [legacyLaborLogs, allLogs, tasks, rateCards, suppliers]);

  const distinctLaborTasks = useMemo(
    () => Array.from(new Set(laborRecords.map((r) => r.taskName))).filter(Boolean).sort(),
    [laborRecords],
  );
  const distinctLaborRoles = useMemo(
    () => Array.from(new Set(laborRecords.map((r) => r.role))).filter(Boolean).sort(),
    [laborRecords],
  );
  const distinctLaborVendors = useMemo(
    () => Array.from(new Set(laborRecords.map((r) => r.vendorName))).filter(Boolean).sort(),
    [laborRecords],
  );

  // Filtered labor records + per-task rollup + totals
  const filteredLaborRecords = useMemo(() => {
    return laborRecords.filter((r) => {
      if (laborTask && r.taskName !== laborTask) return false;
      if (laborRole && r.role !== laborRole) return false;
      if (laborVendor && r.vendorName !== laborVendor) return false;
      if (laborStartDate && r.date < laborStartDate) return false;
      if (laborEndDate && r.date > laborEndDate) return false;
      return true;
    });
  }, [laborRecords, laborTask, laborRole, laborVendor, laborStartDate, laborEndDate]);

  const laborTotals = useMemo(() => {
    const headcount = filteredLaborRecords.reduce((s, r) => s + (r.headcount || 0), 0);
    const cost = filteredLaborRecords.reduce((s, r) => s + (r.cost || 0), 0);
    const byTask: Record<string, { headcount: number; cost: number; entries: number }> = {};
    filteredLaborRecords.forEach((r) => {
      const key = r.taskName || "Unknown Task";
      if (!byTask[key]) byTask[key] = { headcount: 0, cost: 0, entries: 0 };
      byTask[key].headcount += r.headcount || 0;
      byTask[key].cost += r.cost || 0;
      byTask[key].entries += 1;
    });
    const perTask = Object.entries(byTask)
      .map(([taskName, v]) => ({ taskName, ...v }))
      .sort((a, b) => b.cost - a.cost);
    return { headcount, cost, entries: filteredLaborRecords.length, perTask };
  }, [filteredLaborRecords]);

  // Tab State
  const defaultTab = "material";

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

    if (advGroupCode) {
      result = result.filter(
        (r) => (materialGroupCodeMap[r.materialName] || "Ungrouped") === advGroupCode,
      );
    }
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
    advGroupCode,
    materialGroupCodeMap,
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

  // Totals for the current material (advanced-filter) view — restored insights bar.
  const advancedInsights = useMemo(() => {
    const total = advancedFilteredRecords.reduce((sum, r) => sum + (r.quantity || 0), 0);
    const count = advancedFilteredRecords.length;
    const avg = count > 0 ? total / count : 0;
    const units = Array.from(new Set(advancedFilteredRecords.map((r) => r.unit).filter(Boolean)));
    const unit = units.length === 1 ? units[0] : units.length === 0 ? "" : "mixed";
    return { total, count, avg, unit };
  }, [advancedFilteredRecords]);

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
    setAdvGroupCode("");
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
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-xs font-bold uppercase tracking-widest animate-pulse">Syncing consumption databases...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-32" id="consumption-view-container">
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-panel p-6 md:p-8 rounded-[24px] border border-divider shadow-sm" id="header-bar">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-ink tracking-tight mb-2">
            Consumption History
          </h2>
          <p className="text-ink-muted font-bold text-[10px] md:text-xs uppercase tracking-[0.15em]">
            Material and labor consumption aggregated from daily diaries, material issues and labor logs.
          </p>
        </div>
        
        {allRecords.length > 0 && activeTab !== "labor" && (
          <div className="flex items-center gap-2">
            <button
              id="export-current-csv-btn"
              onClick={() => handleExportCSV(advancedFilteredRecords)}
              disabled={advancedFilteredRecords.length === 0}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-panel hover:bg-divider border border-divider rounded-xl text-xs font-bold uppercase tracking-wider text-ink transition duration-200 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Download className="w-4 h-4 text-primary" />
              Export CSV
            </button>
            <button
              id="export-current-pdf-btn"
              onClick={() => handleExportPDF(advancedFilteredRecords)}
              disabled={advancedFilteredRecords.length === 0}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-[#C0653F] hover:bg-[#A0522F] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition duration-200 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Export PDF
            </button>
          </div>
        )}
      </div>

      {/* NO RECORDS GENERAL STATE */}
      {allRecords.length === 0 && laborRecords.length === 0 ? (
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
          {/* TAB BAR — two top-level tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide" id="navigation-tabs-section">
            <button
              id="tab-material"
              onClick={() => setSelectedTab("material")}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold tracking-tight uppercase transition duration-150 flex items-center gap-2 shrink-0 border cursor-pointer ${
                activeTab !== "labor"
                  ? "bg-primary border-primary text-white shadow-md shadow-primary/10"
                  : "bg-panel hover:bg-divider border-divider text-ink-muted hover:text-ink"
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Material Consumption</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-black ${activeTab !== "labor" ? "bg-white/20 text-white" : "bg-surface text-ink-muted"}`}>
                {allRecords.length}
              </span>
            </button>

            <button
              id="tab-labor"
              onClick={() => setSelectedTab("labor")}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold tracking-tight uppercase transition duration-150 flex items-center gap-2 shrink-0 border cursor-pointer ${
                activeTab === "labor"
                  ? "bg-[#324755] border-[#324755] text-white shadow-md shadow-[#324755]/10"
                  : "bg-panel hover:bg-divider border-divider text-ink-muted hover:text-ink"
              }`}
            >
              <HardHat className="w-3.5 h-3.5" />
              <span>Labor Consumption</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-black ${activeTab === "labor" ? "bg-white/20 text-white" : "bg-surface text-ink-muted"}`}>
                {laborRecords.length}
              </span>
            </button>
          </div>

          {/* ACTIVE CONTENT GRID */}
          {activeTab === "labor" ? (
            <div className="space-y-6" id="labor-tab-panel">
              {/* LABOR FILTERS */}
              <div className="bg-panel p-4 rounded-2xl border border-divider grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3" id="labor-filters">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted block ml-1">Task</label>
                  <select value={laborTask} onChange={(e) => setLaborTask(e.target.value)} className="w-full bg-surface border border-divider rounded-xl p-2.5 text-xs font-bold text-ink focus:border-[#324755] outline-none">
                    <option value="">All Tasks</option>
                    {distinctLaborTasks.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted block ml-1">Role / Trade</label>
                  <select value={laborRole} onChange={(e) => setLaborRole(e.target.value)} className="w-full bg-surface border border-divider rounded-xl p-2.5 text-xs font-bold text-ink focus:border-[#324755] outline-none">
                    <option value="">All Roles</option>
                    {distinctLaborRoles.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted block ml-1">Vendor</label>
                  <select value={laborVendor} onChange={(e) => setLaborVendor(e.target.value)} className="w-full bg-surface border border-divider rounded-xl p-2.5 text-xs font-bold text-ink focus:border-[#324755] outline-none">
                    <option value="">All Vendors</option>
                    {distinctLaborVendors.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted block ml-1">From</label>
                  <input type="date" value={laborStartDate} onChange={(e) => setLaborStartDate(e.target.value)} className="w-full bg-surface border border-divider rounded-xl p-2 text-xs font-bold text-ink focus:border-[#324755] outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted block ml-1">To</label>
                  <input type="date" value={laborEndDate} onChange={(e) => setLaborEndDate(e.target.value)} className="w-full bg-surface border border-divider rounded-xl p-2 text-xs font-bold text-ink focus:border-[#324755] outline-none" />
                </div>
              </div>

              {(laborTask || laborRole || laborVendor || laborStartDate || laborEndDate) && (
                <button onClick={() => { setLaborTask(""); setLaborRole(""); setLaborVendor(""); setLaborStartDate(""); setLaborEndDate(""); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface text-ink-muted text-[10px] font-black uppercase tracking-wider hover:text-ink border border-divider transition cursor-pointer">
                  <RotateCcw className="w-3.5 h-3.5" /> Reset Labor Filters
                </button>
              )}

              {/* LABOR TOTALS */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-surface p-5 rounded-2xl border border-divider shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-ink-muted mb-1">Total Manpower</p>
                    <p className="text-2xl font-black text-ink font-mono">{laborTotals.headcount.toLocaleString("en-IN")} <span className="text-xs font-normal text-ink-muted">head-shifts</span></p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-[#324755]/10 text-[#324755] flex items-center justify-center border border-[#324755]/20"><Users className="w-5 h-5" /></div>
                </div>
                <div className="bg-surface p-5 rounded-2xl border border-divider shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-ink-muted mb-1">Total Labor Cost</p>
                    <p className="text-2xl font-black text-ink font-mono">₹{laborTotals.cost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-success/12 text-success flex items-center justify-center border border-success/30"><IndianRupee className="w-5 h-5" /></div>
                </div>
                <div className="bg-surface p-5 rounded-2xl border border-divider shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-ink-muted mb-1">Deployment Entries</p>
                    <p className="text-2xl font-black text-ink font-mono">{laborTotals.entries}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-[#6E8CA0]/10 text-[#56778E] flex items-center justify-center border border-[#6E8CA0]/20"><FileText className="w-5 h-5" /></div>
                </div>
              </div>

              {/* PER-TASK ROLLUP */}
              <div className="bg-surface rounded-2xl border border-divider shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-divider flex items-center gap-2">
                  <HardHat className="w-4 h-4 text-[#324755]" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-ink">Labor Consumption per Task</h3>
                </div>
                <div className="overflow-x-auto scrollbar-hide">
                  <table className="w-full text-left min-w-[600px]">
                    <thead>
                      <tr className="bg-panel border-b border-divider">
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">Task</th>
                        <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">Entries</th>
                        <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">Manpower</th>
                        <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-divider/40">
                      {laborTotals.perTask.length === 0 ? (
                        <tr><td colSpan={4} className="p-16 text-center"><HardHat className="text-ink-muted/50 w-8 h-8 mx-auto mb-3" /><p className="text-ink-muted text-xs font-bold uppercase tracking-wider">No labor consumption found</p></td></tr>
                      ) : laborTotals.perTask.map((t) => (
                        <tr key={t.taskName} className="hover:bg-panel/30 transition duration-150">
                          <td className="px-6 py-4 font-bold text-xs text-ink">{t.taskName}</td>
                          <td className="px-6 py-4 text-right font-mono text-xs text-ink-muted">{t.entries}</td>
                          <td className="px-6 py-4 text-right font-mono text-xs font-bold text-ink">{t.headcount.toLocaleString("en-IN")}</td>
                          <td className="px-6 py-4 text-right font-mono text-xs font-bold text-success">₹{t.cost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* DETAIL LEDGER */}
              <div className="bg-surface rounded-2xl border border-divider shadow-sm overflow-hidden">
                <div className="overflow-x-auto scrollbar-hide">
                  <table className="w-full text-left min-w-[760px]">
                    <thead>
                      <tr className="bg-panel border-b border-divider">
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">Date</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">Task</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">Role</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">Vendor</th>
                        <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">Manpower</th>
                        <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-divider/40">
                      {filteredLaborRecords.length === 0 ? (
                        <tr><td colSpan={6} className="p-16 text-center"><FileText className="text-ink-muted/50 w-8 h-8 mx-auto mb-3" /><p className="text-ink-muted text-xs font-bold uppercase tracking-wider">No matching labor logs</p></td></tr>
                      ) : filteredLaborRecords.map((r) => (
                        <tr key={r.id} className="hover:bg-panel/30 transition duration-150">
                          <td className="px-6 py-4 font-mono text-xs text-ink-muted whitespace-nowrap">{r.date}</td>
                          <td className="px-6 py-4 font-bold text-xs text-ink">{r.taskName}</td>
                          <td className="px-6 py-4 text-xs text-ink">{r.role}</td>
                          <td className="px-6 py-4 text-xs text-ink-muted">{r.vendorName}</td>
                          <td className="px-6 py-4 text-right font-mono text-xs font-bold text-ink">{(r.headcount || 0).toLocaleString("en-IN")}</td>
                          <td className="px-6 py-4 text-right font-mono text-xs font-bold text-success">₹{(r.cost || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* ADVANCED FILTER PANEL */
            <div className="space-y-6" id="advanced-search-engine-panel">
              {/* INSIGHTS METRICS BAR — totals for the current filtered view */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="material-insights-grid">
                <div className="bg-surface p-5 rounded-2xl border border-divider shadow-sm flex items-center justify-between" id="card-total-consumed">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-ink-muted mb-1">Total Consumed</p>
                    <p className="text-2xl font-black text-ink font-mono">
                      <CountUp
                        value={advancedInsights.total}
                        format={(n) =>
                          n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
                        }
                      />{" "}
                      <span className="text-xs font-normal text-ink-muted">{advancedInsights.unit}</span>
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-success/12 text-success flex items-center justify-center border border-success/30">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>
                <div className="bg-surface p-5 rounded-2xl border border-divider shadow-sm flex items-center justify-between" id="card-total-logs">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-ink-muted mb-1">Logging Events</p>
                    <p className="text-2xl font-black text-ink font-mono">
                      <CountUp value={advancedInsights.count} />
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-[#6E8CA0]/10 text-[#56778E] flex items-center justify-center border border-[#6E8CA0]/20">
                    <FileText className="w-5 h-5" />
                  </div>
                </div>
                <div className="bg-surface p-5 rounded-2xl border border-divider shadow-sm flex items-center justify-between" id="card-avg-consumption">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-ink-muted mb-1">Avg. Consumption per Log</p>
                    <p className="text-2xl font-black text-ink font-mono">
                      <CountUp
                        value={advancedInsights.avg}
                        format={(n) =>
                          n.toLocaleString("en-IN", { maximumFractionDigits: 1 })
                        }
                      />{" "}
                      <span className="text-xs font-normal text-ink-muted">{advancedInsights.unit}</span>
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-[#C0653F] flex items-center justify-center border border-primary/20">
                    <Activity className="w-5 h-5" />
                  </div>
                </div>
              </div>

              <div className="bg-surface border border-divider rounded-2xl p-6 shadow-sm space-y-6" id="advanced-filters-block">
                <div className="flex items-center gap-2 pb-3 border-b border-divider">
                  <Filter className="w-4 h-4 text-primary" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-ink">Multi-Parameter Search Filters</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Group Code Selector */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted block ml-1">Material Group Code</label>
                    <select
                      id="filter-group-code"
                      value={advGroupCode}
                      onChange={(e) => setAdvGroupCode(e.target.value)}
                      className="w-full bg-panel border border-divider rounded-xl p-2.5 text-xs font-bold text-ink focus:border-primary outline-none"
                    >
                      <option value="">All Group Codes</option>
                      {distinctGroupCodes.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>

                  {/* Material Selector */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted block ml-1">Material Name</label>
                    <select
                      id="filter-material"
                      value={advMaterial}
                      onChange={(e) => setAdvMaterial(e.target.value)}
                      className="w-full bg-panel border border-divider rounded-xl p-2.5 text-xs font-bold text-ink focus:border-primary outline-none"
                    >
                      <option value="">All Materials</option>
                      {distinctMaterials
                        .filter((mat) => !advGroupCode || (materialGroupCodeMap[mat] || "Ungrouped") === advGroupCode)
                        .map((mat) => (
                          <option key={mat} value={mat}>{mat}</option>
                        ))}
                    </select>
                  </div>

                  {/* Task Selector */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted block ml-1">Task Category</label>
                    <select
                      id="filter-task"
                      value={advTask}
                      onChange={(e) => setAdvTask(e.target.value)}
                      className="w-full bg-panel border border-divider rounded-xl p-2.5 text-xs font-bold text-ink focus:border-primary outline-none"
                    >
                      <option value="">All Tasks</option>
                      {distinctTasks.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* Source Channel Selector */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted block ml-1">Source Channel</label>
                    <select
                      id="filter-source"
                      value={advSource}
                      onChange={(e) => setAdvSource(e.target.value)}
                      className="w-full bg-panel border border-divider rounded-xl p-2.5 text-xs font-bold text-ink focus:border-primary outline-none"
                    >
                      <option value="">All Sources</option>
                      <option value="Material Issue">Material Issue Documents</option>
                      <option value="Daily Log">Daily Progress Logs</option>
                    </select>
                  </div>

                  {/* Date Range Start */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted block ml-1">From Date</label>
                    <input
                      id="filter-start-date"
                      type="date"
                      value={advStartDate}
                      onChange={(e) => setAdvStartDate(e.target.value)}
                      className="w-full bg-panel border border-divider rounded-xl p-2 text-xs font-bold text-ink focus:border-primary outline-none"
                    />
                  </div>

                  {/* Date Range End */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted block ml-1">To Date</label>
                    <input
                      id="filter-end-date"
                      type="date"
                      value={advEndDate}
                      onChange={(e) => setAdvEndDate(e.target.value)}
                      className="w-full bg-panel border border-divider rounded-xl p-2 text-xs font-bold text-ink focus:border-primary outline-none"
                    />
                  </div>

                  {/* Min Quantity */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted block ml-1">Min Quantity</label>
                    <input
                      id="filter-min-qty"
                      type="number"
                      placeholder="e.g. 5"
                      value={advMinQty}
                      onChange={(e) => setAdvMinQty(e.target.value)}
                      className="w-full bg-panel border border-divider rounded-xl p-2 text-xs font-bold text-ink focus:border-primary outline-none placeholder:text-ink-muted/30 font-mono"
                    />
                  </div>

                  {/* Max Quantity */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted block ml-1">Max Quantity</label>
                    <input
                      id="filter-max-qty"
                      type="number"
                      placeholder="e.g. 100"
                      value={advMaxQty}
                      onChange={(e) => setAdvMaxQty(e.target.value)}
                      className="w-full bg-panel border border-divider rounded-xl p-2 text-xs font-bold text-ink focus:border-primary outline-none placeholder:text-ink-muted/30 font-mono"
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
                <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider">
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
                    className={`uppercase tracking-wider text-[10px] ${sortField === "date" ? "text-primary font-black" : "text-ink-muted hover:text-ink"}`}
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
                    className={`uppercase tracking-wider text-[10px] ${sortField === "quantity" ? "text-primary font-black" : "text-ink-muted hover:text-ink"}`}
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
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">Date</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">Material Name</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">Consumed In Task</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">Channel</th>
                        <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">Quantity</th>
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
                              className="mt-3 text-xs text-primary font-bold hover:underline uppercase tracking-widest"
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
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                  record.source === "Material Issue"
                                    ? "bg-primary/10 text-primary border border-primary/20"
                                    : "bg-[#6E8CA0]/10 text-[#46617C] border border-[#6E8CA0]/20"
                                }`}
                              >
                                {record.source}
                              </span>
                            </td>
                            <td className="px-6 py-5 text-right font-mono text-xs font-bold text-ink">
                              {record.quantity.toLocaleString("en-IN")}{" "}
                              <span className="text-[10px] text-ink-muted font-normal">{record.unit}</span>
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
