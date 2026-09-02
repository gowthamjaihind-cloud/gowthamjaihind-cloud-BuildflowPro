import React, { useState, useMemo, useEffect, useCallback } from "react";
import { orderTasksByWbs } from "../lib/wbsOrder";
import { demoRequested } from "../demo";
import { demoCollections } from "@demo";
import { money } from "../utils/num";
import { exportToCSV, exportToPDF } from "../utils/exportUtils";
import { useTranslation } from "../i18n";
import { motion } from "motion/react";
import {
  Plus,
  MagnifyingGlass as Search,
  FileText,
  FileText as FileCheck,
  FileX,
  PaperPlaneTilt as Send,
  DownloadSimple as Download,
  Calculator,
  CheckCircle as CheckCircle2,
  CaretRight as ChevronRight,
  Calculator as CalculatorIcon,
  ArrowLeft,
  Trash as Trash2,
  Link,
  TrendUp as TrendingUp,
  TrendDown as TrendingDown,
  Minus,
} from "@phosphor-icons/react";
import { ClientEstimate, EstimateLineItem, Task, PurchaseOrder } from "../types";
import { useTasksQuery, useProjectDataQuery } from "../hooks/queries";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuthStore } from "../store";
import { useProjectCostTotals } from "../hooks/useProjectCostTotals";
import { toast } from "../lib/feedback";

interface EstimateTrackerViewProps {
  projectId: string;
}

