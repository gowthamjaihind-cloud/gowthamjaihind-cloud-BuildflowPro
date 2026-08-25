import React, { useState, useEffect, useMemo } from "react";
import {
  db,
  collection,
  onSnapshot,
  query,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  getDoc,
  handleFirestoreError,
  OperationType,
} from "../firebase";
import { exportToCSV, exportToPDF } from "../utils/exportUtils";
import { useTranslation } from "../i18n";
import {
  CostEntry,
  Task,
  InventoryItem,
  LaborRateCard,
  Vendor,
  DailyLaborLog,
  MaterialIssue,
} from "../types";
import {
  CurrencyInr as IndianRupee,
  TrendUp as TrendingUp,
  ChartPie as PieChart,
  Plus,
  Calendar,
  TreeStructure as ListTree,
  CaretRight as ChevronRight,
  CaretDown as ChevronDown,
  FileText,
  DownloadSimple as Download,
  FloppyDisk as Save,
  PencilSimpleLine as Edit3,
  Check,
  X,
  WarningCircle as AlertCircle,
  Trash as Trash2,
  Stack as Layers,
  Truck,
  MapPin,
  MagnifyingGlass as Search,
  Info,
} from "@phosphor-icons/react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { ClientPaymentsView } from "./ClientPaymentsView";
import { useProjectDataQuery } from "../hooks/queries";
import { useProjectCostTotals } from "../hooks/useProjectCostTotals";
import { useAuthStore } from "../store";
import { useQueryClient } from "@tanstack/react-query";

interface CostManagementProps {
  projectId: string;
}

