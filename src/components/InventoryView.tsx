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
  setDoc,
  writeBatch,
  handleFirestoreError,
  OperationType,
} from "../firebase";
import { exportToCSV, exportToPDF } from "../utils/exportUtils";
import { useTranslation } from "../i18n";
import { InventoryItem, Task } from "../types";
import {
  Package,
  Plus,
  MagnifyingGlass as Search,
  Warning as AlertTriangle,
  TrendUp as TrendingUp,
  CurrencyInr as IndianRupee,
  Trash as Trash2,
  PencilSimple as Edit2,
  BookmarkSimple,
  X,
  CheckCircle as CheckCircle2,
  Funnel as Filter,
  ArrowUpRight,
  ArrowDownRight,
  GearSix as Settings,
  FloppyDisk as Save,
  DownloadSimple as Download,
} from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { RoleGuard } from "./RoleGuard";
import { round2, round3, money, qty } from "../utils/num";
import {
  listMasterMaterials,
  saveMasterMaterial,
  findDuplicateMaterials,
  toProjectInventoryItem,
  MasterMaterial,
} from "../services/masterMaterialService";
import { CountUp } from "./motion";
import { VirtualTable } from "./VirtualTable";
import { useAuthStore } from "../store";
import { useProjectData } from "../hooks/useProjectData";
import { useTasksQuery } from "../hooks/queries";
import { useQueryClient } from "@tanstack/react-query";
import { useBreakpoint } from "../hooks/useBreakpoint";

interface InventoryViewProps {
  projectId: string;
}