export const EstimateTrackerView: React.FC<EstimateTrackerViewProps> = ({
  projectId,
}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const user = useAuthStore((state) => state.user);
  const isAdminOrOwner = user?.role === "Admin" || user?.role === "Owner";
  const { stats, taskTotalsMap } = useProjectCostTotals(projectId);

  const tenantPath = user?.currentOrgId
    ? `organizations/${user.currentOrgId}`
    : "";
  const basePath = tenantPath
    ? `${tenantPath}/projects/${projectId}`
    : `projects/${projectId}`;
  const getSystemCounterRef = (counterName: string) =>
    doc(db, `${basePath}/system`, counterName);

  const [estimates, setEstimates] = useState<ClientEstimate[]>([]);

  useEffect(() => {
    // This screen subscribes to Firestore directly, so demo mode is handled here.
    if (__DEMO__ && demoRequested()) {
      setEstimates((demoCollections.estimates || []) as any);
      return;
    }
    const q = query(
      collection(db, `${basePath}/estimates`),
      orderBy("dateCreated", "desc"),
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setEstimates(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ClientEstimate),
      );
    });
    return () => unsub();
  }, [basePath]);

  const [newEstimate, setNewEstimate] = useState<Partial<ClientEstimate>>({
    dateCreated: new Date().toISOString().split("T")[0],
    dateValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    status: "Draft",
    items: [],
    subTotal: 0,
    taxAmount: 0,
    totalAmount: 0,
    taxRatePercent: 18,
  });

  const [selectedEstimateId, setSelectedEstimateId] = useState<string | null>(
    null,
  );
  const selectedEstimate = estimates.find((e) => e.id === selectedEstimateId);

  // Sync state
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const { data: projectTasks = [] } = useTasksQuery(projectId);
  const { data: purchaseOrders = [] } = useProjectDataQuery<PurchaseOrder>(projectId, "purchase_orders");
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    new Set(),
  );
  const [estimateToDelete, setEstimateToDelete] =
    useState<ClientEstimate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCreate = async () => {
    try {
      const counterRef = getSystemCounterRef("estimateCounter");
      let currentNumber = "001";
      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let nextCount = 1;
        if (counterDoc.exists()) {
          nextCount = counterDoc.data().count + 1;
        }
        transaction.set(counterRef, { count: nextCount }, { merge: true });
        currentNumber = nextCount.toString().padStart(3, "0");
      });

      const estimateNumber = `EST-${currentNumber}`;

      const newEstRef = doc(collection(db, `${basePath}/estimates`));
      const newEstData: ClientEstimate = {
        ...(newEstimate as ClientEstimate),
        id: newEstRef.id,
        projectId,
        estimateNumber,
        snapshotBudgeted: stats.totalBudgeted,
        snapshotDate: new Date().toISOString(),
      };

      await setDoc(newEstRef, newEstData);
      setIsCreateModalOpen(false);
      setSelectedEstimateId(newEstRef.id);
    } catch (error) {
      console.error("Failed to create estimate", error);
      toast.error("Failed to create estimate");
    }
  };

  const getStatusColor = (status: ClientEstimate["status"]) => {
    switch (status) {
      case "Draft":
        return "bg-ice text-ink/80 border-divider";
      case "Sent to Client":
        return "bg-[#E2E8ED] text-[#56778E] border-[#C5D2DB]";
      case "Approved":
        return "bg-success/20 text-success border-success/40";
      case "Rejected":
        return "bg-danger/15 text-danger border-danger/30";
    }
  };

  const getStatusIcon = (status: ClientEstimate["status"]) => {
    switch (status) {
      case "Draft":
        return <FileText className="w-4 h-4" />;
      case "Sent to Client":
        return <Send className="w-4 h-4" />;
      case "Approved":
        return <FileCheck className="w-4 h-4" />;
      case "Rejected":
        return <FileX className="w-4 h-4" />;
    }
  };

  const handleDeleteEstimate = async () => {
    if (!estimateToDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteDoc(
        doc(db, `${basePath}/estimates`, estimateToDelete.id),
      );
      if (selectedEstimateId === estimateToDelete.id) {
        setSelectedEstimateId(null);
      }
      setEstimateToDelete(null);
    } catch (err) {
      console.error("Failed to delete estimate", err);
      toast.error("Failed to delete estimate");
    } finally {
      setIsDeleting(false);
    }
  };

  const updateSelectedEstimate = async (updates: Partial<ClientEstimate>) => {
    if (!selectedEstimateId) return;
    try {
      await updateDoc(
        doc(db, `${basePath}/estimates`, selectedEstimateId),
        updates,
      );
    } catch (err) {
      console.error("Failed to update estimate", err);
      toast.error("Failed to update estimate");
    }
  };

  const addLineItem = () => {
    if (!selectedEstimate) return;
    const newItem: EstimateLineItem = {
      id: `item-${Date.now()}`,
      taskName: "New Item",
      description: "",
      quantity: 1,
      unit: "Nos",
      rate: 0,
      totalAmount: 0,
    };
    const items = [...selectedEstimate.items, newItem];
    const subTotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
    const taxRate = selectedEstimate.taxRatePercent ?? 18;
    const taxAmount = subTotal * (taxRate / 100);
    updateSelectedEstimate({
      items,
      subTotal,
      taxAmount,
      totalAmount: subTotal + taxAmount,
    });
  };

  const updateLineItem = (
    itemId: string,
    field: keyof EstimateLineItem,
    value: any,
  ) => {
    if (!selectedEstimate) return;
    const items = selectedEstimate.items.map((item) => {
      if (item.id === itemId) {
        const updated = { ...item, [field]: value };
        if (field === "quantity" || field === "rate") {
          updated.totalAmount = updated.quantity * updated.rate;
        }
        return updated;
      }
      return item;
    });
    const subTotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
    const taxRate = selectedEstimate.taxRatePercent ?? 18;
    const taxAmount = subTotal * (taxRate / 100);
    updateSelectedEstimate({
      items,
      subTotal,
      taxAmount,
      totalAmount: subTotal + taxAmount,
    });
  };

  const removeLineItem = (itemId: string) => {
    if (!selectedEstimate) return;
    const items = selectedEstimate.items.filter((item) => item.id !== itemId);
    const subTotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
    const taxRate = selectedEstimate.taxRatePercent ?? 18;
    const taxAmount = subTotal * (taxRate / 100);
    updateSelectedEstimate({
      items,
      subTotal,
      taxAmount,
      totalAmount: subTotal + taxAmount,
    });
  };

  const handleSyncTasks = () => {
    if (!selectedEstimate) return;

    // Add selected tasks
    const newItems: EstimateLineItem[] = Array.from(selectedTaskIds).map(
      (taskId) => {
        const task = projectTasks.find((t) => t.id === taskId);
        return {
          id: `item-${Date.now()}-${taskId}`,
          taskId: taskId as string,
          taskName: task?.name || "Unknown Task",
          description: task?.assignedTo ? `Assigned to ${task.assignedTo}` : "",
          quantity: 1,
          unit: "Lump Sum",
          rate: 0,
          totalAmount: 0,
          isChangeOrder: task?.isChangeOrder || false,
        };
      },
    );

    const items = [...selectedEstimate.items, ...newItems];
    const subTotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
    const taxRate = selectedEstimate.taxRatePercent ?? 18;
    const taxAmount = subTotal * (taxRate / 100);
    updateSelectedEstimate({
      items,
      subTotal,
      taxAmount,
      totalAmount: subTotal + taxAmount,
    });
    setIsSyncModalOpen(false);
    setSelectedTaskIds(new Set());
  };

  const getScopedCost = useCallback(
    (estimate: ClientEstimate) => {
      const items = estimate.items || [];
      const linkedIds = new Set(
        items.map((i) => i.taskId).filter(Boolean) as string[]
      );
      const unlinkedCount = items.filter((i) => !i.taskId).length;

      // CRITICAL: taskTotalsMap[taskId] ALREADY includes that task's children.
      // So if both a parent and its child are linked, summing both double-counts
      // the child. Keep only the top-most linked tasks.
      const hasLinkedAncestor = (taskId: string): boolean => {
        let t = projectTasks.find((x) => x.id === taskId);
        while (t?.parentId) {
          if (linkedIds.has(t.parentId)) return true;
          t = projectTasks.find((x) => x.id === t!.parentId);
        }
        return false;
      };

      const topMost = Array.from(linkedIds).filter((id) => !hasLinkedAncestor(id));

      let actual = 0;
      let planned = 0;
      let plannedMaterial = 0;
      let actualMaterial = 0;
      for (const id of topMost) {
        const t = taskTotalsMap[id];
        if (t) {
          actual += t.totalActual || 0;
          planned += t.totalPlanned || 0;
          plannedMaterial += t.plannedMaterial || 0;
          actualMaterial  += t.actualMaterial  || 0;
        }
      }

      // Collect leaf descendants of each top-most linked task (or the task itself if leaf)
      const collectLeaves = (taskId: string): Task[] => {
        const children = projectTasks.filter((t) => t.parentId === taskId);
        if (children.length === 0) {
          const self = projectTasks.find((t) => t.id === taskId);
          return self ? [self] : [];
        }
        return children.flatMap((c) => collectLeaves(c.id));
      };

      let earnedValue = 0;
      let leafPlanned = 0;
      for (const id of topMost) {
        for (const leaf of collectLeaves(id)) {
          const lt = taskTotalsMap[leaf.id];
          if (!lt) continue;
          const p = lt.totalPlanned || 0;
          const pct = Math.min(100, Math.max(0, leaf.progress || 0)) / 100;
          leafPlanned += p;
          earnedValue += p * pct;
        }
      }

      return { actual, planned, linkedCount: linkedIds.size, unlinkedCount, earnedValue, leafPlanned, plannedMaterial, actualMaterial };
    },
    [projectTasks, taskTotalsMap]
  );

  const scopedCost = useMemo(
    () =>
      selectedEstimate
        ? getScopedCost(selectedEstimate)
        : { actual: 0, planned: 0, linkedCount: 0, unlinkedCount: 0, earnedValue: 0, leafPlanned: 0, plannedMaterial: 0, actualMaterial: 0 },
    [selectedEstimate, getScopedCost]
  );

  const forecast = useMemo(() => {
    if (!selectedEstimate) return null;
    const { actual, earnedValue, leafPlanned } = scopedCost;

    // Cannot forecast without progress or spend.
    if (leafPlanned <= 0) return { status: "no-budget" };
    if (earnedValue <= 0) return { status: "no-progress" };
    if (actual <= 0) return { status: "no-spend" };

    const cpi = earnedValue / actual;                 // <1 = overspending
    const percentComplete = (earnedValue / leafPlanned) * 100;
    const forecastFinalCost = leafPlanned / cpi;      // extrapolates current burn rate
    const forecastMargin = selectedEstimate.subTotal - forecastFinalCost;

    return {
      status: "ok",
      cpi,
      percentComplete,
      forecastFinalCost,
      forecastMargin,
      forecastMarginPercent:
        selectedEstimate.subTotal > 0
          ? (forecastMargin / selectedEstimate.subTotal) * 100
          : null,
    };
  }, [selectedEstimate, scopedCost]);

  const committed = useMemo(() => {
    const open = purchaseOrders.filter(
      (po) => po.status === "Approved" || po.status === "Partially Received"
    );
    let total = 0;
    for (const po of open) {
      for (const li of po.lineItems || []) {
        const remaining = Math.max(0, (li.orderedQty || 0) - (li.receivedQty || 0));
        total += remaining * (li.rate || 0);
      }
    }
    return { total, count: open.length };
  }, [purchaseOrders]);

  const uncoveredCost = Math.max(0, stats.totalActual - scopedCost.actual);
  const remainingMaterialBudget = scopedCost.plannedMaterial - scopedCost.actualMaterial;

  if (selectedEstimate) {
    const baseContractItems = selectedEstimate.items.filter((item) => !item.isChangeOrder);
    const changeOrderItems = selectedEstimate.items.filter((item) => item.isChangeOrder);
    const baseSubTotal = baseContractItems.reduce((sum, item) => sum + item.totalAmount, 0);
    const coSubTotal = changeOrderItems.reduce((sum, item) => sum + item.totalAmount, 0);

    const handleEstimateExportCSV = () => {
      if (!selectedEstimate) return;
      const headers = ["Description", "Quantity", "Unit", "Rate (₹)", "Total Amount (₹)", "Classification"];
      const rows = (selectedEstimate.items || []).map((item) => [
        item.description || "",
        item.quantity || 0,
        item.unit || "",
        item.rate || 0,
        item.totalAmount || 0,
        item.isChangeOrder ? "Change Order" : "Base Contract",
      ]);
      exportToCSV(`Estimate_${selectedEstimate.estimateNumber}`, headers, rows);
    };

    const handleEstimateExportPDF = () => {
      if (!selectedEstimate) return;
      const headers = ["Description", "Qty", "Unit", "Rate (₹)", "Total (₹)", "Type"];
      const rows = (selectedEstimate.items || []).map((item) => [
        item.description || "",
        item.quantity || 0,
        item.unit || "",
        `₹${(item.rate || 0).toLocaleString("en-IN")}`,
        `₹${(item.totalAmount || 0).toLocaleString("en-IN")}`,
        item.isChangeOrder ? "Change Order" : "Base Contract",
      ]);
      exportToPDF(
        `CLIENT ESTIMATE: ${selectedEstimate.estimateNumber}`,
        `Client: ${selectedEstimate.clientName || "N/A"} | Date: ${new Date(selectedEstimate.dateCreated).toLocaleDateString()} | Total: ₹${money(selectedEstimate.totalAmount)}`,
        headers,
        rows,
        `Estimate_${selectedEstimate.estimateNumber}`
      );
    };

    return (
      <div className="space-y-6">
        {estimateToDelete && (
          <div className="fixed inset-0 bg-onyx/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="bg-panel rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-divider">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-2xl bg-danger/10 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-danger" />
                </div>
                <h3 className="text-lg font-bold text-ink">Delete estimate?</h3>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed mb-6">
                Estimate{" "}
                <span className="font-bold text-ink">
                  {estimateToDelete.estimateNumber}
                </span>
                {estimateToDelete.clientName
                  ? ` for ${estimateToDelete.clientName}`
                  : ""}{" "}
                and all its line items will be permanently deleted. This cannot
                be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setEstimateToDelete(null)}
                  disabled={isDeleting}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold text-ink bg-surface border border-divider hover:bg-divider transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteEstimate}
                  disabled={isDeleting}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-danger hover:bg-danger transition-colors disabled:opacity-50"
                >
                  {isDeleting ? "Deleting…" : "Delete estimate"}
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedEstimateId(null)}
              className="p-2 bg-surface border border-divider rounded-xl hover:bg-panel transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-ink" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-ink">
                  Estimate {selectedEstimate.estimateNumber}
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(selectedEstimate.status)}`}
                >
                  {getStatusIcon(selectedEstimate.status)}
                  {selectedEstimate.status}
                </span>
              </div>
              <p className="text-ink-muted text-sm mt-1">
                Created on{" "}
                {new Date(selectedEstimate.dateCreated).toLocaleDateString()} •
                Valid until{" "}
                {new Date(selectedEstimate.dateValidUntil).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleEstimateExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 bg-panel hover:bg-divider border border-divider rounded-xl text-xs font-bold uppercase tracking-wider text-ink transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-ink/80" />
              CSV
            </button>
            <button
              onClick={handleEstimateExportPDF}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#C0653F] hover:bg-[#A0522F] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              PDF
            </button>
            {isAdminOrOwner && (
              <button
                onClick={() => setEstimateToDelete(selectedEstimate)}
                className="flex items-center gap-1.5 px-3 py-2 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer"
                title="Delete this estimate"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-surface border border-divider rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-ink">Line Items</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsSyncModalOpen(true)}
                    className="bg-secondary/10 text-secondary hover:bg-secondary/20 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                  >
                    <Link className="w-4 h-4" /> Sync WBS
                  </button>
                  <button
                    onClick={addLineItem}
                    className="bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add Item
                  </button>
                </div>
              </div>

              {selectedEstimate.items.length === 0 ? (
                <div className="text-center py-8">
                  <CalculatorIcon className="w-10 h-10 text-ink-muted/30 mx-auto mb-3" />
                  <h3 className="text-sm font-bold text-ink-muted">
                    No line items
                  </h3>
                  <p className="text-xs text-ink-muted/60">
                    Add items manually or sync from your WBS/Tasks list.
                  </p>
                </div>
              ) : (() => {
                const renderItemCard = (item: EstimateLineItem) => (
                  <div
                    key={item.id}
                    className="bg-panel border border-white/10 rounded-xl p-4 flex flex-col gap-3 group relative"
                  >
                    <button
                      onClick={() => removeLineItem(item.id)}
                      className="absolute top-4 right-4 text-ink-muted opacity-0 group-hover:opacity-100 hover:text-danger transition-all pointer-events-none group-hover:pointer-events-auto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-8">
                      <div>
                        <label className="text-[10px] font-bold text-ink-muted uppercase tracking-wider mb-1 block">
                          Task / Item Name
                        </label>
                        <input
                          type="text"
                          value={item.taskName}
                          onChange={(e) =>
                            updateLineItem(
                              item.id,
                              "taskName",
                              e.target.value,
                            )
                          }
                          className="w-full bg-surface border border-white/10 rounded-lg px-3 py-1.5 text-sm text-ink outline-none focus:border-primary/50"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-ink-muted uppercase tracking-wider mb-1 block">
                          Description
                        </label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) =>
                            updateLineItem(
                              item.id,
                              "description",
                              e.target.value,
                            )
                          }
                          className="w-full bg-surface border border-white/10 rounded-lg px-3 py-1.5 text-sm text-ink outline-none focus:border-primary/50"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-white/5 pt-3">
                      <div>
                        <label className="text-[10px] font-bold text-ink-muted uppercase tracking-wider mb-1 block">
                          Quantity
                        </label>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) =>
                            updateLineItem(
                              item.id,
                              "quantity",
                              parseFloat(e.target.value),
                            )
                          }
                          className="w-full bg-surface border border-white/10 rounded-lg px-3 py-1.5 text-sm text-ink outline-none focus:border-primary/50"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-ink-muted uppercase tracking-wider mb-1 block">
                          Unit
                        </label>
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) =>
                            updateLineItem(item.id, "unit", e.target.value)
                          }
                          className="w-full bg-surface border border-white/10 rounded-lg px-3 py-1.5 text-sm text-ink outline-none focus:border-primary/50"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-ink-muted uppercase tracking-wider mb-1 block">
                          Rate (₹)
                        </label>
                        <input
                          type="number"
                          value={item.rate}
                          onChange={(e) =>
                            updateLineItem(
                              item.id,
                              "rate",
                              parseFloat(e.target.value),
                            )
                          }
                          className="w-full bg-surface border border-white/10 rounded-lg px-3 py-1.5 text-sm text-ink outline-none focus:border-primary/50"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-ink-muted uppercase tracking-wider mb-1 block">
                          Total (₹)
                        </label>
                        <div className="w-full bg-surface/50 border border-transparent rounded-lg px-3 py-1.5 text-sm text-ink font-bold font-mono">
                          {item.totalAmount.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1 pt-2 border-t border-white/5">
                      <label className="text-[10px] font-bold text-ink-muted uppercase tracking-wider">
                        Classification:
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          updateLineItem(item.id, "isChangeOrder", !item.isChangeOrder);
                        }}
                        className={`px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase transition-all ${
                          item.isChangeOrder
                            ? "bg-amber-500/20 text-[#C0653F] border border-amber-500/30"
                            : "bg-surface/60 text-ink-muted hover:text-ink border border-white/10"
                        }`}
                      >
                        {item.isChangeOrder ? "Change Order" : "Base Contract"}
                      </button>
                    </div>
                  </div>
                );

                return (
                  <div className="space-y-8">
                    {/* Base Contract Section */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-divider pb-2">
                        <span className="text-xs font-black uppercase tracking-widest text-ink">
                          Base Contract Items ({baseContractItems.length})
                        </span>
                        <span className="text-sm font-black text-ink font-mono">
                          Subtotal: ₹{baseSubTotal.toLocaleString()}
                        </span>
                      </div>
                      {baseContractItems.length === 0 ? (
                        <p className="text-xs text-ink-muted italic py-2 text-center">No base contract items in this estimate.</p>
                      ) : (
                        <div className="space-y-4">
                          {baseContractItems.map(renderItemCard)}
                        </div>
                      )}
                    </div>

                    {/* Change Order Section */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-amber-500/25 pb-2">
                        <span className="text-xs font-black uppercase tracking-widest text-[#C0653F]">
                          Change Order Items ({changeOrderItems.length})
                        </span>
                        <span className="text-sm font-black text-[#C0653F] font-mono">
                          Subtotal: ₹{coSubTotal.toLocaleString()}
                        </span>
                      </div>
                      {changeOrderItems.length === 0 ? (
                        <p className="text-xs text-ink-muted italic py-2 text-center">No change order items in this estimate.</p>
                      ) : (
                        <div className="space-y-4">
                          {changeOrderItems.map(renderItemCard)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-surface border border-divider rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-ink text-left">
                Contract Position
              </h3>
              <div className="space-y-3 pt-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-ink-muted">Contract Value (ex-GST)</span>
                  <span className="text-ink font-medium">
                    ₹{selectedEstimate.subTotal.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-ink-muted">Cost to Date</span>
                  <span className="text-ink font-medium">
                    ₹{scopedCost.actual.toLocaleString()}
                  </span>
                </div>
                <div className="border-t border-white/10 my-3"></div>
                <div className="flex justify-between items-end">
                  <div>
                    <div className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-1">
                      MARGIN TO DATE
                    </div>
                    <div className="text-[10px] text-ink-muted/60 leading-tight max-w-[140px]">
                      Based on cost incurred so far, not final cost.
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-2xl font-bold ${
                        selectedEstimate.subTotal - scopedCost.actual >= 0
                          ? "text-success"
                          : "text-danger"
                      }`}
                    >
                      ₹{(selectedEstimate.subTotal - scopedCost.actual).toLocaleString()}
                    </div>
                    <div
                      className={`text-sm font-medium ${
                        selectedEstimate.subTotal - scopedCost.actual >= 0
                          ? "text-success"
                          : "text-danger"
                      }`}
                    >
                      {selectedEstimate.subTotal > 0
                        ? `${(((selectedEstimate.subTotal - scopedCost.actual) / selectedEstimate.subTotal) * 100).toFixed(1)}%`
                        : "—"}
                    </div>
                  </div>
                </div>
                {selectedEstimate.subTotal - scopedCost.actual < 0 && (
                  <div className="text-danger text-xs font-medium text-right mt-1">
                    Cost has exceeded the contract value by ₹{(scopedCost.actual - selectedEstimate.subTotal).toLocaleString()}
                  </div>
                )}
                {scopedCost.unlinkedCount > 0 && (
                  <div className="text-ink-muted text-xs mt-3 pt-3 border-t border-white/10">
                    {scopedCost.unlinkedCount} of {selectedEstimate.items.length} line items aren't linked to a WBS task — their cost isn't included here.
                  </div>
                )}
              </div>
            </div>

            {uncoveredCost > 0 && (
              <div className="p-4 rounded-xl border border-primary/40 bg-[#F7E4DB]">
                <div className="text-primary text-sm font-bold mb-1">
                  ₹{uncoveredCost.toLocaleString()} of cost isn't included in this margin
                </div>
                <div className="text-ink-muted text-xs leading-relaxed">
                  This cost sits on project tasks that aren't linked to this estimate. Since this
                  project is the contract, that cost is real — the margin above is optimistic.
                  Link those tasks to the estimate, or treat the figure with caution.
                </div>
              </div>
            )}

            {/* Forecast Panel */}
            <div className="bg-surface border border-divider rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-ink text-left">Forecast at Completion</h3>
              <div className="space-y-3 pt-2 text-sm">
                {forecast?.status === "ok" ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-ink-muted">% Complete</span>
                      <span className="text-ink font-medium">
                        {forecast.percentComplete.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-ink-muted">Cost Performance</span>
                      <span className={`font-medium ${
                        forecast.cpi >= 1.0 ? "text-success" : forecast.cpi >= 0.9 ? "text-primary" : "text-danger"
                      }`}>
                        {forecast.cpi.toFixed(2)} (
                        {forecast.cpi >= 1.0 ? "On or under budget" : forecast.cpi >= 0.9 ? "Slightly overspending" : "Overspending"}
                        )
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-ink-muted">Forecast Final Cost</span>
                      <span className="text-ink font-medium">
                        ₹{forecast.forecastFinalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="border-t border-white/10 my-3"></div>
                    <div className="flex justify-between items-end">
                      <div className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-1">
                        FORECAST MARGIN
                      </div>
                      <div className="text-right">
                        <div
                          className={`text-2xl font-bold ${
                            forecast.forecastMargin >= 0
                              ? "text-success"
                              : "text-danger"
                          }`}
                        >
                          ₹{forecast.forecastMargin.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        <div
                          className={`text-sm font-medium ${
                            forecast.forecastMargin >= 0
                              ? "text-success"
                              : "text-danger"
                          }`}
                        >
                          {forecast.forecastMarginPercent !== null
                            ? `${forecast.forecastMarginPercent.toFixed(1)}%`
                            : "—"}
                        </div>
                      </div>
                    </div>
                    {forecast.forecastMargin < 0 && (
                      <div className="text-danger text-xs font-medium text-right mt-1">
                        At the current spend rate this job finishes at a LOSS of ₹{Math.abs(forecast.forecastMargin).toLocaleString(undefined, { maximumFractionDigits: 0 })}.
                      </div>
                    )}
                  </>
                ) : forecast?.status === "no-progress" ? (
                  <div className="text-ink-muted text-xs">
                    No progress logged on these tasks yet — a forecast needs progress to project from.
                  </div>
                ) : forecast?.status === "no-spend" ? (
                  <div className="text-ink-muted text-xs">
                    No cost recorded on these tasks yet.
                  </div>
                ) : forecast?.status === "no-budget" ? (
                  <div className="text-ink-muted text-xs">
                    These tasks have no planned cost budgeted, so there is nothing to forecast against.
                  </div>
                ) : null}
              </div>
            </div>

            {/* Committed Cost Panel */}
            <div className="bg-surface border border-divider rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-ink text-left">Open Commitments</h3>
              <div className="space-y-3 pt-2 text-sm">
                <div className="text-ink font-medium">
                  ₹{committed.total.toLocaleString()} committed across {committed.count} open PO(s)
                </div>
                <div className="text-ink-muted text-xs leading-relaxed">
                  Material ordered but not yet received. Becomes job cost when consumed.
                </div>
                {committed.total > remainingMaterialBudget && remainingMaterialBudget > 0 && (
                  <div className="text-primary text-xs font-medium mt-2">
                    You've committed ₹{committed.total.toLocaleString()} but only
                    ₹{remainingMaterialBudget.toLocaleString()} of material budget remains.
                    Possible over-ordering.
                  </div>
                )}
              </div>
            </div>

            <div className="bg-surface border border-divider rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-ink text-left">Quote Summary</h3>
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-ink-muted font-medium">Base Contract Subtotal</span>
                  <span className="text-ink font-bold">
                    ₹{baseSubTotal.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-[#C0653F] font-medium">Change Order Subtotal</span>
                  <span className="text-[#C0653F] font-bold">
                    ₹{coSubTotal.toLocaleString()}
                  </span>
                </div>
                <div className="border-t border-white/10 my-1"></div>
                <div className="flex justify-between items-center text-sm font-bold">
                  <span className="text-ink">Combined Subtotal</span>
                  <span className="text-ink font-bold">
                    ₹{selectedEstimate.subTotal.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-ink-muted font-medium flex items-center gap-2">
                    Tax (%)
                    <input
                      type="number"
                      value={selectedEstimate.taxRatePercent ?? 18}
                      onChange={(e) => {
                        const rate = parseFloat(e.target.value) || 0;
                        const sub = selectedEstimate.subTotal;
                        const tax = sub * (rate / 100);
                        updateSelectedEstimate({
                          taxRatePercent: rate,
                          taxAmount: tax,
                          totalAmount: sub + tax,
                        });
                      }}
                      className="w-16 bg-panel border-2 border-white/10 rounded-lg px-2 py-0.5 text-ink outline-none"
                    />
                  </span>
                  <span className="text-ink font-bold">
                    ₹{selectedEstimate.taxAmount.toLocaleString()}
                  </span>
                </div>
                <div className="border-t border-white/10 pt-3 flex justify-between items-center">
                  <span className="text-ink font-bold">Total Quote</span>
                  <span className="text-xl text-primary font-bold">
                    ₹{selectedEstimate.totalAmount.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="border-t border-white/10 pt-4 space-y-2">
                {selectedEstimate.status === "Draft" && (
                  <button
                    onClick={() =>
                      updateSelectedEstimate({ status: "Sent to Client" })
                    }
                    className="w-full bg-primary hover:bg-primary/80 text-white font-bold py-2 rounded-xl transition-colors shadow-lg shadow-primary/20"
                  >
                    Mark as Sent
                  </button>
                )}
                {selectedEstimate.status === "Sent to Client" && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        if (!isAdminOrOwner)
                          return toast.info("Only Admins and Owners can approve estimates.",);
                        updateSelectedEstimate({ status: "Approved" });
                      }}
                      className="w-full bg-success hover:bg-success text-white font-bold py-2 rounded-xl transition-colors shadow-lg shadow-green-500/20"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        if (!isAdminOrOwner)
                          return toast.info("Only Admins and Owners can reject estimates.",);
                        updateSelectedEstimate({ status: "Rejected" });
                      }}
                      className="w-full bg-danger hover:bg-danger text-white font-bold py-2 rounded-xl transition-colors shadow-lg shadow-red-500/20"
                    >
                      Reject
                    </button>
                  </div>
                )}
                {selectedEstimate.status === "Approved" && (
                  <div className="bg-green-500/10 border border-green-500/20 text-success text-center py-2 rounded-xl font-bold flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5" /> Client Approved
                  </div>
                )}
              </div>
            </div>

            <div className="bg-surface border border-divider rounded-2xl p-6 shadow-sm">
              <label className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-2 block">
                Client Notes
              </label>
              <textarea
                value={selectedEstimate.clientNotes || ""}
                onChange={(e) =>
                  updateSelectedEstimate({ clientNotes: e.target.value })
                }
                className="w-full bg-panel border-2 border-transparent rounded-xl px-4 py-2 text-sm text-ink font-medium focus:border-primary/50 outline-none min-h-[100px]"
                placeholder="Terms, conditions, or scope summary..."
              />
            </div>
          </div>
        </div>

        {/* Sync Modal */}
        {isSyncModalOpen && (
          <div className="fixed inset-0 bg-onyx/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-surface w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden border border-divider flex flex-col max-h-[80vh]">
              <div className="bg-panel px-6 py-4 flex justify-between items-center border-b border-white/10 shrink-0">
                <h3 className="text-[17px] font-bold text-ink flex items-center gap-2">
                  <Link className="w-5 h-5 text-secondary" /> Sync Tasks to
                  Estimate
                </h3>
                <button
                  onClick={() => setIsSyncModalOpen(false)}
                  className="text-ink-muted hover:text-ink transition-colors p-1"
                >
                  &times;
                </button>
              </div>
              <div className="p-4 overflow-y-auto grow">
                {projectTasks.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-10 h-10 text-ink-muted/30 mx-auto mb-3" />
                    <h3 className="text-sm font-bold text-ink">
                      No Tasks Found
                    </h3>
                    <p className="text-xs text-ink-muted">
                      Create tasks in the Work Breakdown logic first.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {orderTasksByWbs(projectTasks).map((row) => {
                        const task = row.task;
                        const isSelected = selectedTaskIds.has(task.id);
                        return (
                          <div
                            key={task.id}
                            style={{ marginLeft: row.level * 18 }}
                            className={`flex items-center gap-3 p-3 rounded-xl border ${isSelected ? "bg-primary/5 border-primary/30" : "bg-panel border-white/10 hover:border-white/20"} cursor-pointer transition-colors`}
                            onClick={() => {
                              const newSet = new Set(selectedTaskIds);
                              if (isSelected) newSet.delete(task.id);
                              else newSet.add(task.id);
                              setSelectedTaskIds(newSet);
                            }}
                          >
                            <div
                              className={`w-5 h-5 rounded border flex items-center justify-center ${isSelected ? "bg-primary border-primary text-white" : "border-white/30"}`}
                            >
                              {isSelected && (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-ink">
                                {task.name}
                              </p>
                              <p className="text-xs text-ink-muted/80">
                                {row.context || task.type} • Budget: ₹{task.budgetedCost || 0}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
              <div className="p-4 bg-panel border-t border-white/10 flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => setIsSyncModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl font-bold text-ink-muted hover:text-ink hover:bg-surface transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSyncTasks}
                  disabled={selectedTaskIds.size === 0}
                  className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" /> Import Selected (
                  {selectedTaskIds.size})
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-ink">{t("views.clientEstimates")}</h2>
          <p className="text-ink-muted text-sm mt-1">
            {t("estimates.subtitle")}
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
        >
          <Plus className="w-5 h-5" /> New Estimate
        </button>
      </div>

      <div className="soft-card rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-3 bg-panel px-4 py-2.5 rounded-xl border-2 border-white/40 focus-within:border-primary/50 transition-colors shadow-inner">
          <Search className="w-5 h-5 text-ink-muted" />
          <input
            type="text"
            placeholder="Search estimates by number or status..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none flex-1 font-medium text-ink placeholder:text-ink-muted/50"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/20">
                <th className="text-left py-3 px-4 text-ink-muted font-bold text-[13px] uppercase tracking-wider">
                  Number
                </th>
                <th className="text-left py-3 px-4 text-ink-muted font-bold text-[13px] uppercase tracking-wider">
                  Date
                </th>
                <th className="text-left py-3 px-4 text-ink-muted font-bold text-[13px] uppercase tracking-wider">
                  Status
                </th>
                <th className="text-right py-3 px-4 text-ink-muted font-bold text-[13px] uppercase tracking-wider">
                  Contract (ex-GST)
                </th>
                <th className="text-right py-3 px-4 text-ink-muted font-bold text-[13px] uppercase tracking-wider">
                  Cost to Date
                </th>
                <th className="text-right py-3 px-4 text-ink-muted font-bold text-[13px] uppercase tracking-wider">
                  Margin to Date
                </th>
                <th className="text-right py-3 px-4 text-ink-muted font-bold text-[13px] uppercase tracking-wider">
                  Total (inc GST)
                </th>
                <th className="text-center py-3 px-4 text-ink-muted font-bold text-[13px] uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {estimates
                .filter(
                  (e) =>
                    e.estimateNumber
                      .toLowerCase()
                      .includes(searchTerm.toLowerCase()) ||
                    e.status.toLowerCase().includes(searchTerm.toLowerCase()),
                )
                .map((estimate) => {
                  const estScopedCost = getScopedCost(estimate);
                  const marginValue = estimate.subTotal - estScopedCost.actual;
                  const marginPercent = estimate.subTotal > 0
                    ? ((marginValue / estimate.subTotal) * 100).toFixed(1)
                    : "—";
                  
                  return (
                  <tr
                    key={estimate.id}
                    className="hover:bg-panel/50 transition-colors group cursor-pointer"
                    onClick={() => setSelectedEstimateId(estimate.id)}
                  >
                    <td className="py-4 px-4 font-bold text-ink">
                      {estimate.estimateNumber}
                    </td>
                    <td className="py-4 px-4 text-ink font-medium">
                      {new Date(estimate.dateCreated).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(estimate.status)}`}
                      >
                        {getStatusIcon(estimate.status)}
                        {estimate.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right text-ink font-medium">
                      ₹{estimate.subTotal.toLocaleString()}
                    </td>
                    <td className="py-4 px-4 text-right text-ink font-medium">
                      <div className="flex items-center justify-end gap-1.5">
                        {estScopedCost.unlinkedCount > 0 && (
                          <span 
                            title="Some line items aren't linked to a WBS task — cost is incomplete."
                            className="text-primary cursor-help"
                          >
                            *
                          </span>
                        )}
                        <span>₹{estScopedCost.actual.toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className={`font-bold ${marginValue >= 0 ? "text-success" : "text-danger"}`}>
                        ₹{marginValue.toLocaleString()}
                      </div>
                      <div className={`text-[10px] font-medium ${marginValue >= 0 ? "text-success/80" : "text-danger/80"}`}>
                        {marginPercent !== "—" ? `${marginPercent}%` : "—"}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right text-ink font-bold">
                      ₹{estimate.totalAmount.toLocaleString()}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button className="p-2 text-ink-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )})}
            </tbody>
          </table>
          {estimates.length === 0 && (
            <div className="text-center py-12">
              <Calculator className="w-12 h-12 text-ink-muted/30 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-ink">No Estimates Found</h3>
              <p className="text-ink-muted mb-4">
                Create your first client estimate to start tracking approvals.
              </p>
            </div>
          )}
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-onyx/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-divider">
            <div className="bg-panel px-6 py-4 flex justify-between items-center border-b border-white/10">
              <h3 className="text-[17px] font-bold text-ink flex items-center gap-2">
                <FileText className="w-5 h-5" /> New Client Estimate
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-ink-muted hover:text-ink transition-colors p-1"
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-1 block">
                    Date Valid Until
                  </label>
                  <input
                    type="date"
                    value={newEstimate.dateValidUntil}
                    onChange={(e) =>
                      setNewEstimate({
                        ...newEstimate,
                        dateValidUntil: e.target.value,
                      })
                    }
                    className="w-full bg-panel border-2 border-transparent rounded-xl px-4 py-2 text-ink font-medium focus:border-primary/50 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-1 block">
                    Tax Rate (%)
                  </label>
                  <input
                    type="number"
                    value={newEstimate.taxRatePercent ?? 18}
                    onChange={(e) =>
                      setNewEstimate({
                        ...newEstimate,
                        taxRatePercent: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-panel border-2 border-transparent rounded-xl px-4 py-2 text-ink font-medium focus:border-primary/50 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-1 block">
                  Client Notes
                </label>
                <textarea
                  value={newEstimate.clientNotes || ""}
                  onChange={(e) =>
                    setNewEstimate({
                      ...newEstimate,
                      clientNotes: e.target.value,
                    })
                  }
                  className="w-full bg-panel border-2 border-transparent rounded-xl px-4 py-2 text-ink font-medium focus:border-primary/50 outline-none min-h-[100px]"
                  placeholder="Terms, conditions, or scope summary..."
                />
              </div>
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <p className="text-sm text-primary font-medium flex items-center gap-2">
                  <CalculatorIcon className="w-4 h-4" />
                  Line items can be synced from the WBS/Tasks list after
                  creation.
                </p>
              </div>
            </div>
            <div className="p-4 bg-panel border-t border-white/10 flex justify-end gap-3">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-5 py-2.5 rounded-xl font-bold text-ink-muted hover:text-ink hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors"
              >
                Create Estimate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