export const CostManagement: React.FC<CostManagementProps> = ({
  projectId,
}) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;

  const queryClient = useQueryClient();
  const { data: entries = [] } = useProjectDataQuery<CostEntry>(
    projectId,
    "costs",
  );
  const { data: tasks = [] } = useProjectDataQuery<Task>(projectId, "tasks");
  const { data: inventory = [] } = useProjectDataQuery<InventoryItem>(
    projectId,
    "inventory",
  );
  const { data: rateCards = [] } = useProjectDataQuery<LaborRateCard>(
    projectId,
    "labor_rate_cards",
  );
  const { data: vendors = [] } = useProjectDataQuery<Vendor>(
    projectId,
    "suppliers",
  );
  const { data: vendorLedger = [] } = useProjectDataQuery<any>(
    projectId,
    "ledger",
  );
  const { data: laborLogs = [] } = useProjectDataQuery<DailyLaborLog>(
    projectId,
    "labor_logs",
  );
  const { data: dailyLogs = [] } = useProjectDataQuery<any>(
    projectId,
    "dailyLogs",
  );
  const { data: materialIssues = [] } = useProjectDataQuery<any>(
    projectId,
    "material_issues",
  );
  const { data: clientPayments = [] } = useProjectDataQuery<any>(
    projectId,
    "client_payments",
  );

  const { stats, taskTotalsMap, getTaskTotals } =
    useProjectCostTotals(projectId);

  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!projectId) return;
    const hasUnlinked = entries.some((e) => !e.taskId);
    if (hasUnlinked) {
      const overheadTask = tasks.find(
        (t) => t.name === "Project Overhead" && t.isSystemGenerated,
      );
      if (!overheadTask) {
        const createOverhead = async () => {
          try {
            const { doc, getDoc, setDoc } = await import("firebase/firestore");
            const { db } = await import("../firebase");
            const overheadRef = doc(
              db,
              `${basePath}/tasks`,
              "system-project-overhead",
            );
            const overheadDoc = await getDoc(overheadRef);
            if (!overheadDoc.exists()) {
              await setDoc(overheadRef, {
                projectId,
                name: "Project Overhead",
                type: "Summary",
                isSystemGenerated: true,
                phase: "Project Overheads",
                location: "Global",
                startDate: new Date().toISOString().split("T")[0],
                endDate: new Date().toISOString().split("T")[0],
                duration: 1,
                progress: 0,
              });
            }
          } catch (e) {
            console.error("Failed to create Project Overhead task", e);
          }
        };
        createOverhead();
      }
    }
  }, [entries, tasks, projectId]);

  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<
    "dashboard" | "wbs" | "report" | "payments" | "direct_costs"
  >("dashboard");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filterTag, setFilterTag] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [showLaborBreakdown, setShowLaborBreakdown] = useState<string | null>(
    null,
  );
  const [showMaterialBreakdown, setShowMaterialBreakdown] = useState<
    string | null
  >(null);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    tasks.forEach((task) => {
      task.activityCodes?.forEach((code) => tags.add(code));
    });
    return Array.from(tags).sort();
  }, [tasks]);

  const groupedTasks = useMemo(() => {
    let filtered = tasks;

    // Only get root tasks for normal view to prevent duplicates
    if (!filterTag && !searchTerm) {
      filtered = filtered.filter((t) => !t.parentId);
    } else {
      if (filterTag) {
        filtered = filtered.filter((t) => t.activityCodes?.includes(filterTag));
      }
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(
          (t) =>
            t.name.toLowerCase().includes(term) ||
            t.phase?.toLowerCase().includes(term) ||
            t.location?.toLowerCase().includes(term),
        );
      }
    }

    const phases: Record<string, Record<string, Task[]>> = {};

    filtered.forEach((task) => {
      const phase = task.phase || "Unassigned Phase";
      const location = task.location || "Unassigned Location";

      const isSearchActive = !!(filterTag || searchTerm);

      if (isSearchActive || !task.parentId) {
        if (!phases[phase]) phases[phase] = {};
        if (!phases[phase][location]) phases[phase][location] = [];
        phases[phase][location].push(task);
      }
    });

    // Sort phases and locations alphabetically, and tasks by startDate
    const sortedPhases: Record<string, Record<string, Task[]>> = {};
    Object.keys(phases)
      .sort()
      .forEach((phase) => {
        sortedPhases[phase] = {};
        Object.keys(phases[phase])
          .sort()
          .forEach((location) => {
            sortedPhases[phase][location] = [...phases[phase][location]].sort(
              (a, b) => (a.startDate || "").localeCompare(b.startDate || ""),
            );
          });
      });

    return sortedPhases;
  }, [tasks, filterTag, searchTerm]);

  // Helper to calculate roll-ups for a task
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<Task>>({});

  const [newEntry, setNewEntry] = useState<Partial<CostEntry>>({
    description: "",
    amount: 0,
    type: "Actual",
    category: "Labor",
    date: new Date().toISOString().split("T")[0],
    taskId: "",
  });

  // Inline insight for the cost-entry form: for an Actual spend against a task,
  // say how it lands versus that task's planned budget so the user sees an
  // overrun before saving, not in a report next week.
  const entryInsight = useMemo(() => {
    const amount = newEntry.amount || 0;
    const taskId = newEntry.taskId;
    if (!taskId || amount <= 0 || newEntry.type !== "Actual") return null;
    const totals = getTaskTotals(taskId);
    const planned = totals?.totalPlanned || 0;
    const actual = totals?.totalActual || 0;
    if (planned <= 0) return null;
    const inr = (n: number) =>
      `₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;
    const remaining = planned - actual;
    if (amount > remaining) {
      return {
        tone: "bad" as const,
        text: `Puts this task ${inr(actual + amount - planned)} over its ${inr(planned)} budget (${inr(Math.max(0, remaining))} left).`,
      };
    }
    const pct = (amount / planned) * 100;
    return {
      tone: "good" as const,
      text: `${pct.toFixed(1)}% of this task's ${inr(planned)} budget · ${inr(remaining - amount)} would remain.`,
    };
  }, [newEntry.amount, newEntry.taskId, newEntry.type, getTaskTotals]);

  const flattenedTasks = useMemo(() => {
    const result: { id: string; name: string; level: number }[] = [];
    const buildFlatList = (
      parentId: string | null | undefined,
      level: number,
    ) => {
      tasks
        .filter(
          (t) =>
            (t.parentId || null) === (parentId || null) && !t.isSystemGenerated,
        )
        .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""))
        .forEach((task) => {
          result.push({ id: task.id, name: task.name, level });
          buildFlatList(task.id, level + 1);
        });
    };
    buildFlatList(null, 0);
    return result;
  }, [tasks]);

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newEntry.category?.toLowerCase() === "material") {
      alert(
        "Material costs are tracked automatically from daily logs — log consumption via the Daily Log screen instead",
      );
      return;
    }
    const path = `${basePath}/costs`;
    try {
      if (newEntry.id) {
        // First rollback the old entry's impact if we have one
        const oldEntry = entries.find((e) => e.id === newEntry.id);
        if (oldEntry && oldEntry.taskId) {
          const task = tasks.find((t) => t.id === oldEntry.taskId);
          if (task) {
            const rollbackData: any = {};
            const isActual = oldEntry.type === "Actual";

            if (oldEntry.category === "Material") {
              const field = isActual
                ? "actualMaterialCost"
                : "plannedMaterialCost";
              rollbackData[field] = Math.max(
                0,
                (task[field] || 0) - (oldEntry.amount || 0),
              );
            } else if (oldEntry.category === "Labor") {
              const field = isActual ? "actualLaborCost" : "plannedLaborCost";
              rollbackData[field] = Math.max(
                0,
                (task[field] || 0) - (oldEntry.amount || 0),
              );
            } else {
              const field = isActual ? "actualOtherCost" : "plannedOtherCost";
              rollbackData[field] = Math.max(
                0,
                (task[field] || 0) - (oldEntry.amount || 0),
              );
            }

            const currentActual = isActual
              ? (task.actualCost || 0) - (oldEntry.amount || 0)
              : task.actualCost || 0;
            const currentBudget = !isActual
              ? (task.budgetedCost || 0) - (oldEntry.amount || 0)
              : task.budgetedCost || 0;

            rollbackData.actualCost = Math.max(0, currentActual);
            rollbackData.budgetedCost = Math.max(0, currentBudget);

            await updateDoc(
              doc(db, `${basePath}/tasks`, oldEntry.taskId),
              rollbackData,
            );
          }
        }

        // Update the actual entry doc
        const entryData = { ...newEntry, projectId };
        await updateDoc(doc(db, path, newEntry.id), entryData);

        // Re-apply the new impact if there's a new task
        if (newEntry.taskId) {
          // We need fresh task data since we just updated the task
          // But since local state won't instantly reflect the DB we just compute delta from what we know or let the onSnapshot handle the final consistent view
          // It's safer to re-fetch or use logic. Let's just refetch or rely on existing task state with our delta.
          const taskRef = doc(
            db,
            `${basePath}/tasks`,
            newEntry.taskId,
          );
          const taskDoc = await getDoc(taskRef);
          if (taskDoc.exists()) {
            const t = taskDoc.data();
            const applyData: any = {};
            const isActual = newEntry.type === "Actual";
            if (newEntry.category === "Material") {
              const field = isActual
                ? "actualMaterialCost"
                : "plannedMaterialCost";
              applyData[field] = (t[field] || 0) + (newEntry.amount || 0);
            } else if (newEntry.category === "Labor") {
              const field = isActual ? "actualLaborCost" : "plannedLaborCost";
              applyData[field] = (t[field] || 0) + (newEntry.amount || 0);
            } else {
              const field = isActual ? "actualOtherCost" : "plannedOtherCost";
              applyData[field] = (t[field] || 0) + (newEntry.amount || 0);
            }

            applyData.actualCost = isActual
              ? (t.actualCost || 0) + (newEntry.amount || 0)
              : t.actualCost || 0;
            applyData.budgetedCost = !isActual
              ? (t.budgetedCost || 0) + (newEntry.amount || 0)
              : t.budgetedCost || 0;

            await updateDoc(taskRef, applyData);
          }
        }
      } else {
        // Adding new entry
        const entryData = {
          ...newEntry,
          projectId,
        };
        const docRef = await addDoc(collection(db, path), entryData);

        // If linked to a task, update the task's actual/planned costs
        if (newEntry.taskId) {
          const task = tasks.find((t) => t.id === newEntry.taskId);
          if (task) {
            const updateData: any = {};
            const isActual = newEntry.type === "Actual";

            if (newEntry.category === "Material") {
              const field = isActual
                ? "actualMaterialCost"
                : "plannedMaterialCost";
              updateData[field] = (task[field] || 0) + (newEntry.amount || 0);
            } else if (newEntry.category === "Labor") {
              const field = isActual ? "actualLaborCost" : "plannedLaborCost";
              updateData[field] = (task[field] || 0) + (newEntry.amount || 0);
            } else {
              const field = isActual ? "actualOtherCost" : "plannedOtherCost";
              updateData[field] = (task[field] || 0) + (newEntry.amount || 0);
            }

            // Recalculate totals
            const currentActual = isActual
              ? (task.actualCost || 0) + (newEntry.amount || 0)
              : task.actualCost || 0;
            const currentBudget = !isActual
              ? (task.budgetedCost || 0) + (newEntry.amount || 0)
              : task.budgetedCost || 0;

            updateData.actualCost = currentActual;
            updateData.budgetedCost = currentBudget;

            await updateDoc(
              doc(db, `${basePath}/tasks`, newEntry.taskId),
              updateData,
            );
          }
        }
      }

      setIsAdding(false);
      setNewEntry({
        description: "",
        amount: 0,
        type: "Actual",
        category: "Labor",
        date: new Date().toISOString().split("T")[0],
        taskId: "",
      });
      // Invalidate queries to refetch
      queryClient.invalidateQueries({ queryKey: ["projectData", projectId] });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleDeleteEntry = async (entry: CostEntry) => {
    const path = `${basePath}/costs/${entry.id}`;
    try {
      // If linked to a task, update the task's actual/planned costs
      if (entry.taskId) {
        const task = tasks.find((t) => t.id === entry.taskId);
        if (task) {
          const updateData: any = {};
          const isActual = entry.type === "Actual";

          if (entry.category === "Material") {
            const field = isActual
              ? "actualMaterialCost"
              : "plannedMaterialCost";
            updateData[field] = Math.max(
              0,
              (task[field] || 0) - (entry.amount || 0),
            );
          } else if (entry.category === "Labor") {
            const field = isActual ? "actualLaborCost" : "plannedLaborCost";
            updateData[field] = Math.max(
              0,
              (task[field] || 0) - (entry.amount || 0),
            );
          } else {
            const field = isActual ? "actualOtherCost" : "plannedOtherCost";
            updateData[field] = Math.max(
              0,
              (task[field] || 0) - (entry.amount || 0),
            );
          }

          // Recalculate totals
          const currentActual = isActual
            ? Math.max(0, (task.actualCost || 0) - (entry.amount || 0))
            : task.actualCost || 0;
          const currentBudget = !isActual
            ? Math.max(0, (task.budgetedCost || 0) - (entry.amount || 0))
            : task.budgetedCost || 0;

          updateData.actualCost = currentActual;
          updateData.budgetedCost = currentBudget;

          await updateDoc(
            doc(db, `${basePath}/tasks`, entry.taskId),
            updateData,
          );
        }
      }

      await deleteDoc(doc(db, `${basePath}/costs`, entry.id));
      setDeletingId(null);
      queryClient.invalidateQueries({ queryKey: ["projectData", projectId] });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleSaveTaskCosts = async (taskId: string) => {
    const path = `${basePath}/tasks/${taskId}`;
    try {
      // Calculate aggregate budgeted cost for consistency
      const budgetedCost =
        (editValues.plannedMaterialCost || 0) +
        (editValues.plannedLaborCost || 0) +
        (editValues.plannedOtherCost || 0);

      await updateDoc(doc(db, `${basePath}/tasks`, taskId), {
        ...editValues,
        budgetedCost,
      });
      setEditingTaskId(null);
      setEditValues({});
      queryClient.invalidateQueries({ queryKey: ["projectData", projectId] });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const getReportData = () => {
    const headers = [
      "Task Name",
      "Planned Material",
      "Actual Material",
      "Planned Labor",
      "Actual Labor",
      "Actual Equipment",
      "Planned Other",
      "Actual Other",
      "Total Planned",
      "Total Actual",
      "Variance",
    ];

    const rows = tasks.map((task) => {
      const totals = getTaskTotals(task);
      // Equipment (actuals only) is carved out of "other" so the columns still
      // sum to the totals. Planned has no equipment component.
      const actualOtherPure = totals.actualOther - totals.actualEquipment;
      return [
        task.name,
        totals.plannedMaterial,
        totals.actualMaterial,
        totals.plannedLabor,
        totals.actualLabor,
        totals.actualEquipment,
        totals.plannedOther,
        actualOtherPure,
        totals.totalPlanned,
        totals.totalActual,
        totals.totalPlanned - totals.totalActual,
      ];
    });

    return { headers, rows };
  };

  const handleExportCSV = () => {
    const { headers, rows } = getReportData();
    const dateStr = new Date().toISOString().split("T")[0];
    exportToCSV(`Project_Cost_Report_${dateStr}`, headers, rows);
  };

  const handleExportPDF = () => {
    const { headers, rows } = getReportData();
    const formattedRows = rows.map((r) => [
      r[0],
      ...r.slice(1).map((v) => `₹${Number(v).toLocaleString("en-IN")}`),
    ]);
    const dateStr = new Date().toISOString().split("T")[0];
    exportToPDF("Project Cost Management Report", `Project ID: ${projectId}`, headers, formattedRows, `Project_Cost_Report_${dateStr}`);
  };

  const startEditing = (task: Task) => {
    setEditingTaskId(task.id);
    setEditValues({
      plannedMaterialCost: task.plannedMaterialCost || 0,
      plannedLaborCost: task.plannedLaborCost || 0,
      plannedOtherCost: task.plannedOtherCost || 0,
    });
  };

  const renderReportRow = (task: Task, level: number = 0) => {
    const children = tasks
      .filter((t) => t.parentId === task.id)
      .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
    const totals = getTaskTotals(task);
    const variance = totals.totalPlanned - totals.totalActual;
    return (
      <React.Fragment key={`report-${task.id}`}>
        <tr className={task.type === "Summary" ? "font-bold bg-panel/30" : ""}>
          <td className="py-4">
            <div
              style={{ paddingLeft: `${level * 24}px` }}
              className="flex items-center gap-2"
            >
              {level > 0 && <span className="w-3 h-px bg-fossil" />}
              {task.name}
            </div>
          </td>
          <td className="py-4 text-right">
            <div className="text-xs">
              ₹
              {totals.plannedMaterial.toLocaleString("en-IN", {
                maximumFractionDigits: 0,
              })}
            </div>
            <div className="text-[10px] text-ink-muted">
              ₹
              {totals.actualMaterial.toLocaleString("en-IN", {
                maximumFractionDigits: 0,
              })}
            </div>
          </td>
          <td className="py-4 text-right">
            <div className="text-xs">
              ₹
              {totals.plannedLabor.toLocaleString("en-IN", {
                maximumFractionDigits: 0,
              })}
            </div>
            <div className="text-[10px] text-ink-muted">
              ₹
              {totals.actualLabor.toLocaleString("en-IN", {
                maximumFractionDigits: 0,
              })}
            </div>
          </td>
          <td className="py-4 text-right">
            <div className="text-xs font-semibold text-primary">
              ₹
              {totals.actualEquipment.toLocaleString("en-IN", {
                maximumFractionDigits: 0,
              })}
            </div>
          </td>
          <td className="py-4 text-right">
            <div className="text-xs">
              ₹
              {totals.plannedOther.toLocaleString("en-IN", {
                maximumFractionDigits: 0,
              })}
            </div>
            <div className="text-[10px] text-ink-muted">
              ₹
              {(totals.actualOther - totals.actualEquipment).toLocaleString("en-IN", {
                maximumFractionDigits: 0,
              })}
            </div>
          </td>
          <td className="py-4 text-right font-bold">
            ₹
            {totals.totalPlanned.toLocaleString("en-IN", {
              maximumFractionDigits: 0,
            })}
          </td>
          <td className="py-4 text-right font-bold">
            ₹
            {totals.totalActual.toLocaleString("en-IN", {
              maximumFractionDigits: 0,
            })}
          </td>
          <td
            className={`py-4 text-right font-bold ${variance < 0 ? "text-danger" : "text-success"}`}
          >
            ₹{variance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </td>
          <td className="py-4 text-right">
            <span
              className={`px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${variance < 0 ? "bg-danger/8 text-danger" : "bg-success/12 text-success"}`}
            >
              {variance < 0 ? "Over Budget" : "On Track"}
            </span>
          </td>
        </tr>
        {children.map((child) => renderReportRow(child, level + 1))}
      </React.Fragment>
    );
  };

  const renderCostRow = (task: Task, level: number = 0) => {
    const children = tasks
      .filter((t) => t.parentId === task.id)
      .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
    const isExpanded = expanded[task.id];
    const totals = getTaskTotals(task);
    const isEditing = editingTaskId === task.id;

    return (
      <React.Fragment key={task.id}>
        <tr
          className={`border-b hover:bg-panel transition-colors ${task.type === "Summary" ? "bg-panel/50" : ""}`}
        >
          <td
            className="p-2 md:p-3"
            style={{ paddingLeft: level * (windowWidth < 768 ? 12 : 32) + 16 }}
          >
            <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
              <div
                className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full shrink-0 ${
                  task.type === "Summary" ? "bg-surface-dark" : "bg-primary"
                }`}
              />
              {children.length > 0 && (
                <button
                  onClick={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [task.id]: !prev[task.id],
                    }))
                  }
                  className="shrink-0"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 md:w-4 md:h-4" />
                  ) : (
                    <ChevronRight className="w-3 h-3 md:w-4 md:h-4" />
                  )}
                </button>
              )}
              <span
                className={`truncate text-[10px] md:text-sm ${task.type === "Summary" ? "font-black text-ink" : "font-medium"}`}
              >
                {task.name}
              </span>
            </div>
          </td>

          {/* Material */}
          <td className="p-3 text-right hidden sm:table-cell">
            {isEditing ? (
              <input
                type="number"
                className="w-20 border rounded px-1 text-right bg-surface text-ink"
                value={editValues.plannedMaterialCost}
                onChange={(e) =>
                  setEditValues({
                    ...editValues,
                    plannedMaterialCost: Number(e.target.value),
                  })
                }
              />
            ) : (
              <div className="text-[10px] font-medium text-ink-muted">
                ₹
                {totals.plannedMaterial.toLocaleString("en-IN", {
                  maximumFractionDigits: 0,
                })}
              </div>
            )}
          </td>
          <td className="p-3 text-right hidden sm:table-cell bg-panel/30">
            <div className="flex flex-col items-end">
              <div className="text-[10px] font-black text-rust-strong">
                ₹
                {totals.actualMaterial.toLocaleString("en-IN", {
                  maximumFractionDigits: 0,
                })}
              </div>
              {totals.actualMaterial > 0 && (
                <button
                  onClick={() =>
                    setShowMaterialBreakdown(
                      showMaterialBreakdown === task.id ? null : task.id,
                    )
                  }
                  className={`flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest mt-1 p-1 rounded hover:bg-divider apple-transition ${showMaterialBreakdown === task.id ? "text-ink bg-panel" : "text-ink-muted"}`}
                >
                  <Info className="w-2.5 h-2.5" /> Details
                </button>
              )}
            </div>
          </td>

          {/* Labor */}
          <td className="p-3 text-right hidden md:table-cell">
            {isEditing ? (
              <input
                type="number"
                className="w-20 border rounded px-1 text-right bg-surface text-ink"
                value={editValues.plannedLaborCost}
                onChange={(e) =>
                  setEditValues({
                    ...editValues,
                    plannedLaborCost: Number(e.target.value),
                  })
                }
              />
            ) : (
              <div className="text-[10px] font-medium text-ink-muted">
                ₹
                {totals.plannedLabor.toLocaleString("en-IN", {
                  maximumFractionDigits: 0,
                })}
              </div>
            )}
          </td>
          <td className="p-3 text-right hidden md:table-cell bg-panel/30">
            <div className="flex flex-col items-end">
              <div className="text-[10px] font-black text-rust-strong">
                ₹
                {totals.actualLabor.toLocaleString("en-IN", {
                  maximumFractionDigits: 0,
                })}
              </div>
              {totals.actualLabor > 0 && (
                <button
                  onClick={() =>
                    setShowLaborBreakdown(
                      showLaborBreakdown === task.id ? null : task.id,
                    )
                  }
                  className={`flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest mt-1 p-1 rounded hover:bg-[#F7E4DB] apple-transition ${showLaborBreakdown === task.id ? "text-rust-strong bg-[#F7E4DB]" : "text-ink-muted"}`}
                >
                  <Info className="w-2.5 h-2.5" /> Details
                </button>
              )}
            </div>
          </td>

          {/* Other */}
          <td className="p-3 text-right hidden xl:table-cell">
            {isEditing ? (
              <input
                type="number"
                className="w-20 border rounded px-1 text-right bg-surface text-ink"
                value={editValues.plannedOtherCost}
                onChange={(e) =>
                  setEditValues({
                    ...editValues,
                    plannedOtherCost: Number(e.target.value),
                  })
                }
              />
            ) : (
              <div className="text-[10px] font-medium text-ink-muted">
                ₹
                {totals.plannedOther.toLocaleString("en-IN", {
                  maximumFractionDigits: 0,
                })}
              </div>
            )}
          </td>
          <td className="p-3 text-right hidden xl:table-cell bg-panel/30">
            <div className="text-[10px] font-black text-rust-strong">
              ₹
              {totals.actualOther.toLocaleString("en-IN", {
                maximumFractionDigits: 0,
              })}
            </div>
          </td>

          {/* Totals */}
          <td className="p-3 text-right font-medium text-ink-muted border-l">
            ₹
            {totals.totalPlanned.toLocaleString("en-IN", {
              maximumFractionDigits: 0,
            })}
          </td>
          <td className="p-3 text-right font-black text-primary bg-[#F7E4DB]/30">
            ₹
            {totals.totalActual.toLocaleString("en-IN", {
              maximumFractionDigits: 0,
            })}
          </td>

          <td className="p-3 text-center">
            {totals.totalPlanned - totals.totalActual < 0 ? (
              <span className="px-1.5 py-0.5 bg-danger/15 text-danger rounded-full text-[8px] font-black uppercase tracking-widest">
                Over
              </span>
            ) : (
              <span className="px-1.5 py-0.5 bg-success/20 text-success rounded-full text-[8px] font-black uppercase tracking-widest">
                Track
              </span>
            )}
          </td>

          <td className="p-3 text-right">
            {isEditing ? (
              <div className="flex gap-1 justify-end">
                <button
                  onClick={() => handleSaveTaskCosts(task.id)}
                  className="p-1 bg-success/20 text-success rounded hover:bg-[#A7F3D0]"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setEditingTaskId(null)}
                  className="p-1 bg-danger/15 text-danger rounded hover:bg-danger"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : task.isSystemGenerated ? null : (
              <button
                onClick={() => startEditing(task)}
                className="p-1 text-ink-muted hover:text-rust-strong hover:bg-[#F7E4DB] rounded transition-all"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
          </td>
        </tr>
        {isExpanded &&
          !filterTag &&
          !searchTerm &&
          children.map((child) => renderCostRow(child, level + 1))}

        {showLaborBreakdown === task.id && (
          <tr className="bg-[#F7E4DB]/30">
            <td colSpan={11} className="p-2 md:p-6 border-b border-[#F7E4DB]">
              <div className="bg-surface rounded-2xl border border-[#F7E4DB] shadow-sm overflow-hidden">
                <div className="bg-primary px-4 py-2 flex justify-between items-center">
                  <span className="text-[10px] md:text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                    Labor Deployment Breakdown

                  </span>
                  <button onClick={() => setShowLaborBreakdown(null)}>
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
                <div className="overflow-x-auto scroller-hide">
                  <table className="w-full text-[10px] md:text-[10px] min-w-[600px]">
                    <thead>
                      <tr className="bg-[#F7E4DB] text-[#B85F3B] font-bold uppercase tracking-wider">
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-left">Contractor</th>
                        <th className="p-2 text-left">Role</th>
                        <th className="p-2 text-right">Headcount</th>
                        <th className="p-2 text-right">Shifts</th>
                        <th className="p-2 text-right">Rate</th>
                        <th className="p-2 text-right">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* 1. Cost Entries (Labor) */}
                      {entries
                        .filter((e) => (e.taskId === task.id || (!e.taskId && task.isSystemGenerated && task.name === "Project Overhead")) && e.category === "Labor" && e.type === "Actual" && !e.isAccrual)
                        .map((entry, idx) => (
                          <tr key={`ce-${entry.id}`} className="border-t border-[#F7E4DB] hover:bg-[#F7E4DB]/50">
                            <td className="p-2 font-medium">{new Date(entry.date).toLocaleDateString()}</td>
                            <td className="p-2 text-ink-muted font-bold">Direct Entry</td>
                            <td className="p-2 italic">{entry.description || "-"}</td>
                            <td className="p-2 text-right">-</td>
                            <td className="p-2 text-right">-</td>
                            <td className="p-2 text-right">-</td>
                            <td className="p-2 text-right font-black text-rust-strong">
                              ₹{entry.amount?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                            </td>
                          </tr>
                        ))}
                        
                      {/* 2. RA Bills (Labor Logs) */}
                      {laborLogs
                        .filter((log) => log.items.some((item) => item.taskId === task.id))
                        .flatMap((log) =>
                          log.items
                            .filter((item) => item.taskId === task.id)
                            .map((item, idx) => (
                              <tr key={`ll-${log.id}-${idx}`} className="border-t border-[#F7E4DB] hover:bg-[#F7E4DB]/50">
                                <td className="p-2 font-medium">{log.date}</td>
                                <td className="p-2 text-ink-muted font-bold">{log.vendorName || "General"} (RA Bill)</td>
                                <td className="p-2 italic">{item.role}</td>
                                <td className="p-2 text-right">{item.headcount}</td>
                                <td className="p-2 text-right">{item.shifts}</td>
                                <td className="p-2 text-right">₹{item.rate.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                                <td className="p-2 text-right font-black text-rust-strong">
                                  ₹{item.cost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                </td>
                              </tr>
                            )),
                        )}
                        
                      {/* 3. Daily Logs (Labour) */}
                      {dailyLogs
                        .filter((log: any) => log.taskId === task.id && log.labour && log.labour.length > 0)
                        .flatMap((log: any) =>
                          log.labour.map((l: any, idx: number) => {
                            const rateCard = rateCards.find((r: any) => r.id === l.roleId);
                            const rate = rateCard ? rateCard.rate : 0;
                            const subtotal = (l.headcount || 0) * rate;
                            let displayDate = "";
                            if (log.workDate) {
                              if (typeof log.workDate === "string") displayDate = log.workDate;
                              else if (log.workDate.seconds) displayDate = new Date(log.workDate.seconds * 1000).toISOString().split("T")[0];
                            }
                            return (
                              <tr key={`dl-${log.id}-${idx}`} className="border-t border-[#F7E4DB] hover:bg-[#F7E4DB]/50">
                                <td className="p-2 font-medium">{displayDate}</td>
                                <td className="p-2 text-ink-muted font-bold">Daily Log</td>
                                <td className="p-2 italic">{rateCard?.role || "-"}</td>
                                <td className="p-2 text-right">{l.headcount}</td>
                                <td className="p-2 text-right">-</td>
                                <td className="p-2 text-right">₹{rate.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                                <td className="p-2 text-right font-black text-rust-strong">
                                  ₹{subtotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                </td>
                              </tr>
                            );
                          })
                        )}
                    </tbody>
                  </table>
                </div>
              </div>
            </td>
          </tr>
        )}

        {showMaterialBreakdown === task.id && (
          <tr className="bg-panel">
            <td colSpan={11} className="p-2 md:p-6 border-b border-divider">
              <div className="bg-surface rounded-2xl border border-divider shadow-sm overflow-hidden">
                <div className="bg-[#3A4F5F] px-4 py-2 flex justify-between items-center">
                  <span className="text-[10px] md:text-[10px] font-black text-white uppercase tracking-widest">
                    Material Consumption Breakdown
                  </span>
                  <button onClick={() => setShowMaterialBreakdown(null)}>
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
                <div className="overflow-x-auto scroller-hide">
                  <table className="w-full text-[10px] md:text-[10px] min-w-[500px]">
                    <thead>
                      <tr className="bg-panel text-ink font-bold uppercase tracking-wider">
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-left">Material Name</th>
                        <th className="p-2 text-right">Quantity</th>
                        <th className="p-2 text-right">Unit Rate</th>
                        <th className="p-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* 1. Direct Cost Entries */}
                      {entries
                        .filter((e) => (e.taskId === task.id || (!e.taskId && task.isSystemGenerated && task.name === "Project Overhead")) && e.category === "Material" && e.type === "Actual" && !e.isAccrual)
                        .map((entry, idx) => (
                          <tr key={`ce-${entry.id}`} className="border-t border-divider hover:bg-panel">
                            <td className="p-2 font-medium">{new Date(entry.date).toLocaleDateString()}</td>
                            <td className="p-2 font-bold text-ink/80">Direct Cost: {entry.description}</td>
                            <td className="p-2 text-right">-</td>
                            <td className="p-2 text-right">-</td>
                            <td className="p-2 text-right font-black text-ink">
                              ₹{entry.amount?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                            </td>
                          </tr>
                        ))}

                      {/* 2. Material Issues */}
                      {materialIssues
                        .filter((iss: any) => iss.taskId === task.id && !iss.remarks?.startsWith("Daily Progress") && !iss.notes?.startsWith("Daily Progress"))
                        .flatMap((iss: any) => {
                          if (iss.items && Array.isArray(iss.items)) {
                            return iss.items.map((m: any, idx: number) => {
                              let displayDate = iss.issueDate || iss.date;
                              if (iss.createdAt && !displayDate) {
                                displayDate = new Date(iss.createdAt).toISOString().split('T')[0];
                              }
                              return (
                                <tr key={`mi-${iss.id}-${idx}`} className="border-t border-divider hover:bg-panel">
                                  <td className="p-2 font-medium">{displayDate}</td>
                                  <td className="p-2 font-bold text-ink/80">Issue: {m.name || m.materialName}</td>
                                  <td className="p-2 text-right">{m.quantity}</td>
                                  <td className="p-2 text-right">₹{(m.unitPrice || m.unitCost || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                                  <td className="p-2 text-right font-black text-ink">
                                    ₹{(m.totalPrice || (m.quantity * (m.unitPrice || m.unitCost || 0))).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                  </td>
                                </tr>
                              );
                            });
                          } else if (iss.materialId) {
                            // Support legacy flat issues
                            const invItem = inventory.find((i) => i.id === iss.materialId);
                            const unitCost = invItem ? (invItem.avgUnitCost || invItem.unitCost || 0) : 0;
                            const totalPrice = (iss.quantity || 0) * unitCost;
                            let displayDate = iss.date || "";
                            if (iss.createdAt && !displayDate) {
                              displayDate = new Date(iss.createdAt).toISOString().split('T')[0];
                            }
                            return [
                              <tr key={`mi-${iss.id}`} className="border-t border-divider hover:bg-panel">
                                <td className="p-2 font-medium">{displayDate}</td>
                                <td className="p-2 font-bold text-ink/80">Issue: {invItem?.name || "Material"}</td>
                                <td className="p-2 text-right">{iss.quantity}</td>
                                <td className="p-2 text-right">₹{unitCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                                <td className="p-2 text-right font-black text-ink">
                                  ₹{totalPrice.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                </td>
                              </tr>
                            ];
                          }
                          return [];
                        })}

                      {/* 3. Daily Logs (Materials) */}
                      {dailyLogs
                        .filter(
                          (log: any) =>
                            log.taskId === task.id &&
                            log.materials &&
                            log.materials.length > 0,
                        )
                        .flatMap((log: any) =>
                          log.materials.map((m: any, idx: number) => {
                            const invItem = inventory.find(
                              (i) => i.id === m.materialId,
                            );
                            const unitCost = invItem
                              ? (invItem.avgUnitCost || invItem.unitCost || 0)
                              : 0;
                            const subtotal = m.quantity * unitCost;
                            // Safely handle timestamp or string
                            let displayDate = "";
                            if (log.workDate) {
                              if (typeof log.workDate === "string")
                                displayDate = log.workDate;
                              else if (log.workDate.seconds)
                                displayDate = new Date(
                                  log.workDate.seconds * 1000,
                                )
                                  .toISOString()
                                  .split("T")[0];
                            }
                            return (
                              <tr
                                key={`${log.id}-${idx}`}
                                className="border-t border-divider hover:bg-panel"
                              >
                                <td className="p-2 font-medium">
                                  {displayDate}
                                </td>
                                <td className="p-2 font-bold text-ink/80">
                                  Daily Log: {m.name}
                                </td>
                                <td className="p-2 text-right">{m.quantity}</td>
                                <td className="p-2 text-right">
                                  ₹
                                  {unitCost.toLocaleString("en-IN", {
                                    maximumFractionDigits: 0,
                                  })}
                                </td>
                                <td className="p-2 text-right font-black text-ink">
                                  ₹
                                  {subtotal.toLocaleString("en-IN", {
                                    maximumFractionDigits: 0,
                                  })}
                                </td>
                              </tr>
                            );
                          }),
                        )}
                    </tbody>
                  </table>
                </div>
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-10 pb-32">
      <div className="soft-card p-5 md:p-6 rounded-2xl flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8">
        <div className="flex gap-2 bg-surface/30 p-1 rounded-xl w-full md:w-fit max-w-full overflow-x-auto scrollbar-hide ring-1 ring-white/20 shadow-inner">
          {(
            ["dashboard", "wbs", "direct_costs", "report", "payments"] as const
          ).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex-1 md:flex-none px-4 md:px-8 py-2 rounded-lg md:rounded-xl text-[10px] md:text-[10px] font-black uppercase tracking-wider md:tracking-[0.2em] apple-transition whitespace-nowrap ${viewMode === mode ? "bg-primary text-white shadow-lg" : "text-ink-muted hover:text-ink"}`}
            >
              {mode === "dashboard"
                ? "Overview"
                : mode === "wbs"
                  ? "Task Costs"
                  : mode === "direct_costs"
                    ? "Direct Costs"
                    : mode === "report"
                      ? "Full Report"
                      : "Payments"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={handleExportCSV}
            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-surface/30 text-ink-muted px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] hover:bg-surface/50 hover:text-ink shadow-sm apple-transition border border-divider/40"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            onClick={handleExportPDF}
            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-surface/30 text-ink-muted px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] hover:bg-surface/50 hover:text-ink shadow-sm apple-transition border border-divider/40"
          >
            <Download className="w-3.5 h-3.5 text-[#C0653F]" /> PDF
          </button>
          <button
            onClick={() => {
              setNewEntry({
                description: "",
                amount: 0,
                type: "Actual",
                category: "Labor",
                date: new Date().toISOString().split("T")[0],
                taskId: "",
              });
              setIsAdding(true);
            }}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-primary text-white px-8 py-3.5 md:py-2.5 rounded-xl text-[10px] sm:text-xs md:text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary/80 apple-transition shadow-xl shadow-primary/20"
          >
            <Plus className="w-4 h-4" /> <span>Add Transaction</span>
          </button>
        </div>
      </div>

      {viewMode === "dashboard" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {[
              {
                title: "Total Cost",
                planned: stats.totalBudgeted,
                actual: stats.totalActual,
                icon: IndianRupee,
              },
              {
                title: "Labor Cost",
                planned: stats.laborPlanned,
                actual: stats.laborActual,
                icon: PieChart,
              },
              {
                title: "Material Cost",
                planned: stats.materialPlanned,
                actual: stats.materialActual,
                icon: Layers,
              },
              {
                title: "Equipment Cost",
                planned: stats.equipmentPlanned,
                actual: stats.equipmentActual,
                icon: Truck,
              },
            ].map((stat, idx) => {
              // Equipment is tracked actuals-only (no planned budget), so its
              // card skips the planned/variance treatment.
              const actualOnly = stat.title === "Equipment Cost";
              const variance = stat.planned - stat.actual;
              const isOver = !actualOnly && variance < 0;
              const percentage =
                stat.planned > 0 ? (stat.actual / stat.planned) * 100 : 0;

              return (
                <div
                  key={idx}
                  className="bg-surface border border-divider p-6 rounded-3xl shadow-sm hover:shadow-md apple-transition"
                >
                  <div className="flex justify-between items-center mb-6">
                    <h4 className="text-[15px] font-bold text-ink flex items-center gap-2">
                      <stat.icon className="w-5 h-5 text-ink-muted" />
                      {stat.title}
                      {stat.title === "Labor Cost" && (
                        <span
                          className="text-[8px] md:text-[10px] text-[#C0653F] bg-[#C0653F]/10 border border-[#C0653F]/20 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-widest whitespace-nowrap"
                          title="Legacy source — pending labour-cost trigger"
                        >
                          (legacy source)
                        </span>
                      )}
                    </h4>
                    {actualOnly ? (
                      <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-ice text-[#56778E] border border-divider">
                        Actuals
                      </span>
                    ) : (
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          isOver
                            ? "bg-danger/8 text-danger border border-danger/30"
                            : "bg-success/12 text-success border border-success/40"
                        }`}
                      >
                        {isOver ? "Over Budget" : "On Track"}
                      </span>
                    )}
                  </div>

                  <div className="space-y-4">
                    {actualOnly ? (
                      <div>
                        <div className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1">
                          Actual
                        </div>
                        <div className="text-2xl font-bold text-primary tracking-tight">
                          ₹
                          {stat.actual.toLocaleString("en-IN", {
                            maximumFractionDigits: 0,
                          })}
                        </div>
                        <div className="text-[10px] text-ink-muted font-medium mt-1">
                          From logged equipment usage
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between items-end">
                          <div>
                            <div className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1">
                              Planned
                            </div>
                            <div className="text-xl font-bold text-ink tracking-tight">
                              ₹
                              {stat.planned.toLocaleString("en-IN", {
                                maximumFractionDigits: 0,
                              })}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1">
                              Actual
                            </div>
                            <div className="text-xl font-bold text-primary tracking-tight">
                              ₹
                              {stat.actual.toLocaleString("en-IN", {
                                maximumFractionDigits: 0,
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-2 w-full bg-panel rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${
                              isOver
                                ? "bg-danger"
                                : percentage > 80
                                  ? "bg-[#E1946F]"
                                  : "bg-success"
                            }`}
                            style={{
                              width: `${Math.min(100, Math.max(0, percentage))}%`,
                            }}
                          />
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-white/10">
                          <div className="text-xs font-medium text-ink-muted">
                            Variance
                          </div>
                          <div
                            className={`text-sm font-bold ${
                              isOver ? "text-danger" : "text-success"
                            }`}
                          >
                            {isOver ? "-" : "+"}₹
                            {Math.abs(variance).toLocaleString("en-IN", {
                              maximumFractionDigits: 0,
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-12 xl:col-span-8 soft-card p-5 md:p-6 squircle-24">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 md:mb-10">
                <div>
                  <h3 className="text-xl md:text-[24px] font-semibold text-ink tracking-tight mb-1">
                    Cost by Category
                  </h3>
                  <p className="text-xs md:text-[15px] text-ink-muted font-medium uppercase tracking-[0.05em]">
                    Planned vs Actual spending
                  </p>
                </div>
                <div className="flex gap-4 md:gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-2 md:w-3 h-2 md:h-3 rounded-full bg-success" />
                    <span className="text-[10px] md:text-[13px] font-medium text-ink-muted">
                      Planned
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 md:w-3 h-2 md:h-3 rounded-full bg-primary" />
                    <span className="text-[10px] md:text-[13px] font-medium text-ink-muted">
                      Actual
                    </span>
                  </div>
                </div>
              </div>
              <div className="h-[300px] md:h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.chartData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="rgba(0,0,0,0.05)"
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#6E8CA0", fontWeight: 600, fontSize: 13 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#6E8CA0", fontWeight: 600, fontSize: 13 }}
                      tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(0,0,0,0.02)" }}
                      contentStyle={{
                        borderRadius: "24px",
                        border: "1px solid var(--divider)",
                        backdropFilter: "blur(10px)",
                        backgroundColor: "var(--surface)",
                        opacity: 0.9,
                        boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
                        padding: "20px",
                      }}
                      itemStyle={{
                        fontWeight: 700,
                        fontSize: "13px",
                        color: "var(--ink)",
                      }}
                      formatter={(value: number) => [
                        `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
                        "",
                      ]}
                    />
                    <Bar
                      dataKey="Budget"
                      fill="#059669"
                      radius={[8, 8, 0, 0]}
                      barSize={40}
                    />
                    <Bar
                      dataKey="Actual"
                      fill="#D97D54"
                      radius={[8, 8, 0, 0]}
                      barSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-12 xl:col-span-4 bg-surface-dark p-5 md:p-6 squircle-24 shadow-2xl relative overflow-hidden flex flex-col">
              <h3 className="text-[17px] font-bold text-white tracking-tight mb-8 flex items-center gap-3 relative z-10">
                <div className="bg-onyx/40 p-2 rounded-xl">
                  <Calendar className="w-5 h-5 text-primary" />
                </div>
                Latest Transactions
              </h3>

              <div className="flex-1 space-y-4 relative z-10 overflow-y-auto pr-2 scrollbar-hide">
                {entries
                  .sort(
                    (a, b) =>
                      new Date(b.date).getTime() - new Date(a.date).getTime(),
                  )
                  .slice(0, 15)
                  .map((entry) => (
                    <div
                      key={entry.id}
                      className="bg-onyx/40 border border-white/10 p-5 rounded-3xl group hover:bg-white/10 apple-transition flex justify-between items-center"
                    >
                      <div>
                        <div className="font-bold text-white text-[15px] tracking-tight mb-1">
                          {entry.description}
                        </div>
                        <div className="text-[12px] text-white/30 font-medium">
                          {entry.category} • {entry.date}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`text-[15px] font-bold font-mono tracking-tighter ${entry.type === "Actual" ? "text-primary" : "text-success"}`}
                        >
                          ₹
                          {entry.amount.toLocaleString("en-IN", {
                            maximumFractionDigits: 0,
                          })}
                        </div>
                        <div className="text-[10px] font-medium text-white/20 uppercase tracking-widest mt-1">
                          {entry.type}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              <div className="pt-8 mt-4 border-t border-white/5 relative z-10 flex justify-between items-end">
                <div>
                  <p className="text-[13px] font-medium text-white/30 mb-1">
                    Recent Flow
                  </p>
                  <p className="text-2xl font-bold text-white tracking-tighter">
                    ₹
                    {entries
                      .slice(0, 15)
                      .reduce((sum, e) => sum + e.amount, 0)
                      .toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <button className="text-[13px] font-bold text-primary hover:text-white apple-transition">
                  View All
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {viewMode === "wbs" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-surface p-3 md:p-4 rounded-xl border shadow-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
              <input
                type="text"
                placeholder="Search WBS tasks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-panel border rounded-lg text-xs md:text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-2 bg-panel px-3 py-2 rounded-lg border">
              <ListTree className="w-3.5 h-3.5 md:w-4 md:h-4 text-ink-muted" />
              <select
                className="bg-transparent text-[10px] md:text-xs font-bold outline-none flex-1"
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
              >
                <option value="">All Activity Codes</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Legend for clarity */}
          <div className="flex gap-6 px-4 py-2 bg-panel/50 rounded-lg border border-dashed border-divider">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm border bg-surface" />
              <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider">
                Planned (Budget)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-primary" />
              <span className="text-[10px] font-bold text-rust-strong uppercase tracking-wider">
                Actual (Spent)
              </span>
            </div>
            <div className="text-[10px] text-ink-muted italic ml-auto">
              * Click the pencil icon to set budgets; add transactions for
              actuals.
            </div>
          </div>

          <div className="bg-surface rounded-xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs md:text-sm border-collapse">
                <thead>
                  <tr className="bg-surface-dark text-white text-[10px] md:text-[10px] font-bold uppercase tracking-widest">
                    <th className="p-2 md:p-3 text-left min-w-[120px] md:min-w-[250px]">
                      WBS Task Hierarchy
                    </th>
                    <th
                      className="p-3 text-center border-l border-white/10 hidden md:table-cell"
                      colSpan={2}
                    >
                      Material Costs
                    </th>
                    <th
                      className="p-3 text-center border-l border-white/10 hidden md:table-cell"
                      colSpan={2}
                    >
                      Labor Costs{" "}
                      <span
                        className="text-[8px] text-[#C0653F] uppercase tracking-tighter"
                        title="Legacy source — pending labour-cost trigger"
                      >
                        (legacy source)
                      </span>
                    </th>
                    <th
                      className="p-3 text-center border-l border-white/10 hidden xl:table-cell"
                      colSpan={2}
                    >
                      Direct Costs
                    </th>
                    <th className="p-3 text-right border-l border-white/10">
                      Planned Total
                    </th>
                    <th className="p-3 text-right">Actual Spent</th>
                    <th className="p-3 text-center hidden sm:table-cell">
                      Status
                    </th>
                    <th className="p-3 w-12 md:w-20"></th>
                  </tr>
                  <tr className="bg-[#3A4F5F] text-white/50 text-[8px] font-black uppercase tracking-[0.2em] border-t border-white/5">
                    <th className="p-1 px-3 text-left">Items</th>
                    <th className="p-1 text-center hidden md:table-cell border-l border-white/5">
                      Budget
                    </th>
                    <th className="p-1 text-center hidden md:table-cell">
                      Spent
                    </th>
                    <th className="p-1 text-center hidden md:table-cell border-l border-white/5">
                      Budget
                    </th>
                    <th className="p-1 text-center hidden md:table-cell">
                      Spent
                    </th>
                    <th className="p-1 text-center hidden xl:table-cell border-l border-white/5">
                      Budget
                    </th>
                    <th className="p-1 text-center hidden xl:table-cell">
                      Spent
                    </th>
                    <th
                      className="p-1 text-right border-l border-white/5"
                      colSpan={4}
                    >
                      Summaries
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(groupedTasks).map(([phase, locations]) => (
                    <React.Fragment key={phase}>
                      <tr className="bg-panel/30">
                        <td
                          colSpan={11}
                          className="p-4 px-6 border-y border-divider"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary text-white rounded-lg shadow-sm">
                              <Layers className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-rust-strong block leading-none mb-1">
                                Project Phase
                              </span>
                              <span className="text-sm font-black text-ink leading-none">
                                {phase}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                      {Object.entries(locations).map(([location, locTasks]) => (
                        <React.Fragment key={`${phase}-${location}`}>
                          <tr className="bg-panel/50">
                            <td
                              colSpan={11}
                              className="p-2 px-10 border-b border-divider"
                            >
                              <div className="flex items-center gap-2">
                                <div className="p-1 bg-success/20 text-success rounded">
                                  <MapPin className="w-3 h-3" />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
                                  Location:{" "}
                                  <span className="text-ink">{location}</span>
                                </span>
                              </div>
                            </td>
                          </tr>
                          {locTasks.map((task) => renderCostRow(task, 0))}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {tasks.length === 0 && (
              <div className="p-20 text-center text-ink-muted italic">
                No tasks found. Add tasks in the WBS view to manage costs here.
              </div>
            )}
          </div>
        </div>
      )}

      {viewMode === "direct_costs" && (
        <div className="bg-surface rounded-2xl border shadow-sm overflow-hidden">
          <div className="p-6 border-b bg-panel/30 flex justify-between items-center">
            <h3 className="text-lg font-bold text-ink">Direct Cost Entries</h3>
            <button
              onClick={() => {
                setNewEntry({
                  description: "",
                  amount: 0,
                  type: "Actual",
                  category: "Material",
                  date: new Date().toISOString().split("T")[0],
                  taskId: "",
                });
                setIsAdding(true);
              }}
              className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Direct Cost
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-panel border-b text-[10px] font-black uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="p-4 rounded-tl-xl">Date</th>
                  <th className="p-4">Description</th>
                  <th className="p-4">Category (Head)</th>
                  <th className="p-4">Type</th>
                  <th className="p-4 text-right">Amount (₹)</th>
                  <th className="p-4 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {(() => { const directCosts = entries.filter(e => !e.taskId && !e.isAccrual); return directCosts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-5 text-center text-ink-muted italic"
                    >
                      No direct costs recorded yet.
                    </td>
                  </tr>
                ) : (
                  directCosts
                    .sort(
                      (a, b) =>
                        new Date(b.date).getTime() - new Date(a.date).getTime(),
                    )
                    .map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b last:border-0 hover:bg-panel/50 transition-colors"
                      >
                        <td className="p-4 font-medium">
                          {new Date(entry.date).toLocaleDateString()}
                        </td>
                        <td className="p-4">{entry.description || "-"}</td>
                        <td className="p-4">
                          <span className="bg-surface border px-2 py-1 rounded text-xs font-medium">
                            {entry.category}
                          </span>
                        </td>
                        <td className="p-4">
                          <span
                            className={`px-2 py-1 rounded text-[10px] font-bold ${entry.type === "Actual" ? "bg-success/20 text-success" : "bg-[#E2E8ED] text-[#56778E]"}`}
                          >
                            {entry.type}
                          </span>
                        </td>
                        <td className="p-4 text-right font-bold text-ink">
                          {entry.amount?.toLocaleString("en-IN", {
                            maximumFractionDigits: 0,
                          })}
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => {
                                setNewEntry(entry);
                                setIsAdding(true);
                              }}
                              className="p-1 text-ink-muted hover:text-primary hover:bg-primary/10 rounded transition-colors"
                              title="Edit record"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeletingId(entry.id)}
                              className="p-1 text-ink-muted hover:text-danger hover:bg-danger/8 rounded transition-colors"
                              title="Delete record"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                ); })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === "report" && (
        <div className="bg-surface p-10 rounded-xl border shadow-sm print:shadow-none print:border-none">
          <div className="flex justify-between items-start mb-10 border-b pb-8">
            <div>
              <h1 className="text-3xl font-black text-ink mb-2">
                {t("views.costAnalysisReport")}
              </h1>
              <p className="text-ink-muted">
                Generated on {new Date().toLocaleDateString()} • Detailed WBS
                Breakdown
              </p>
            </div>
            <div className="text-right">
              <div className="font-brand text-sm font-bold text-rust-strong uppercase tracking-widest">
                Sitetru
              </div>
              <div className="text-[10px] opacity-50">
                Enterprise Construction Management
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
            <div className="bg-panel p-4 md:p-6 rounded-2xl border">
              <div className="text-[10px] font-bold uppercase opacity-50 mb-2">
                Material
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-xl md:text-2xl font-bold">
                    ₹
                    {stats.materialActual.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                  </div>
                  <div className="text-[10px] opacity-50">Actual</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-success">
                    ₹
                    {stats.materialPlanned.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                  </div>
                  <div className="text-[10px] opacity-50">Planned</div>
                </div>
              </div>
            </div>
            <div className="bg-panel p-4 md:p-6 rounded-2xl border">
              <div className="text-[10px] font-bold uppercase opacity-50 mb-2 flex justify-between items-center">
                Labor{" "}
                <span
                  className="text-[8px] text-[#C0653F] normal-case bg-[#C0653F]/10 border border-[#C0653F]/20 px-1 py-0.5 rounded ml-2"
                  title="Legacy source — pending labour-cost trigger"
                >
                  (legacy source)
                </span>
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-xl md:text-2xl font-bold">
                    ₹
                    {stats.laborActual.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                  </div>
                  <div className="text-[10px] opacity-50">Actual</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-success">
                    ₹
                    {stats.laborPlanned.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                  </div>
                  <div className="text-[10px] opacity-50">Planned</div>
                </div>
              </div>
            </div>
            <div className="bg-panel p-4 md:p-6 rounded-2xl border">
              <div className="text-[10px] font-bold uppercase opacity-50 mb-2">
                Equipment
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-xl md:text-2xl font-bold">
                    ₹
                    {stats.equipmentActual.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                  </div>
                  <div className="text-[10px] opacity-50">Actual</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] opacity-50">Actuals only</div>
                </div>
              </div>
            </div>
            <div className="bg-panel p-4 md:p-6 rounded-2xl border">
              <div className="text-[10px] font-bold uppercase opacity-50 mb-2">
                Direct Cost
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-xl md:text-2xl font-bold">
                    ₹
                    {(stats.otherActual - stats.equipmentActual).toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                  </div>
                  <div className="text-[10px] opacity-50">Actual</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-success">
                    ₹
                    {stats.otherPlanned.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                  </div>
                  <div className="text-[10px] opacity-50">Planned</div>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto w-full">
            <table className="w-full text-sm mb-12 min-w-[700px]">
              <thead>
                <tr className="border-b-2 border-surface-dark">
                  <th className="text-left py-4 font-black uppercase tracking-widest text-[10px]">
                    Task Description
                  </th>
                  <th className="text-right py-4 font-black uppercase tracking-widest text-[10px]">
                    Material (P/A)
                  </th>
                  <th className="text-right py-4 font-black uppercase tracking-widest text-[10px]">
                    Labor (P/A){" "}
                    <span
                      className="text-[8px] text-[#C0653F] block normal-case"
                      title="Legacy source — pending labour-cost trigger"
                    >
                      (legacy source)
                    </span>
                  </th>
                  <th className="text-right py-4 font-black uppercase tracking-widest text-[10px]">
                    Equipment (Actual)
                  </th>
                  <th className="text-right py-4 font-black uppercase tracking-widest text-[10px]">
                    Direct Cost (P/A)
                  </th>
                  <th className="text-right py-4 font-black uppercase tracking-widest text-[10px]">
                    Planned Total
                  </th>
                  <th className="text-right py-4 font-black uppercase tracking-widest text-[10px]">
                    Actual Total
                  </th>
                  <th className="text-right py-4 font-black uppercase tracking-widest text-[10px]">
                    Variance
                  </th>
                  <th className="text-right py-4 font-black uppercase tracking-widest text-[10px]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {Object.entries(groupedTasks).map(([phase, locations]) => (
                  <React.Fragment key={phase}>
                    <tr className="bg-panel/30">
                      <td
                        colSpan={9}
                        className="p-4 px-6 border-y border-divider"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary text-white rounded-lg shadow-sm">
                            <Layers className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-rust-strong block leading-none mb-1">
                              Project Phase
                            </span>
                            <span className="text-sm font-black text-ink leading-none">
                              {phase}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                    {Object.entries(locations).map(([location, locTasks]) => (
                      <React.Fragment key={`${phase}-${location}`}>
                        <tr className="bg-panel/50">
                          <td
                            colSpan={9}
                            className="p-2 px-10 border-b border-divider"
                          >
                            <div className="flex items-center gap-2">
                              <div className="p-1 bg-success/20 text-success rounded">
                                <MapPin className="w-3 h-3" />
                              </div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
                                Location:{" "}
                                <span className="text-ink">{location}</span>
                              </span>
                            </div>
                          </td>
                        </tr>
                        {locTasks.map((task) => renderReportRow(task, 0))}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-4 border-surface-dark bg-surface-dark text-white">
                  <td className="p-4 font-black uppercase tracking-widest">
                    Project Totals
                  </td>
                  <td className="p-4 text-right">
                    <div className="text-xs">
                      ₹
                      {stats.materialPlanned.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                    <div className="text-[10px] text-white/70">
                      ₹
                      {stats.materialActual.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="text-xs">
                      ₹
                      {stats.laborPlanned.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                    <div className="text-[10px] text-white/70">
                      ₹
                      {stats.laborActual.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="text-[10px] text-white/70">Actual</div>
                    <div className="text-sm font-bold">
                      ₹
                      {stats.equipmentActual.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="text-xs">
                      ₹
                      {stats.otherPlanned.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                    <div className="text-[10px] text-white/70">
                      ₹
                      {(stats.otherActual - stats.equipmentActual).toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                  </td>
                  <td className="p-4 text-right font-black">
                    ₹
                    {stats.totalBudgeted.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                  </td>
                  <td className="p-4 text-right font-black">
                    ₹
                    {stats.totalActual.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                  </td>
                  <td className="p-4 text-right font-black">
                    ₹
                    {(stats.totalBudgeted - stats.totalActual).toLocaleString(
                      "en-IN",
                      { maximumFractionDigits: 0 },
                    )}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="bg-[#F7E4DB] p-5 rounded-2xl border border-[#F7E4DB] flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-rust-strong shrink-0" />
            <div>
              <h4 className="font-bold text-[#B85F3B] mb-1">
                Executive Summary
              </h4>
              <p className="text-sm text-[#B85F3B] leading-relaxed">
                The project is currently{" "}
                {stats.totalBudgeted - stats.totalActual >= 0
                  ? "under"
                  : "over"}{" "}
                budget by ₹
                {Math.abs(
                  stats.totalBudgeted - stats.totalActual,
                ).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                . Material costs represent{" "}
                {Math.round((stats.materialActual / stats.totalActual) * 100) ||
                  0}
                % of the total expenditure. Labor costs are at{" "}
                {Math.round((stats.laborActual / stats.totalActual) * 100) || 0}
                % of actual spend, and equipment at{" "}
                {Math.round((stats.equipmentActual / stats.totalActual) * 100) ||
                  0}
                %.
              </p>
            </div>
          </div>
        </div>
      )}

      {viewMode === "payments" && (
        <ClientPaymentsView
          projectId={projectId}
          clientPayments={clientPayments}
          vendorLedger={vendorLedger}
          vendors={vendors}
          costEntries={entries}
        />
      )}

      {/* Modals */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-onyx/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-surface rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="bg-primary p-5 md:p-6 text-white flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold">
                    {newEntry.id ? "Edit Transaction" : "Add Transaction"}
                  </h3>
                  <p className="text-[#C8D1D3] text-xs font-medium uppercase tracking-widest mt-1">
                    Direct Cost Ledger
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setNewEntry({
                      description: "",
                      amount: 0,
                      type: "Actual",
                      category: "Material",
                      date: new Date().toISOString().split("T")[0],
                      taskId: "",
                    });
                  }}
                  className="p-2 hover:bg-surface/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAddEntry} className="p-5 md:p-6 space-y-6">
                <div className="space-y-4">
                  <input type="hidden" value="" />

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">
                      Description
                    </label>
                    <input
                      required
                      placeholder="e.g. Fuel for generator"
                      className="w-full bg-[#F0F3F4] p-4 rounded-2xl font-semibold outline-none"
                      value={newEntry.description}
                      onChange={(e) =>
                        setNewEntry({
                          ...newEntry,
                          description: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">
                        Amount (₹)
                      </label>
                      <input
                        type="number"
                        required
                        className="w-full bg-[#F0F3F4] p-4 rounded-2xl font-black text-primary outline-none"
                        value={newEntry.amount || ""}
                        onChange={(e) =>
                          setNewEntry({
                            ...newEntry,
                            amount: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                      {/* Inline budget insight for this task: how this spend sits
                          against what was planned, before it's saved. */}
                      {entryInsight && (
                        <p
                          className={`text-[11px] font-semibold flex items-start gap-1.5 ml-1 ${
                            entryInsight.tone === "bad"
                              ? "text-danger"
                              : entryInsight.tone === "good"
                                ? "text-success"
                                : "text-ink-muted"
                          }`}
                        >
                          <span aria-hidden>
                            {entryInsight.tone === "bad" ? "▲" : entryInsight.tone === "good" ? "▼" : "•"}
                          </span>
                          <span>{entryInsight.text}</span>
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">
                        Type
                      </label>
                      <select
                        className="w-full bg-[#F0F3F4] p-4 rounded-2xl font-semibold outline-none appearance-none"
                        value={newEntry.type}
                        onChange={(e) =>
                          setNewEntry({
                            ...newEntry,
                            type: e.target.value as any,
                          })
                        }
                      >
                        <option value="Actual">Actual Spend</option>
                        <option value="Budget">Planned Budget</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">
                        Category (Head)
                      </label>
                      <select
                        required
                        className="w-full bg-[#F0F3F4] p-4 rounded-2xl font-semibold outline-none focus:ring-2 focus:ring-primary/20 apple-transition appearance-none"
                        value={newEntry.category}
                        onChange={(e) =>
                          setNewEntry({
                            ...newEntry,
                            category: e.target.value as any,
                          })
                        }
                      >
                        <option value="" disabled>
                          Select category (e.g. Fuel, Equipment rental,
                          Transport...)
                        </option>
                        <option value="Labor">Labor</option>
                        <option value="Equipment">Equipment</option>
                        <option value="Subcontractor">Subcontractor</option>
                        <option value="Transport">Transport</option>
                        <option value="Other">Other</option>
                        {newEntry.id && newEntry.category === "Material" && (
                          <option value="Material">Material (Legacy)</option>
                        )}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">
                        Date
                      </label>
                      <input
                        type="date"
                        required
                        className="w-full bg-[#F0F3F4] p-4 rounded-2xl font-semibold outline-none"
                        value={newEntry.date}
                        onChange={(e) =>
                          setNewEntry({ ...newEntry, date: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-primary text-white py-4 rounded-2xl font-bold uppercase tracking-widest hover:bg-primary/80 transition-all shadow-xl shadow-primary/20"
                >
                  Save Transaction
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deletingId && (
          <div className="fixed inset-0 bg-onyx/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-surface rounded-3xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-6 text-center space-y-4">
                <div className="w-16 h-16 bg-danger/15 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Trash2 className="w-8 h-8 text-danger" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-ink">Delete Entry?</h3>
                  <p className="text-sm text-ink-muted mt-2">
                    Are you sure you want to delete this cost entry? This action
                    cannot be undone and will update task costs.
                  </p>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setDeletingId(null)}
                    className="flex-1 py-3.5 bg-panel hover:bg-divider rounded-2xl font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const entry = entries.find((e) => e.id === deletingId);
                      if (entry) handleDeleteEntry(entry);
                    }}
                    className="flex-1 py-3.5 bg-danger hover:bg-danger text-white rounded-2xl font-bold transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