export const InventoryView: React.FC<InventoryViewProps> = ({ projectId }) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;

  const breakpoint = useBreakpoint();
  const queryClient = useQueryClient();
  const { data: rawItems = [] } = useProjectData<InventoryItem>(projectId, "inventory");
  const { data: purchaseOrders = [] } = useProjectData<any>(projectId, "purchase_orders");
  const { data: grns = [] } = useProjectData<any>(projectId, "goodsReceiptNotes");

  const items = useMemo(() => {
    return (rawItems || []).map((item) => {
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

      const computedAvg = round2(totalQty > 0 ? totalCost / totalQty : (item.unitCost || 0));
      const effectiveUnitCost = item.unitCost > 0 ? item.unitCost : computedAvg;

      return {
        ...item,
        avgUnitCost: computedAvg,
        unitCost: effectiveUnitCost,
      };
    });
  }, [rawItems, grns, purchaseOrders]);

  const { data: tasks = [] } = useTasksQuery(projectId);
  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const [newItem, setNewItem] = useState<Partial<InventoryItem>>({
    name: "",
    materialId: "",
    category: "Material",
    groupCode: "",
    quantity: 0,
    unit: "MT",
    unitCost: 0,
    minThreshold: 10,
  });

  const [viewMode, setViewMode] = useState<
    "inventory" | "reconciliation" | "config"
  >("inventory");
  const [config, setConfig] = useState<{
    materialCodes: string[];
    groupCodes: string[];
    units: string[];
  }>({
    materialCodes: [],
    groupCodes: [],
    units: [],
  });

  const [editingConfig, setEditingConfig] = useState<{
    type: "materialCodes" | "groupCodes" | "units";
    index: number;
    value: string;
  } | null>(null);

  const [newConfigValue, setNewConfigValue] = useState({
    type: "materialCodes" as "materialCodes" | "groupCodes" | "units",
    value: "",
  });

  useEffect(() => {
    const configDoc = doc(
      db,
      `${basePath}/settings`,
      "inventoryConfig",
    );
    return onSnapshot(configDoc, (snapshot) => {
      if (snapshot.exists()) {
        setConfig(snapshot.data() as any);
      } else {
        setConfig({ materialCodes: [], groupCodes: [], units: [] });
      }
    });
  }, [projectId]);

  const updateConfig = async (newConfig: typeof config) => {
    try {
      await setDoc(
        doc(db, `${basePath}/settings`, "inventoryConfig"),
        newConfig,
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "inventoryConfig");
    }
  };

  const handleAddConfig = async () => {
    if (!newConfigValue.value.trim()) return;
    const key = newConfigValue.type;
    if (config[key].includes(newConfigValue.value.trim())) return;

    const updated = {
      ...config,
      [key]: [...config[key], newConfigValue.value.trim()].sort(),
    };
    await updateConfig(updated);
    setNewConfigValue({ ...newConfigValue, value: "" });
  };

  const handleDeleteConfig = async (
    type: keyof typeof config,
    index: number,
  ) => {
    const updatedList = [...config[type]];
    updatedList.splice(index, 1);
    await updateConfig({ ...config, [type]: updatedList });
  };

  const handleUpdateConfigValue = async () => {
    if (!editingConfig || !editingConfig.value.trim()) return;
    const updatedList = [...config[editingConfig.type]];
    updatedList[editingConfig.index] = editingConfig.value.trim();
    await updateConfig({ ...config, [editingConfig.type]: updatedList.sort() });
    setEditingConfig(null);
  };

  const checkAndSaveConfig = async (item: Partial<InventoryItem>) => {
    let updated = false;
    const newConfig = { ...config };

    if (item.materialId && !config.materialCodes.includes(item.materialId)) {
      newConfig.materialCodes = [
        ...config.materialCodes,
        item.materialId,
      ].sort();
      updated = true;
    }
    if (item.groupCode && !config.groupCodes.includes(item.groupCode)) {
      newConfig.groupCodes = [...config.groupCodes, item.groupCode].sort();
      updated = true;
    }
    if (item.unit && !config.units.includes(item.unit)) {
      newConfig.units = [...config.units, item.unit].sort();
      updated = true;
    }

    if (updated) {
      await updateConfig(newConfig);
    }
  };

  const [customFields, setCustomFields] = useState({
    materialId: false,
    groupCode: false,
    unit: false,
  });

  const handleSelectCustom = (
    field: keyof typeof customFields,
    value: string,
  ) => {
    if (value === "ADD_CUSTOM") {
      setCustomFields((prev) => ({ ...prev, [field]: true }));
      if (editingItem) {
        setEditingItem({ ...editingItem, [field]: "" });
      } else {
        setNewItem({ ...newItem, [field]: "" });
      }
    } else {
      if (editingItem) {
        setEditingItem({ ...editingItem, [field]: value });
      } else {
        setNewItem({ ...newItem, [field]: value });
      }
    }
  };

  const invalidateData = () => {
    queryClient.invalidateQueries({ queryKey: ["projectData", projectId] });
  };

  // ---- Organisation material master ----
  // Picking a master COPIES its definition in and opens the stock at zero, so
  // quantity and landed cost remain this project's own.
  const [masterMaterials, setMasterMaterials] = useState<MasterMaterial[]>([]);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [masterBusy, setMasterBusy] = useState(false);
  useEffect(() => {
    listMasterMaterials().then(setMasterMaterials);
  }, []);

  const addMaterialFromMaster = async (m: MasterMaterial) => {
    const already = (rawItems || []).find(
      (i: any) => i.masterMaterialId === m.id ||
        (i.name || "").trim().toLowerCase() === m.name.trim().toLowerCase(),
    );
    if (already) {
      alert(`"${m.name}" is already stocked on this project.`);
      return;
    }
    setMasterBusy(true);
    try {
      await addDoc(collection(db, `${basePath}/inventory`), toProjectInventoryItem(m, projectId));
      invalidateData();
      setShowMaterialPicker(false);
    } catch (err) {
      console.error("Add material from master failed", err);
      alert("Couldn't add that material. Please try again.");
    } finally {
      setMasterBusy(false);
    }
  };

  // Stored numbers written before rounding was applied at source still carry
  // float noise (a weighted average is a division). Display already rounds, so
  // this only repairs what is stored. Checked against rawItems — the live
  // `items` overlay is already rounded, so it would report nothing to do.
  const untidyItems = (rawItems || []).filter((i: any) => {
    const m2 = (v: any) => v != null && Number.isFinite(Number(v)) && round2(v) !== v;
    const m3 = (v: any) => v != null && Number.isFinite(Number(v)) && round3(v) !== v;
    return m2(i.unitCost) || m2(i.avgUnitCost) || m3(i.quantity) || m3(i.consumed) || m3(i.minThreshold);
  });

  const tidyStoredNumbers = async () => {
    if (!untidyItems.length) return;
    if (!window.confirm(
      `Round stored numbers on ${untidyItems.length} item${untidyItems.length === 1 ? "" : "s"}?\n\n` +
      `Costs go to 2 decimals, quantities to 3. Only these numeric fields change — ` +
      `no stock movement is recorded and nothing else about the item is touched.`,
    )) return;
    setMasterBusy(true);
    try {
      // Chunked: Firestore batches cap at 500 writes.
      for (let start = 0; start < untidyItems.length; start += 400) {
        const slice = untidyItems.slice(start, start + 400);
        const batch = writeBatch(db);
        for (const i of slice) {
          const patch: Record<string, number> = {};
          if (i.unitCost != null) patch.unitCost = round2(i.unitCost);
          if (i.avgUnitCost != null) patch.avgUnitCost = round2(i.avgUnitCost);
          if (i.quantity != null) patch.quantity = round3(i.quantity);
          if (i.consumed != null) patch.consumed = round3(i.consumed);
          if (i.minThreshold != null) patch.minThreshold = round3(i.minThreshold);
          batch.set(doc(db, `${basePath}/inventory`, i.id), patch, { merge: true });
        }
        await batch.commit();
      }
      invalidateData();
      alert(`Tidied ${untidyItems.length} item${untidyItems.length === 1 ? "" : "s"}.`);
    } catch (err: any) {
      console.error("Tidy stored numbers failed", err);
      alert(
        err?.code === "permission-denied"
          ? "You don't have permission to change stock records."
          : "Couldn't tidy those values. Please try again.",
      );
    } finally { setMasterBusy(false); }
  };

  // Lift a project material up to the organisation master. Only the definition
  // travels — stock, average cost and consumption stay with the project.
  const definitionOf = (item: any) => ({
    name: item.name,
    code: item.code || item.materialId || "",
    category: item.category || "Material",
    unit: item.unit || "Nos",
    hsn: item.hsn || "",
    gstRate: item.gstRate ?? 18,
    // The item's own cost is a landed cost for THIS site, so it is carried up
    // only as an indicative reference.
    indicativeRate: round2(item.avgUnitCost || item.unitCost || 0),
    minThreshold: item.minThreshold ?? 0,
  });

  const promoteMaterial = async (item: any) => {
    const dupes = findDuplicateMaterials(definitionOf(item), masterMaterials);
    if (dupes.length) {
      if (!window.confirm(
        `"${dupes[0].name}" already looks like the same item in your master list.\n\nSave "${item.name}" anyway as a separate entry?`,
      )) return;
    } else if (!window.confirm(
      `Save "${item.name}" to your organisation master?\n\nOnly the definition is shared — stock and cost stay with this project.`,
    )) return;
    setMasterBusy(true);
    try {
      await saveMasterMaterial(definitionOf(item));
      setMasterMaterials(await listMasterMaterials());
      alert(`"${item.name}" is now available on every project in your organisation.`);
    } catch (err: any) {
      alert(
        err?.code === "permission-denied"
          ? "Only an Owner, Admin or Manager can update the organisation master."
          : "Couldn't save to the master list. Please try again.",
      );
    } finally { setMasterBusy(false); }
  };

  // Bulk lift: everything on this project that isn't in the master yet. This is
  // the path for a project that already has its materials entered.
  const promoteAllMaterials = async () => {
    const missing = (rawItems || []).filter(
      (i: any) => findDuplicateMaterials(definitionOf(i), masterMaterials).length === 0,
    );
    if (!missing.length) {
      alert("Every material on this project is already in your master list.");
      return;
    }
    if (!window.confirm(
      `Save ${missing.length} material${missing.length === 1 ? "" : "s"} to your organisation master?\n\n` +
      missing.slice(0, 12).map((i: any) => `• ${i.name}`).join("\n") +
      (missing.length > 12 ? `\n…and ${missing.length - 12} more` : "") +
      `\n\nOnly definitions are shared — stock and cost stay with this project. Items already in the master are skipped.`,
    )) return;
    setMasterBusy(true);
    let ok = 0;
    const failed: string[] = [];
    try {
      for (const item of missing) {
        try { await saveMasterMaterial(definitionOf(item)); ok++; }
        catch { failed.push(item.name); }
      }
      setMasterMaterials(await listMasterMaterials());
      alert(
        failed.length
          ? `Saved ${ok}. Couldn't save ${failed.length}: ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? "…" : ""}`
          : `Saved ${ok} material${ok === 1 ? "" : "s"} to your master list.`,
      );
    } finally { setMasterBusy(false); }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const path = `${basePath}/inventory`;
    const finalMaterialId =
      newItem.materialId ||
      `MAT-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    try {
      await addDoc(collection(db, path), {
        ...newItem,
        materialId: finalMaterialId,
        projectId,
      });
      await checkAndSaveConfig({ ...newItem, materialId: finalMaterialId });
      setIsAdding(false);
      setNewItem({
        name: "",
        materialId: "",
        category: "Material",
        groupCode: "",
        quantity: 0,
        unit: "MT",
        unitCost: 0,
        minThreshold: 10,
      });
      setCustomFields({ materialId: false, groupCode: false, unit: false });
      invalidateData();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    const path = `${basePath}/inventory/${editingItem.id}`;
    try {
      const { id, quantity: _ignoreQuantity, ...data } = editingItem;
      await updateDoc(doc(db, `${basePath}/inventory`, id), data);
      await checkAndSaveConfig(data);
      setEditingItem(null);
      setCustomFields({ materialId: false, groupCode: false, unit: false });
      invalidateData();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    const id = itemToDelete.id;
    const path = `${basePath}/inventory/${id}`;
    try {
      await deleteDoc(doc(db, `${basePath}/inventory`, id));
      setItemToDelete(null);
      invalidateData();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const categories = useMemo(
    () => ["All", ...new Set(items.map((i) => i.category))],
    [items],
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.materialId &&
          item.materialId.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory =
        categoryFilter === "All" || item.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [items, searchTerm, categoryFilter]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, InventoryItem[]> = {};
    filteredItems.forEach((item) => {
      const group = item.groupCode || item.category || "Other";
      if (!groups[group]) groups[group] = [];
      groups[group].push(item);
    });
    return groups;
  }, [filteredItems]);

  const handleExportCSV = () => {
    const headers = [
      "Material ID",
      "Item Name",
      "Category",
      "Group Code",
      "In Stock Qty",
      "Unit",
      "Unit Cost (₹)",
      "Total Value (₹)",
      "Min Threshold",
    ];
    const rows = filteredItems.map((item) => {
      const avail = Math.max(0, item.quantity - (item.consumed || 0));
      const cost = item.effectiveUnitCost || item.unitCost || 0;
      return [
        item.materialId || "-",
        item.name || "",
        item.category || "Material",
        item.groupCode || "-",
        avail,
        item.unit || "MT",
        cost,
        avail * cost,
        item.minThreshold || 0,
      ];
    });
    const dateStr = new Date().toISOString().split("T")[0];
    exportToCSV(`Inventory_Stock_${dateStr}`, headers, rows);
  };

  const handleExportPDF = () => {
    const headers = [
      "Material ID",
      "Item Name",
      "Category",
      "Stock Qty",
      "Unit",
      "Unit Cost (₹)",
      "Total Value (₹)",
    ];
    const rows = filteredItems.map((item) => {
      const avail = Math.max(0, item.quantity - (item.consumed || 0));
      const cost = item.effectiveUnitCost || item.unitCost || 0;
      return [
        item.materialId || "-",
        item.name || "",
        item.category || "Material",
        avail,
        item.unit || "MT",
        `₹${cost.toLocaleString("en-IN")}`,
        `₹${(avail * cost).toLocaleString("en-IN")}`,
      ];
    });
    const dateStr = new Date().toISOString().split("T")[0];
    exportToPDF(
      "SITE INVENTORY STOCK REPORT",
      `Project ID: ${projectId} | Total Items: ${filteredItems.length}`,
      headers,
      rows,
      `Inventory_Stock_${dateStr}`
    );
  };

  const [physicalCounts, setPhysicalCounts] = useState<Record<string, number>>(
    {},
  );

  const handleReconcile = async (item: InventoryItem) => {
    const count = physicalCounts[item.id];
    const available = item.quantity - (item.consumed || 0);
    if (count === undefined || count === available) return;

    const path = `${basePath}/inventory/${item.id}`;
    try {
      await updateDoc(doc(db, `${basePath}/inventory`, item.id), {
        quantity: count + (item.consumed || 0),
      });
      const newCounts = { ...physicalCounts };
      delete newCounts[item.id];
      setPhysicalCounts(newCounts);
      invalidateData();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const stats = useMemo(() => {
    const totalValue = items.reduce(
      (acc, curr) =>
        acc + (curr.quantity - (curr.consumed || 0)) * curr.unitCost,
      0,
    );
    const lowStock = items.filter(
      (item) => item.quantity - (item.consumed || 0) <= item.minThreshold,
    ).length;
    // Consumption is summed from daily logs and is never checked against what
    // was received, so an item can go negative. That is not a bad log -- it
    // means goods receipts were not entered. Surface the cause rather than
    // leaving an unexplained negative valuation on screen.
    const overConsumed = items.filter(
      (item) => item.quantity - (item.consumed || 0) < 0,
    ).length;

    const rootTasks = tasks.filter((t) => !t.parentId);
    const allocatedCost = rootTasks.reduce((acc, task) => {
      const taskResCost = (task.resources || []).reduce(
        (tAcc, res) => tAcc + res.quantity * res.costPerUnit,
        0,
      );
      return acc + taskResCost;
    }, 0);

    return { totalValue, lowStock, allocatedCost, overConsumed };
  }, [items, tasks]);

  return (
    <div className="space-y-6 md:space-y-12 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 md:gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1 md:mb-2">
            <div className="bg-surface-dark p-1.5 md:p-2 rounded-xl shadow-lg">
              <Package className="w-3 h-3 md:w-4 md:h-4 text-white" />
            </div>
            <span className="text-[8px] md:text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              Inventory Management
            </span>
          </div>
          <h2 className="text-xl md:text-3xl font-bold text-ink tracking-tight">
            {t("views.stockInventory")}
          </h2>
          <p className="text-ink-muted font-medium mt-1 text-[10px] md:text-sm">
            Monitor and manage material logistics and resource orchestration.
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6">
        <div className="bg-surface-dark p-4 md:p-5 rounded-2xl text-white relative overflow-hidden group shadow-xl">
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-2 mb-2 md:mb-6">
              <div className="bg-onyx/40 p-2 md:p-3 rounded-xl border border-white/10">
                <IndianRupee className="w-3.5 h-3.5 md:w-5 md:h-5 text-white" />
              </div>
              <span className="text-[8px] md:text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                Inventory Value
              </span>
            </div>
            <p className="text-[8px] md:text-[10px] font-bold text-white/40 mb-0.5 md:mb-1 uppercase tracking-widest">
              Total Valuation
            </p>
            <h3 className="text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold tracking-tight tabular-nums">
              ₹
              <CountUp
                value={stats.totalValue}
                format={(n) => money(n)}
              />
            </h3>
            {stats.overConsumed > 0 && (
              <p className="mt-2 text-[10px] md:text-[11px] font-bold text-amber-300 leading-snug">
                {stats.overConsumed} item{stats.overConsumed > 1 ? "s" : ""} logged
                more usage than stock received — record the missing goods receipts.
              </p>
            )}
          </div>
        </div>

        <div className="bg-surface p-4 md:p-5 rounded-2xl border border-divider shadow-sm relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-2 mb-2 md:mb-6">
              <div className="bg-success/12 p-2 md:p-3 rounded-xl shadow-sm text-success">
                <TrendingUp className="w-3.5 h-3.5 md:w-5 md:h-5" />
              </div>
              <span className="text-[8px] md:text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600/50">
                Fiscal Scope
              </span>
            </div>
            <p className="text-[8px] md:text-[10px] font-bold text-ink-muted mb-0.5 md:mb-1 uppercase tracking-widest">
              Allocated
            </p>
            <h3 className="text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold text-ink tracking-tight tabular-nums">
              ₹
              <CountUp
                value={stats.allocatedCost}
                format={(n) => money(n)}
              />
            </h3>
          </div>
        </div>

        <div className="bg-surface p-4 md:p-5 rounded-2xl border border-divider shadow-sm relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-2 mb-2 md:mb-6">
              <div className="bg-danger/8 p-2 md:p-3 rounded-xl shadow-sm text-danger">
                <AlertTriangle className="w-3.5 h-3.5 md:w-5 md:h-5" />
              </div>
              <span className="text-[8px] md:text-[10px] font-bold uppercase tracking-[0.2em] text-red-600/50">
                Supply Risk
              </span>
            </div>
            <p className="text-[8px] md:text-[10px] font-bold text-ink-muted mb-0.5 md:mb-1 uppercase tracking-widest">
              Low Stock
            </p>
            <h3 className="text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold text-ink tracking-tight tabular-nums">
              <CountUp value={stats.lowStock} />{" "}
              <span className="text-[10px] md:text-xs font-bold text-ink-muted ml-1">
                Units
              </span>
            </h3>
          </div>
        </div>
      </div>

      {/* Controls Section */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-panel p-3 md:p-4 rounded-2xl border border-divider shadow-sm">
        <div className="flex flex-col md:flex-row gap-3 w-full lg:w-auto lg:min-w-0 lg:flex-1 items-center">
          <div className="flex bg-panel p-1 rounded-xl w-full md:flex-1 md:min-w-0 border border-divider overflow-x-auto">
            <button
              onClick={() => setViewMode("inventory")}
              className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider apple-transition whitespace-nowrap ${viewMode === "inventory" ? "bg-surface shadow-sm text-primary" : "text-ink-muted hover:text-ink"}`}
            >
              Stock Ledger
            </button>
            <button
              onClick={() => setViewMode("reconciliation")}
              className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider apple-transition whitespace-nowrap ${viewMode === "reconciliation" ? "bg-surface shadow-sm text-primary" : "text-ink-muted hover:text-ink"}`}
            >
              Reconciliation
            </button>
            <button
              onClick={() => setViewMode("config")}
              className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider apple-transition whitespace-nowrap ${viewMode === "config" ? "bg-surface shadow-sm text-primary" : "text-ink-muted hover:text-ink"}`}
            >
              Configuration
            </button>
          </div>
          <div className="relative w-full md:w-64 lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" />
            <input
              placeholder="Search items..."
              className="w-full pl-9 pr-4 py-2 bg-panel border border-transparent focus:border-primary focus:bg-surface rounded-xl outline-none apple-transition text-[10px] md:text-xs font-bold"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 w-full lg:flex-1 lg:min-w-0 lg:flex-wrap lg:justify-end overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-widest apple-transition whitespace-nowrap ${
                categoryFilter === cat
                  ? "bg-surface-dark text-white"
                  : "bg-surface text-ink-muted hover:bg-panel border border-divider"
              }`}
            >
              {cat}
            </button>
          ))}
          <div className="w-px h-4 bg-divider mx-1" />
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface hover:bg-panel border border-divider rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-widest text-ink transition cursor-pointer"
          >
            <Download className="w-3 h-3 text-ink/80" />
            <span>CSV</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#C0653F] hover:bg-[#A0522F] text-white rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-widest transition shadow-sm cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span>PDF</span>
          </button>
          <RoleGuard
            allowedRoles={["Project Manager", "Site Engineer"]}
            projectId={projectId}
            requireWriteAccess
            fallback={
              <button
                disabled
                className="bg-divider text-ink-muted w-full sm:w-auto px-6 py-3 md:px-4 md:py-2 rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 cursor-not-allowed cursor-help"
                title="You don't have permission to add items"
              >
                <Plus className="w-3 h-3" /> <span>Add Item</span>
              </button>
            }
          >
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button
              onClick={() => setShowMaterialPicker(true)}
              className="bg-panel border border-divider text-ink w-full sm:w-auto px-5 py-3 md:px-4 md:py-2 rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-surface apple-transition"
              title="Reuse a material saved for your organisation"
            >
              <span>From master{masterMaterials.length ? ` (${masterMaterials.length})` : ""}</span>
            </button>
            <button
              onClick={promoteAllMaterials}
              disabled={masterBusy || !rawItems.length}
              className="bg-panel border border-divider text-ink w-full sm:w-auto px-5 py-3 md:px-4 md:py-2 rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-surface apple-transition disabled:opacity-40"
              title="Add this project's materials to your organisation master"
            >
              <BookmarkSimple className="w-3.5 h-3.5" /> <span>Save to master</span>
            </button>
            <button
              onClick={() => setIsAdding(true)}
              className="bg-primary text-white w-full sm:w-auto px-6 py-3 md:px-4 md:py-2 rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#B85F3B] apple-transition shadow-lg shadow-primary/20"
            >
              <Plus className="w-3 h-3" /> <span>Add Item</span>
            </button>
            </div>
          </RoleGuard>
        </div>
      </div>

      {untidyItems.length > 0 && (
        <div className="flex items-start justify-between gap-3 p-4 rounded-2xl bg-primary/8 border border-primary/25">
          <p className="text-[13px] text-ink">
            {untidyItems.length} item{untidyItems.length === 1 ? "" : "s"} store a cost or quantity with
            extra decimal places, from before rounding was applied.
            <span className="block text-ink-muted mt-0.5">
              Displayed values are already rounded — this cleans what's stored. No stock movement is recorded.
            </span>
          </p>
          <button
            onClick={tidyStoredNumbers}
            disabled={masterBusy}
            className="shrink-0 px-4 py-2 rounded-xl bg-primary text-white text-[11px] font-bold uppercase tracking-widest disabled:opacity-50"
          >
            {masterBusy ? "Working…" : "Tidy"}
          </button>
        </div>
      )}

      {/* Inventory Grid */}
      <div className="bg-surface rounded-2xl shadow-sm border border-divider overflow-hidden">
        <div className="overflow-x-auto">
          {filteredItems.length === 0 ? (
            <div className="px-10 py-24 text-center">
              <div className="bg-panel w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-divider shadow-inner">
                <Package className="w-8 h-8 text-ink-muted" />
              </div>
              <h3 className="text-xl font-bold text-ink mb-1">
                No items found
              </h3>
              <p className="text-ink-muted text-sm font-medium">
                Try adjusting your search or filters.
              </p>
            </div>
          ) : viewMode === "inventory" ? (
            <div className="bg-surface">
              {breakpoint === "desktop" ? (
                <VirtualTable<InventoryItem>
                  data={filteredItems}
                  keyExtractor={(item) => item.id}
                  rowHeight={64}
                  className="h-[60vh] min-h-[400px]"
                  columns={[
                    {
                      key: "materialId",
                      header: "Code",
                      width: "120px",
                      sortable: true,
                      sortAccessor: (item) => item.materialId || "",
                      render: (item) => (
                        <span className="font-mono text-[10px] md:text-[10px] font-bold text-ink-muted bg-panel px-2 py-0.5 rounded border border-divider">
                          {item.materialId || "N/A"}
                        </span>
                      ),
                    },
                    {
                      key: "name",
                      header: "Item Name",
                      width: "minmax(200px, 1fr)",
                      sortable: true,
                      sortAccessor: (item) => item.name,
                      render: (item) => (
                        <div>
                          <div className="font-bold text-ink text-[10px] md:text-sm tracking-tight mb-0.5 truncate">
                            {item.name}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">
                              {item.unit}
                            </span>
                            {item.quantity - (item.consumed || 0) <=
                              item.minThreshold && (
                              <span className="text-[10px] font-bold text-danger uppercase tracking-widest bg-danger/8 px-1.5 py-0.5 rounded border border-danger/20">
                                Low Stock
                              </span>
                            )}
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "groupCode",
                      header: "Group",
                      width: "120px",
                      sortable: true,
                      sortAccessor: (item) => item.groupCode || item.category,
                      render: (item) => (
                        <span className="text-[10px] md:text-xs font-bold text-ink-muted uppercase tracking-[0.1em]">
                          {item.groupCode || item.category || "Other"}
                        </span>
                      ),
                    },
                    {
                      key: "quantity",
                      header: "Available Stock",
                      width: "100px",
                      sortable: true,
                      sortAccessor: (item) =>
                        item.quantity - (item.consumed || 0),
                      render: (item) => (
                        <div
                          className={`text-xs md:text-base font-bold ${item.quantity - (item.consumed || 0) <= item.minThreshold ? "text-danger" : "text-ink"}`}
                        >
                          {qty(item.quantity - (item.consumed || 0))}
                        </div>
                      ),
                    },
                    {
                      key: "unitCost",
                      header: "Unit Cost",
                      width: "100px",
                      sortable: true,
                      sortAccessor: (item) => item.unitCost,
                      render: (item) => (
                        <span className="text-[10px] md:text-xs font-mono text-ink-muted">
                          ₹
                          {money(item.unitCost)}
                        </span>
                      ),
                    },
                    {
                      key: "totalValue",
                      header: "Total Value",
                      width: "120px",
                      sortable: true,
                      sortAccessor: (item) =>
                        (item.quantity - (item.consumed || 0)) * item.unitCost,
                      render: (item) => (
                        <div className="font-bold text-ink text-xs md:text-base font-mono">
                          ₹
                          {money((item.quantity - (item.consumed || 0)) * item.unitCost)}
                        </div>
                      ),
                    },
                    {
                      key: "actions",
                      header: "Actions",
                      width: "100px",
                      render: (item) => (
                        <div className="flex gap-1 justify-end transition-opacity">
                          <button
                            onClick={() => setEditingItem(item)}
                            className="p-1.5 hover:bg-surface rounded-lg text-ink-muted hover:text-primary border border-transparent hover:border-divider"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setItemToDelete(item)}
                            className="p-1.5 hover:bg-surface rounded-lg text-ink-muted hover:text-danger border border-transparent hover:border-divider"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ),
                    },
                  ]}
                />
              ) : (
                <div className="flex flex-col gap-2 p-4 h-[60vh] min-h-[400px] overflow-y-auto bg-panel/30">
                  {filteredItems.map(item => (
                    <div className="bg-surface p-4 rounded-2xl border border-divider/40 shadow-sm" key={item.id}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-ink text-sm tracking-tight truncate">{item.name}</div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="font-mono text-[10px] font-bold text-ink-muted bg-panel px-1.5 py-0.5 rounded border border-divider">
                              {item.materialId || "N/A"}
                            </span>
                            <span className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">{item.groupCode || item.category}</span>
                            {(item.quantity - (item.consumed || 0)) <= item.minThreshold && (
                              <span className="text-[10px] font-bold text-danger uppercase tracking-widest bg-danger/8 px-1.5 py-0.5 rounded border border-danger/20">
                                Low Stock
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0 ml-2">
                          <button onClick={() => setEditingItem(item)} className="p-2 bg-panel rounded-lg text-ink-muted hover:text-primary transition-colors">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => promoteMaterial(item)}
                            disabled={masterBusy}
                            className={`p-2 bg-panel rounded-lg transition-colors disabled:opacity-40 ${
                              (item as any).masterMaterialId ? "text-primary" : "text-ink-muted hover:text-primary"
                            }`}
                            title={
                              (item as any).masterMaterialId
                                ? "Linked to your organisation master"
                                : "Save this material to your organisation master"
                            }
                          >
                            <BookmarkSimple className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setItemToDelete(item)} className="p-2 bg-panel rounded-lg text-ink-muted hover:text-danger transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-3 pt-3 border-t border-divider/60">
                        <div className="flex-1">
                          <p className="text-[8px] font-black text-ink-muted uppercase tracking-widest mb-0.5">Stock</p>
                          <p className="text-[13px] font-mono font-black text-ink">{qty(item.quantity - (item.consumed || 0))} {item.unit}</p>
                        </div>
                        <div className="flex-1">
                          <p className="text-[8px] font-black text-ink-muted uppercase tracking-widest mb-0.5">Unit Cost</p>
                          <p className="text-[13px] font-mono font-black text-ink">₹{money(item.unitCost)}</p>
                        </div>
                        <div className="flex-1">
                          <p className="text-[8px] font-black text-ink-muted uppercase tracking-widest mb-0.5">Value</p>
                          <p className="text-[13px] font-mono font-black text-ink">₹{money((item.quantity - (item.consumed || 0)) * item.unitCost)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : viewMode === "reconciliation" ? (
            <div>
              <div className="mx-3 md:mx-6 mt-4 mb-2 p-3 bg-[#F7E4DB] border border-[#F7E4DB] rounded-lg text-xs text-[#B85F3B]">
                <span className="font-bold">Note:</span> Reconciliation
                adjustments may be superseded by the next recorded Goods
                Receipt, since GRN-derived totals recompute from receipt
                history.
              </div>
              {breakpoint === "desktop" ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-dark text-white/50">
                      <th className="px-3 md:px-6 py-2 md:py-3 text-[10px] md:text-xs font-bold uppercase tracking-widest text-white/80">
                        Item Name
                      </th>
                      <th className="px-3 md:px-6 py-2 md:py-3 text-[10px] md:text-xs font-bold uppercase tracking-widest text-white/30 text-center">
                        System Qty
                      </th>
                      <th className="px-3 md:px-6 py-2 md:py-3 text-[10px] md:text-xs font-bold uppercase tracking-widest text-white/80 text-center">
                        Physical Count
                      </th>
                      <th className="px-3 md:px-6 py-2 md:py-3 text-[10px] md:text-xs font-bold uppercase tracking-widest text-white/80 text-center">
                        Variance
                      </th>
                      <th className="px-3 md:px-6 py-2 md:py-3 text-[10px] md:text-xs font-bold uppercase tracking-widest text-white/30 text-right">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider/40">
                    {(
                      Object.entries(groupedItems) as [string, InventoryItem[]][]
                    ).map(([group, items]) => (
                      <React.Fragment key={group}>
                        <tr className="bg-panel/50">
                          <td
                            colSpan={5}
                            className="px-6 py-1.5 text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-ink-muted border-y border-divider"
                          >
                            {group}
                          </td>
                        </tr>
                        {items.map((item) => {
                          const available = item.quantity - (item.consumed || 0);
                          const variance =
                            (physicalCounts[item.id] !== undefined
                              ? physicalCounts[item.id]
                              : available) - available;
                          return (
                            <tr
                              key={item.id}
                              className="hover:bg-panel/50 apple-transition group"
                            >
                              <td className="px-6 py-3">
                                <div className="font-bold text-ink text-[10px] md:text-sm tracking-tight">
                                  {item.name}
                                </div>
                                <div className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">
                                  {item.materialId}
                                </div>
                              </td>
                              <td className="px-6 py-3 text-center">
                                <div className="text-[10px] md:text-sm font-bold text-ink-muted">
                                  {available.toFixed(1)}
                                </div>
                              </td>
                              <td className="px-6 py-3 text-center">
                                <div className="flex justify-center">
                                  <input
                                    type="number"
                                    className="w-16 md:w-20 bg-surface border border-divider rounded-lg px-2 py-1 text-[10px] md:text-sm font-bold outline-none focus:border-primary text-center"
                                    value={physicalCounts[item.id] ?? available}
                                    onChange={(e) =>
                                      setPhysicalCounts({
                                        ...physicalCounts,
                                        [item.id]:
                                          parseFloat(e.target.value) || 0,
                                      })
                                    }
                                  />
                                </div>
                              </td>
                              <td className="px-6 py-3 text-center">
                                <div
                                  className={`text-[10px] md:text-xs font-bold font-mono px-2 py-1 rounded-lg ${Math.abs(variance) < 0.05 ? "text-ink-muted" : variance > 0 ? "bg-success/12 text-success" : "bg-danger/8 text-danger"}`}
                                >
                                  {variance > 0 ? "+" : ""}
                                  {variance.toFixed(1)} {item.unit}
                                </div>
                              </td>
                              <td className="px-6 py-3 text-right">
                                <button
                                  disabled={
                                    physicalCounts[item.id] === undefined ||
                                    physicalCounts[item.id] === available
                                  }
                                  onClick={() => handleReconcile(item)}
                                  className={`px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-widest apple-transition ${
                                    physicalCounts[item.id] === undefined ||
                                    physicalCounts[item.id] === available
                                      ? "bg-panel text-ink-muted pointer-events-none"
                                      : "bg-success text-white hover:bg-success shadow-sm"
                                  }`}
                                >
                                  Sync
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex flex-col gap-2 p-4">
                  {(Object.entries(groupedItems) as [string, InventoryItem[]][]).map(([group, items]) => (
                    <React.Fragment key={group}>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted px-1 mt-2">{group}</p>
                      {items.map((item) => {
                        const available = item.quantity - (item.consumed || 0);
                        const variance = (physicalCounts[item.id] !== undefined ? physicalCounts[item.id] : available) - available;
                        const hasChange = physicalCounts[item.id] !== undefined && physicalCounts[item.id] !== available;
                        return (
                          <div key={item.id} className="bg-surface p-4 rounded-2xl border border-divider/40 shadow-sm">
                            <div className="flex justify-between items-start mb-3">
                              <div className="font-bold text-ink text-sm tracking-tight">{item.name}</div>
                              <div className={`text-[10px] font-bold font-mono px-2 py-1 rounded-lg ${Math.abs(variance) < 0.05 ? "text-ink-muted bg-panel" : variance > 0 ? "bg-success/12 text-success" : "bg-danger/8 text-danger"}`}>
                                {variance > 0 ? "+" : ""}{variance.toFixed(1)} {item.unit}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <p className="text-[8px] font-black text-ink-muted uppercase tracking-widest mb-1">System Qty</p>
                                <p className="text-sm font-bold text-ink-muted">{available.toFixed(1)}</p>
                              </div>
                              <div className="flex-1">
                                <p className="text-[8px] font-black text-ink-muted uppercase tracking-widest mb-1">Physical Count</p>
                                <input
                                  type="number"
                                  className="w-full bg-panel border border-divider rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-primary text-center"
                                  value={physicalCounts[item.id] ?? available}
                                  onChange={(e) => setPhysicalCounts({ ...physicalCounts, [item.id]: parseFloat(e.target.value) || 0 })}
                                />
                              </div>
                            </div>
                            <button
                              disabled={!hasChange}
                              onClick={() => handleReconcile(item)}
                              className={`w-full mt-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest apple-transition ${hasChange ? "bg-success text-white hover:bg-success shadow-sm" : "bg-panel text-ink-muted pointer-events-none"}`}
                            >
                              Sync
                            </button>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-5">
              <div className="max-w-4xl mx-auto space-y-12">
                <div>
                  <h3 className="text-sm font-black text-ink uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary" />
                    List Management
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Material Codes */}
                    <div className="space-y-3 md:space-y-4">
                      <div className="bg-panel p-3 md:p-4 rounded-2xl border border-divider">
                        <label className="text-[10px] md:text-xs font-black text-ink-muted uppercase tracking-widest block mb-3 md:mb-4">
                          Item Codes
                        </label>
                        <div className="space-y-1.5 md:space-y-2 max-h-60 overflow-y-auto pr-2">
                          {config.materialCodes.map((code, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between group gap-2"
                            >
                              {editingConfig?.type === "materialCodes" &&
                              editingConfig.index === idx ? (
                                <input
                                  autoFocus
                                  className="flex-1 bg-surface border border-primary rounded px-2 py-0.5 text-[10px] md:text-xs font-bold outline-none"
                                  value={editingConfig.value}
                                  onChange={(e) =>
                                    setEditingConfig({
                                      ...editingConfig,
                                      value: e.target.value,
                                    })
                                  }
                                  onBlur={handleUpdateConfigValue}
                                  onKeyPress={(e) =>
                                    e.key === "Enter" &&
                                    handleUpdateConfigValue()
                                  }
                                />
                              ) : (
                                <span className="text-[10px] md:text-xs font-bold text-ink truncate flex-1">
                                  {code}
                                </span>
                              )}
                              <div className="flex gap-1 transition-opacity">
                                <button
                                  onClick={() =>
                                    setEditingConfig({
                                      type: "materialCodes",
                                      index: idx,
                                      value: code,
                                    })
                                  }
                                  className="text-ink-muted hover:text-primary transition-colors"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() =>
                                    handleDeleteConfig("materialCodes", idx)
                                  }
                                  className="text-ink-muted hover:text-danger transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex gap-2">
                          <input
                            className="flex-1 bg-surface border border-divider rounded-lg px-2.5 py-1.5 text-[10px] md:text-xs font-bold outline-none focus:border-primary"
                            placeholder="Add Code..."
                            value={
                              newConfigValue.type === "materialCodes"
                                ? newConfigValue.value
                                : ""
                            }
                            onChange={(e) =>
                              setNewConfigValue({
                                type: "materialCodes",
                                value: e.target.value,
                              })
                            }
                            onKeyPress={(e) =>
                              e.key === "Enter" && handleAddConfig()
                            }
                          />
                          <button
                            onClick={() => {
                              setNewConfigValue({
                                type: "materialCodes",
                                value: newConfigValue.value,
                              });
                              handleAddConfig();
                            }}
                            className="p-1 bg-primary text-white rounded-lg"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Group Codes */}
                    <div className="space-y-3 md:space-y-4">
                      <div className="bg-panel p-3 md:p-4 rounded-2xl border border-divider">
                        <label className="text-[10px] md:text-xs font-black text-ink-muted uppercase tracking-widest block mb-3 md:mb-4">
                          Group Codes
                        </label>
                        <div className="space-y-1.5 md:space-y-2 max-h-60 overflow-y-auto pr-2">
                          {config.groupCodes.map((group, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between group gap-2"
                            >
                              {editingConfig?.type === "groupCodes" &&
                              editingConfig.index === idx ? (
                                <input
                                  autoFocus
                                  className="flex-1 bg-surface border border-primary rounded px-2 py-0.5 text-[10px] md:text-xs font-bold outline-none"
                                  value={editingConfig.value}
                                  onChange={(e) =>
                                    setEditingConfig({
                                      ...editingConfig,
                                      value: e.target.value,
                                    })
                                  }
                                  onBlur={handleUpdateConfigValue}
                                  onKeyPress={(e) =>
                                    e.key === "Enter" &&
                                    handleUpdateConfigValue()
                                  }
                                />
                              ) : (
                                <span className="text-[10px] md:text-xs font-bold text-ink truncate flex-1">
                                  {group}
                                </span>
                              )}
                              <div className="flex gap-1 transition-opacity">
                                <button
                                  onClick={() =>
                                    setEditingConfig({
                                      type: "groupCodes",
                                      index: idx,
                                      value: group,
                                    })
                                  }
                                  className="text-ink-muted hover:text-primary transition-colors"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() =>
                                    handleDeleteConfig("groupCodes", idx)
                                  }
                                  className="text-ink-muted hover:text-danger transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex gap-2">
                          <input
                            className="flex-1 bg-surface border border-divider rounded-lg px-2.5 py-1.5 text-[10px] md:text-xs font-bold outline-none focus:border-primary"
                            placeholder="Add Group..."
                            value={
                              newConfigValue.type === "groupCodes"
                                ? newConfigValue.value
                                : ""
                            }
                            onChange={(e) =>
                              setNewConfigValue({
                                type: "groupCodes",
                                value: e.target.value,
                              })
                            }
                            onKeyPress={(e) =>
                              e.key === "Enter" && handleAddConfig()
                            }
                          />
                          <button
                            onClick={() => {
                              setNewConfigValue({
                                type: "groupCodes",
                                value: newConfigValue.value,
                              });
                              handleAddConfig();
                            }}
                            className="p-1 bg-primary text-white rounded-lg"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Units */}
                    <div className="space-y-3 md:space-y-4">
                      <div className="bg-panel p-3 md:p-4 rounded-2xl border border-divider">
                        <label className="text-[10px] md:text-xs font-black text-ink-muted uppercase tracking-widest block mb-3 md:mb-4">
                          Units
                        </label>
                        <div className="space-y-1.5 md:space-y-2 max-h-60 overflow-y-auto pr-2">
                          {config.units.map((unit, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between group gap-2"
                            >
                              {editingConfig?.type === "units" &&
                              editingConfig.index === idx ? (
                                <input
                                  autoFocus
                                  className="flex-1 bg-surface border border-primary rounded px-2 py-0.5 text-[10px] md:text-xs font-bold outline-none"
                                  value={editingConfig.value}
                                  onChange={(e) =>
                                    setEditingConfig({
                                      ...editingConfig,
                                      value: e.target.value,
                                    })
                                  }
                                  onBlur={handleUpdateConfigValue}
                                  onKeyPress={(e) =>
                                    e.key === "Enter" &&
                                    handleUpdateConfigValue()
                                  }
                                />
                              ) : (
                                <span className="text-[10px] md:text-xs font-bold text-ink truncate flex-1">
                                  {unit}
                                </span>
                              )}
                              <div className="flex gap-1 transition-opacity">
                                <button
                                  onClick={() =>
                                    setEditingConfig({
                                      type: "units",
                                      index: idx,
                                      value: unit,
                                    })
                                  }
                                  className="text-ink-muted hover:text-primary transition-colors"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() =>
                                    handleDeleteConfig("units", idx)
                                  }
                                  className="text-ink-muted hover:text-danger transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex gap-2">
                          <input
                            className="flex-1 bg-surface border border-divider rounded-lg px-2.5 py-1.5 text-[10px] md:text-xs font-bold outline-none focus:border-primary"
                            placeholder="Add Unit..."
                            value={
                              newConfigValue.type === "units"
                                ? newConfigValue.value
                                : ""
                            }
                            onChange={(e) =>
                              setNewConfigValue({
                                type: "units",
                                value: e.target.value,
                              })
                            }
                            onKeyPress={(e) =>
                              e.key === "Enter" && handleAddConfig()
                            }
                          />
                          <button
                            onClick={() => {
                              setNewConfigValue({
                                type: "units",
                                value: newConfigValue.value,
                              });
                              handleAddConfig();
                            }}
                            className="p-1 bg-primary text-white rounded-lg"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showMaterialPicker && (
        <div className="fixed inset-0 bg-onyx/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-lg rounded-[28px] overflow-hidden flex flex-col max-h-[80vh] shadow-2xl">
            <div className="p-6 border-b border-divider flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-ink tracking-tight">Add from master</h3>
                <p className="text-xs text-ink-muted mt-1">
                  Materials saved for your organisation. Adding one copies its details here and
                  opens the stock at zero — quantity and cost stay this project's own.
                </p>
              </div>
              <button
                onClick={() => setShowMaterialPicker(false)}
                className="p-2 hover:bg-divider rounded-full text-ink shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {masterMaterials.length === 0 ? (
                <p className="text-sm text-ink-muted text-center py-10">
                  No materials saved yet. Add them in Settings → Master data.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {masterMaterials.map((m) => {
                    const used = (rawItems || []).some(
                      (i: any) => i.masterMaterialId === m.id ||
                        (i.name || "").trim().toLowerCase() === m.name.trim().toLowerCase(),
                    );
                    return (
                      <button
                        key={m.id}
                        onClick={() => !used && addMaterialFromMaster(m)}
                        disabled={used || masterBusy}
                        className={`text-left p-4 rounded-2xl border apple-transition ${
                          used
                            ? "border-divider bg-panel opacity-55 cursor-not-allowed"
                            : "border-divider bg-panel hover:bg-surface"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-bold text-ink text-sm">{m.name}</p>
                          <span className="text-[9px] font-black uppercase tracking-wider text-ink-muted shrink-0">
                            {used ? "Already stocked" : m.unit}
                          </span>
                        </div>
                        <p className="text-[12px] text-ink-muted mt-0.5">
                          {[m.code, m.category, m.hsn ? `HSN ${m.hsn}` : "", m.gstRate != null ? `GST ${m.gstRate}%` : ""]
                            .filter(Boolean).join(" · ") || "No details"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {itemToDelete && (
          <div className="fixed inset-0 bg-onyx/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-5 text-center"
            >
              <div className="bg-danger/8 w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 md:mb-6 border border-danger/20">
                <Trash2 className="w-5 h-5 text-danger" />
              </div>
              <h3 className="text-lg md:text-xl font-bold text-ink mb-2">
                Delete Item?
              </h3>
              <p className="text-xs md:text-sm text-ink-muted mb-6 md:mb-8 leading-relaxed">
                Remove <strong>{itemToDelete.name}</strong> from inventory
                permanent?
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={confirmDelete}
                  className="w-full py-3 bg-danger text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-danger transition-all shadow-sm"
                >
                  Delete Item
                </button>
                <button
                  onClick={() => setItemToDelete(null)}
                  className="w-full py-3 bg-panel text-ink rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-divider"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {(isAdding || editingItem) && (
          <div className="fixed inset-0 bg-onyx/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto"
            >
              <div className="bg-surface-dark p-5 md:p-6 text-white relative">
                <div className="relative z-10 flex items-center justify-between">
                  <h3 className="text-lg md:text-xl font-bold flex items-center gap-3">
                    <Package className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                    {editingItem ? "Edit Item" : "New Item"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAdding(false);
                      setEditingItem(null);
                    }}
                    className="p-1.5 bg-onyx/40 hover:bg-white/10 rounded-lg transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <form
                onSubmit={editingItem ? handleUpdateItem : handleAddItem}
                className="p-5 md:p-6 space-y-4 md:space-y-6"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center ml-1">
                      <label className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-ink-muted">
                        Item Code
                      </label>
                      {customFields.materialId && (
                        <button
                          type="button"
                          onClick={() =>
                            setCustomFields((prev) => ({
                              ...prev,
                              materialId: false,
                            }))
                          }
                          className="text-[10px] md:text-[10px] font-bold text-primary hover:text-[#B85F3B]"
                        >
                          Back to List
                        </button>
                      )}
                    </div>
                    {customFields.materialId ? (
                      <input
                        placeholder="Enter custom code"
                        className="w-full bg-panel border border-divider focus:border-primary focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold"
                        value={
                          editingItem
                            ? editingItem.materialId || ""
                            : newItem.materialId || ""
                        }
                        onChange={(e) =>
                          editingItem
                            ? setEditingItem({
                                ...editingItem,
                                materialId: e.target.value,
                              })
                            : setNewItem({
                                ...newItem,
                                materialId: e.target.value,
                              })
                        }
                        autoFocus
                      />
                    ) : (
                      <select
                        className="w-full bg-panel border border-divider focus:border-primary focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold appearance-none"
                        value={
                          editingItem
                            ? editingItem.materialId
                            : newItem.materialId
                        }
                        onChange={(e) =>
                          handleSelectCustom("materialId", e.target.value)
                        }
                      >
                        <option value="">Select Code</option>
                        {config.materialCodes.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                        <option value="ADD_CUSTOM">+ Add Custom...</option>
                      </select>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-ink-muted ml-1">
                      Item Name
                    </label>
                    <input
                      required
                      placeholder="Item name"
                      className="w-full bg-panel border border-divider focus:border-primary focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold"
                      value={editingItem ? editingItem.name : newItem.name}
                      onChange={(e) =>
                        editingItem
                          ? setEditingItem({
                              ...editingItem,
                              name: e.target.value,
                            })
                          : setNewItem({ ...newItem, name: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center ml-1">
                      <label className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-ink-muted">
                        Group Code
                      </label>
                      {customFields.groupCode && (
                        <button
                          type="button"
                          onClick={() =>
                            setCustomFields((prev) => ({
                              ...prev,
                              groupCode: false,
                            }))
                          }
                          className="text-[10px] md:text-[10px] font-bold text-primary hover:text-[#B85F3B]"
                        >
                          Back to List
                        </button>
                      )}
                    </div>
                    {customFields.groupCode ? (
                      <input
                        placeholder="Enter custom group"
                        className="w-full bg-panel border border-divider focus:border-primary focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold"
                        value={
                          editingItem
                            ? editingItem.groupCode || ""
                            : newItem.groupCode || ""
                        }
                        onChange={(e) =>
                          editingItem
                            ? setEditingItem({
                                ...editingItem,
                                groupCode: e.target.value,
                              })
                            : setNewItem({
                                ...newItem,
                                groupCode: e.target.value,
                              })
                        }
                        autoFocus
                      />
                    ) : (
                      <select
                        className="w-full bg-panel border border-divider focus:border-primary focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold appearance-none"
                        value={
                          editingItem
                            ? editingItem.groupCode || ""
                            : newItem.groupCode || ""
                        }
                        onChange={(e) =>
                          handleSelectCustom("groupCode", e.target.value)
                        }
                      >
                        <option value="">Select Group</option>
                        {config.groupCodes.map((group) => (
                          <option key={group} value={group}>
                            {group}
                          </option>
                        ))}
                        <option value="ADD_CUSTOM">+ Add Custom...</option>
                      </select>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-ink-muted ml-1">
                      Category
                    </label>
                    <select
                      className="w-full bg-panel border border-divider focus:border-primary focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold appearance-none"
                      value={
                        editingItem ? editingItem.category : newItem.category
                      }
                      onChange={(e) =>
                        editingItem
                          ? setEditingItem({
                              ...editingItem,
                              category: e.target.value,
                            })
                          : setNewItem({ ...newItem, category: e.target.value })
                      }
                    >
                      <option>Material</option>
                      <option>Equipment</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center ml-1">
                      <label className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-ink-muted">
                        Unit
                      </label>
                      {customFields.unit && (
                        <button
                          type="button"
                          onClick={() =>
                            setCustomFields((prev) => ({
                              ...prev,
                              unit: false,
                            }))
                          }
                          className="text-[10px] md:text-[10px] font-bold text-primary hover:text-[#B85F3B]"
                        >
                          Back to List
                        </button>
                      )}
                    </div>
                    {customFields.unit ? (
                      <input
                        placeholder="Enter custom unit"
                        className="w-full bg-panel border border-divider focus:border-primary focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold"
                        value={
                          editingItem
                            ? editingItem.unit || ""
                            : newItem.unit || ""
                        }
                        onChange={(e) =>
                          editingItem
                            ? setEditingItem({
                                ...editingItem,
                                unit: e.target.value,
                              })
                            : setNewItem({ ...newItem, unit: e.target.value })
                        }
                        autoFocus
                      />
                    ) : (
                      <select
                        className="w-full bg-panel border border-divider focus:border-primary focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold appearance-none"
                        value={editingItem ? editingItem.unit : newItem.unit}
                        onChange={(e) =>
                          handleSelectCustom("unit", e.target.value)
                        }
                      >
                        <option value="">Select Unit</option>
                        {config.units.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                        <option value="ADD_CUSTOM">+ Add Custom...</option>
                      </select>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-ink-muted ml-1">
                      {editingItem
                        ? "Quantity (from Goods Receipts)"
                        : "Initial Quantity"}
                    </label>
                    {editingItem ? (
                      <div>
                        <div className="w-full bg-surface border border-divider text-ink-muted rounded-xl p-2.5 md:p-3 text-[10px] md:text-xs font-bold cursor-not-allowed">
                          {editingItem.quantity}
                        </div>
                        <p className="text-[10px] text-ink-muted ml-1 mt-1">
                          To change stock quantity, record a Goods Receipt Note
                          against a Purchase Order.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="number"
                          required
                          className="w-full bg-panel border border-divider focus:border-primary focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold"
                          value={newItem.quantity}
                          onChange={(e) =>
                            setNewItem({
                              ...newItem,
                              quantity: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                        <p className="text-[10px] text-ink-muted ml-1 mt-1">
                          Initial seed value. Will be superseded by Goods
                          Receipt Notes once recorded.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-ink-muted ml-1">
                      Unit Cost (₹)
                    </label>
                    <input
                      type="number"
                      required
                      className="w-full bg-panel border border-divider focus:border-primary focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold text-primary"
                      value={
                        editingItem ? editingItem.unitCost : newItem.unitCost
                      }
                      onChange={(e) =>
                        editingItem
                          ? setEditingItem({
                              ...editingItem,
                              unitCost: parseFloat(e.target.value) || 0,
                            })
                          : setNewItem({
                              ...newItem,
                              unitCost: parseFloat(e.target.value) || 0,
                            })
                      }
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-ink-muted ml-1">
                      Low Stock Threshold
                    </label>
                    <input
                      type="number"
                      required
                      className="w-full bg-panel border border-divider focus:border-primary focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold"
                      value={
                        editingItem
                          ? editingItem.minThreshold
                          : newItem.minThreshold
                      }
                      onChange={(e) =>
                        editingItem
                          ? setEditingItem({
                              ...editingItem,
                              minThreshold: parseFloat(e.target.value) || 0,
                            })
                          : setNewItem({
                              ...newItem,
                              minThreshold: parseFloat(e.target.value) || 0,
                            })
                      }
                    />
                  </div>
                </div>

                <div className="flex gap-4 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-primary text-white py-3 rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-widest hover:bg-[#B85F3B] transition-all shadow-sm"
                  >
                    {editingItem ? "Save Changes" : "Add Item"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAdding(false);
                      setEditingItem(null);
                    }}
                    className="px-6 md:px-8 bg-panel text-ink-muted py-3 rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-widest hover:bg-divider"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
