import { useMemo } from "react";
import { Task, CostEntry, InventoryItem, DailyLaborLog } from "../types";
import { useProjectDataQuery } from "./queries";

export const useProjectCostTotals = (projectId: string) => {
  const { data: entries = [] } = useProjectDataQuery<CostEntry>(projectId, "costs");
  const { data: tasks = [] } = useProjectDataQuery<Task>(projectId, "tasks");
  const { data: rawInventory = [] } = useProjectDataQuery<InventoryItem>(projectId, "inventory");
  const { data: purchaseOrders = [] } = useProjectDataQuery<any>(projectId, "purchase_orders");
  const { data: grns = [] } = useProjectDataQuery<any>(projectId, "goodsReceiptNotes");

  const inventory = useMemo(() => {
    return (rawInventory || []).map((item) => {
      let totalQty = 0;
      let totalCost = 0;

      (grns || []).forEach((grn: any) => {
        const po = (purchaseOrders || []).find((p: any) => p.id === grn.poId);
        if (!po) return;

        (grn.lineItems || []).forEach((grnLine: any) => {
          if (grnLine.poLineRef === item.id) {
            const poLine = (po.lineItems || []).find((pLine: any) => pLine.itemId === item.id);
            const rate = poLine?.rate || 0;
            if (rate > 0 && grnLine.acceptedQty > 0) {
              totalQty += grnLine.acceptedQty;
              totalCost += grnLine.acceptedQty * rate;
            }
          }
        });
      });

      const seedQty = Math.max(0, item.quantity - totalQty);
      const seedUnitCost = item.unitCost || 0;

      if (seedQty > 0 && seedUnitCost > 0) {
        totalQty += seedQty;
        totalCost += seedQty * seedUnitCost;
      }

      const computedAvg = totalQty > 0 ? totalCost / totalQty : (item.unitCost || 0);
      const effectiveUnitCost = item.unitCost > 0 ? item.unitCost : computedAvg;

      return {
        ...item,
        avgUnitCost: computedAvg,
        unitCost: effectiveUnitCost,
      };
    });
  }, [rawInventory, grns, purchaseOrders]);
  const { data: laborLogs = [] } = useProjectDataQuery<DailyLaborLog>(projectId, "labor_logs");
  const { data: dailyLogs = [] } = useProjectDataQuery<any>(projectId, "dailyLogs");
  const { data: laborRates = [] } = useProjectDataQuery<any>(projectId, "labor_rate_cards");
  const { data: materialIssues = [] } = useProjectDataQuery<any>(projectId, "material_issues");

  const taskTotalsMap = useMemo(() => {
    const totals: Record<
      string,
      {
        plannedMaterial: number;
        actualMaterial: number;
        plannedLabor: number;
        actualLabor: number;
        plannedOther: number;
        actualOther: number;
        totalPlanned: number;
        totalActual: number;
      }
    > = {};

    // Bottom-up calculation: first leaf nodes, then parents
    const getTotals = (taskId: string) => {
      if (totals[taskId]) return totals[taskId];

      const task = tasks.find((t) => t.id === taskId);
      if (!task)
        return {
          plannedMaterial: 0,
          actualMaterial: 0,
          plannedLabor: 0,
          actualLabor: 0,
          plannedOther: 0,
          actualOther: 0,
          totalPlanned: 0,
          totalActual: 0,
        };

      const children = tasks.filter((t) => t.parentId === taskId);

      let plannedMaterial = 0;
      let actualMaterial = 0;
      let plannedLabor = 0;
      let actualLabor = 0;
      let plannedOther = 0;
      let actualOther = 0;

      const isOverhead = task.name === "Project Overhead" && task.isSystemGenerated;
        const budgetEntries = entries.filter((e) => (e.taskId === taskId || (isOverhead && !e.taskId)) && e.type === "Budget");
        const actualEntries = entries.filter((e) => (e.taskId === taskId || (isOverhead && !e.taskId)) && e.type === "Actual" && !e.isAccrual);

        const budgetMat = budgetEntries.filter((e) => e.category === "Material").reduce((sum, e) => sum + e.amount, 0);
        const budgetLab = budgetEntries.filter((e) => e.category === "Labor").reduce((sum, e) => sum + e.amount, 0);
        const budgetOther = budgetEntries.filter((e) => e.category !== "Material" && e.category !== "Labor").reduce((sum, e) => sum + e.amount, 0);

        plannedMaterial = (task.plannedMaterialCost || 0) + budgetMat;
        plannedLabor = (task.plannedLaborCost || 0) + budgetLab;
        plannedOther = (task.plannedOtherCost || 0) + budgetOther;

        const entryMat = actualEntries.filter((e) => e.category === "Material").reduce((sum, e) => sum + e.amount, 0);
        const logMat = dailyLogs.filter((log: any) => log.taskId === taskId).reduce((sum: number, log: any) => {
          return (
            sum +
            (log.materials || []).reduce((s: number, m: any) => {
              const invItem = inventory.find((i) => i.id === m.materialId);
              const unitCost = invItem ? (invItem.avgUnitCost || invItem.unitCost || 0) : 0;
              return s + m.quantity * unitCost;
            }, 0)
          );
        }, 0);
        const issueMat = materialIssues
          .filter((iss: any) => iss.taskId === taskId && !iss.remarks?.startsWith("Daily Progress") && !iss.notes?.startsWith("Daily Progress"))
          .reduce((sum: number, iss: any) => {
            if (iss.items && Array.isArray(iss.items)) {
              return sum + iss.items.reduce((s: number, it: any) => s + (it.totalPrice || 0), 0);
            } else if (iss.materialId) {
              const invItem = inventory.find((i) => i.id === iss.materialId);
              const unitCost = invItem ? (invItem.avgUnitCost || invItem.unitCost || 0) : 0;
              return sum + (iss.quantity || 0) * unitCost;
            }
            return sum;
          }, 0);
        actualMaterial = entryMat + logMat + issueMat;

        const entryLab = actualEntries.filter((e) => e.category === "Labor").reduce((sum, e) => sum + e.amount, 0);
        const logLab = laborLogs.filter((log) => log.items.some((item) => item.taskId === taskId)).reduce((sum, log) => sum + log.items.filter((item) => item.taskId === taskId).reduce((s, i) => s + i.cost, 0), 0);
        const dailyLogLab = dailyLogs.filter((log: any) => log.taskId === taskId).reduce((sum: number, log: any) => {
          return sum + (log.labour || []).reduce((s: number, l: any) => {
            const rateCard = laborRates.find((r: any) => r.id === l.roleId);
            const rate = rateCard ? rateCard.rate : 0;
            return s + (l.headcount || 0) * rate;
          }, 0);
        }, 0);
        actualLabor = entryLab + logLab + dailyLogLab;

        actualOther = actualEntries
          .filter((e) => e.category !== "Material" && e.category !== "Labor")
          .reduce((sum, e) => sum + e.amount, 0);

      if (children.length > 0) {
        children.forEach((child) => {
          const childTotals = getTotals(child.id);
          plannedMaterial += childTotals.plannedMaterial;
          actualMaterial += childTotals.actualMaterial;
          plannedLabor += childTotals.plannedLabor;
          actualLabor += childTotals.actualLabor;
          plannedOther += childTotals.plannedOther;
          actualOther += childTotals.actualOther;
        });
      }

      const totalPlanned = plannedMaterial + plannedLabor + plannedOther;
      const totalActual = actualMaterial + actualLabor + actualOther;

      totals[taskId] = {
        plannedMaterial,
        actualMaterial,
        plannedLabor,
        actualLabor,
        plannedOther,
        actualOther,
        totalPlanned,
        totalActual,
      };
      return totals[taskId];
    };

    tasks.forEach((t) => getTotals(t.id));
    return totals;
  }, [tasks, entries, dailyLogs, laborLogs, inventory, materialIssues, laborRates]);

  const getTaskTotals = (task: Task) => {
    return (
      taskTotalsMap[task.id] || {
        plannedMaterial: 0,
        actualMaterial: 0,
        plannedLabor: 0,
        actualLabor: 0,
        plannedOther: 0,
        actualOther: 0,
        totalPlanned: 0,
        totalActual: 0,
      }
    );
  };

  const stats = useMemo(() => {
    // Task-based costs
    const rootTasks = tasks.filter((t) => !t.parentId);

    let budgetedTasks = 0;
    let actualTasks = 0;

    // Category breakdown
    let materialPlanned = 0;
    let materialActual = 0;
    let laborPlanned = 0;
    let laborActual = 0;
    let otherPlanned = 0;
    let otherActual = 0;

    rootTasks.forEach((t) => {
      const totals = getTaskTotals(t);
      budgetedTasks += totals.totalPlanned;
      actualTasks += totals.totalActual;
      materialPlanned += totals.plannedMaterial;
      materialActual += totals.actualMaterial;
      laborPlanned += totals.plannedLabor;
      laborActual += totals.actualLabor;
      otherPlanned += totals.plannedOther;
      otherActual += totals.actualOther;
    });

    const totalBudgeted = budgetedTasks;
    const totalActual = actualTasks;

    const chartData = [
      { name: "Material", Budget: materialPlanned, Actual: materialActual },
      { name: "Labor", Budget: laborPlanned, Actual: laborActual },
      { name: "Direct Cost", Budget: otherPlanned, Actual: otherActual },
    ];

    return {
      totalBudgeted,
      totalActual,
      chartData,
      budgetedTasks,
      actualTasks,
      materialPlanned,
      materialActual,
      laborPlanned,
      laborActual,
      otherPlanned,
      otherActual,
    };
  }, [tasks, taskTotalsMap]);

  return { stats, taskTotalsMap, getTaskTotals };
};
