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
  handleFirestoreError,
  OperationType,
} from "../firebase";
import { InventoryItem, Task } from "../types";
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  TrendingUp,
  IndianRupee,
  Trash2,
  Edit2,
  X,
  CheckCircle2,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Settings,
  Save,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { RoleGuard } from "./RoleGuard";
import { VirtualTable } from "./VirtualTable";
import { useProjectData } from "../hooks/useProjectData";
import { useTasksQuery } from "../hooks/queries";
import { useQueryClient } from "@tanstack/react-query";

interface InventoryViewProps {
  projectId: string;
}

export const InventoryView: React.FC<InventoryViewProps> = ({ projectId }) => {
  const queryClient = useQueryClient();
  const { data: items } = useProjectData<InventoryItem>(projectId, "inventory");
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
      `projects/${projectId}/settings`,
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
        doc(db, `projects/${projectId}/settings`, "inventoryConfig"),
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
    queryClient.invalidateQueries({ queryKey: ['projectData', projectId] });
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const path = `projects/${projectId}/inventory`;
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
    const path = `projects/${projectId}/inventory/${editingItem.id}`;
    try {
      const { id, ...data } = editingItem;
      await updateDoc(doc(db, `projects/${projectId}/inventory`, id), data);
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
    const path = `projects/${projectId}/inventory/${id}`;
    try {
      await deleteDoc(doc(db, `projects/${projectId}/inventory`, id));
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

  const [physicalCounts, setPhysicalCounts] = useState<Record<string, number>>(
    {},
  );

  const handleReconcile = async (item: InventoryItem) => {
    const count = physicalCounts[item.id];
    const available = item.quantity - (item.consumed || 0);
    if (count === undefined || count === available) return;

    const path = `projects/${projectId}/inventory/${item.id}`;
    try {
      await updateDoc(doc(db, `projects/${projectId}/inventory`, item.id), {
        quantity: count + (item.consumed || 0),
      });
      const newCounts = { ...physicalCounts };
      delete newCounts[item.id];
      setPhysicalCounts(newCounts);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const stats = useMemo(() => {
    const totalValue = items.reduce(
      (acc, curr) => acc + (curr.quantity - (curr.consumed || 0)) * curr.unitCost,
      0,
    );
    const lowStock = items.filter(
      (item) => (item.quantity - (item.consumed || 0)) <= item.minThreshold,
    ).length;

    const rootTasks = tasks.filter((t) => !t.parentId);
    const allocatedCost = rootTasks.reduce((acc, task) => {
      const taskResCost = (task.resources || []).reduce(
        (tAcc, res) => tAcc + res.quantity * res.costPerUnit,
        0,
      );
      return acc + taskResCost;
    }, 0);

    return { totalValue, lowStock, allocatedCost };
  }, [items, tasks]);

  return (
    <div className="space-y-6 md:space-y-12 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 md:gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1 md:mb-2">
            <div className="bg-slate-900 p-1.5 md:p-2 rounded-xl shadow-lg">
              <Package className="w-3 h-3 md:w-4 md:h-4 text-white" />
            </div>
            <span className="text-[8px] md:text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-600">
              Inventory Management
            </span>
          </div>
          <h2 className="text-xl md:text-3xl font-bold text-ink tracking-tight">
            Stock Inventory
          </h2>
          <p className="text-ink-muted font-medium mt-1 text-[10px] md:text-sm">
            Monitor and manage material logistics and resource orchestration.
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6">
        <div className="bg-slate-900 p-4 md:p-8 rounded-2xl md:rounded-3xl text-white relative overflow-hidden group shadow-xl">
          <div className="absolute top-0 right-0 w-24 md:w-32 h-24 md:h-32 bg-surface/5 rounded-full -mr-12 md:-mr-16 -mt-12 md:-mt-16 apple-transition group-hover:scale-110" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2 md:mb-6">
              <div className="bg-surface/10 p-2 md:p-3 rounded-xl border border-white/5 backdrop-blur-md">
                <IndianRupee className="w-3.5 h-3.5 md:w-5 md:h-5 text-white" />
              </div>
              <span className="text-[8px] md:text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">
                Inventory Value
              </span>
            </div>
            <p className="text-[8px] md:text-[9px] font-bold text-white/40 mb-0.5 md:mb-1 uppercase tracking-widest">
              Total Valuation
            </p>
            <h3 className="text-lg md:text-3xl font-bold tracking-tight">
              ₹{stats.totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </h3>
          </div>
        </div>

        <div className="bg-surface p-4 md:p-8 rounded-2xl md:rounded-3xl border border-divider shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 md:w-32 h-24 md:h-32 bg-emerald-50 rounded-full -mr-12 md:-mr-16 -mt-12 md:-mt-16 apple-transition group-hover:scale-110" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2 md:mb-6">
              <div className="bg-emerald-50 p-2 md:p-3 rounded-xl shadow-sm text-emerald-600">
                <TrendingUp className="w-3.5 h-3.5 md:w-5 md:h-5" />
              </div>
              <span className="text-[8px] md:text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-600/50">
                Fiscal Scope
              </span>
            </div>
            <p className="text-[8px] md:text-[9px] font-bold text-ink-muted mb-0.5 md:mb-1 uppercase tracking-widest">
              Allocated
            </p>
            <h3 className="text-lg md:text-3xl font-bold text-ink tracking-tight">
              ₹{stats.allocatedCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </h3>
          </div>
        </div>

        <div className="bg-surface p-4 md:p-8 rounded-2xl md:rounded-3xl border border-divider shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 md:w-32 h-24 md:h-32 bg-red-50 rounded-full -mr-12 md:-mr-16 -mt-12 md:-mt-16 apple-transition group-hover:scale-110" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2 md:mb-6">
              <div className="bg-red-50 p-2 md:p-3 rounded-xl shadow-sm text-red-600">
                <AlertTriangle className="w-3.5 h-3.5 md:w-5 md:h-5" />
              </div>
              <span className="text-[8px] md:text-[9px] font-bold uppercase tracking-[0.2em] text-red-600/50">
                Supply Risk
              </span>
            </div>
            <p className="text-[8px] md:text-[9px] font-bold text-ink-muted mb-0.5 md:mb-1 uppercase tracking-widest">
              Low Stock
            </p>
            <h3 className="text-lg md:text-3xl font-bold text-ink tracking-tight">
              {stats.lowStock}{" "}
              <span className="text-[10px] md:text-xs font-bold text-ink-muted ml-1">
                Units
              </span>
            </h3>
          </div>
        </div>
      </div>

      {/* Controls Section */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-surface backdrop-blur-xl p-3 md:p-4 rounded-2xl border border-divider shadow-sm">
        <div className="flex flex-col md:flex-row gap-3 w-full lg:w-auto items-center">
          <div className="flex bg-panel p-1 rounded-xl w-full md:w-auto border border-divider overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setViewMode("inventory")}
              className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider apple-transition whitespace-nowrap ${viewMode === "inventory" ? "bg-surface shadow-sm text-indigo-600" : "text-ink-muted hover:text-ink"}`}
            >
              Stock Ledger
            </button>
            <button
              onClick={() => setViewMode("reconciliation")}
              className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider apple-transition whitespace-nowrap ${viewMode === "reconciliation" ? "bg-surface shadow-sm text-indigo-600" : "text-ink-muted hover:text-ink"}`}
            >
              Reconciliation
            </button>
            <button
              onClick={() => setViewMode("config")}
              className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider apple-transition whitespace-nowrap ${viewMode === "config" ? "bg-surface shadow-sm text-indigo-600" : "text-ink-muted hover:text-ink"}`}
            >
              Configuration
            </button>
          </div>
          <div className="relative w-full md:w-64 lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" />
            <input
              placeholder="Search items..."
              className="w-full pl-9 pr-4 py-2 bg-panel border border-transparent focus:border-indigo-500 focus:bg-surface rounded-xl outline-none apple-transition text-[10px] md:text-xs font-bold"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-widest apple-transition whitespace-nowrap ${
                categoryFilter === cat
                  ? "bg-slate-900 text-white"
                  : "bg-surface text-ink-muted hover:bg-panel border border-divider"
              }`}
            >
              {cat}
            </button>
          ))}
          <div className="w-px h-4 bg-divider mx-1" />
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
            <button
              onClick={() => setIsAdding(true)}
              className="bg-indigo-600 text-white w-full sm:w-auto px-6 py-3 md:px-4 md:py-2 rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-700 apple-transition shadow-lg shadow-indigo-600/20"
            >
              <Plus className="w-3 h-3" /> <span>Add Item</span>
            </button>
          </RoleGuard>
        </div>
      </div>

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
                      <span className="font-mono text-[9px] md:text-[10px] font-bold text-ink-muted bg-panel px-2 py-0.5 rounded border border-divider">
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
                        <div className="font-bold text-ink text-[11px] md:text-sm tracking-tight mb-0.5 truncate">
                          {item.name}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">
                            {item.unit}
                          </span>
                          { (item.quantity - (item.consumed || 0)) <= item.minThreshold && (
                            <span className="text-[9px] font-bold text-red-600 uppercase tracking-widest bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
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
                    )
                  },
                  {
                    key: "quantity",
                    header: "Available Stock",
                    width: "100px",
                    sortable: true,
                    sortAccessor: (item) => item.quantity - (item.consumed || 0),
                    render: (item) => (
                      <div className={`text-xs md:text-base font-bold ${(item.quantity - (item.consumed || 0)) <= item.minThreshold ? "text-red-500" : "text-ink"}`}>
                        {(item.quantity - (item.consumed || 0)).toLocaleString(undefined, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}
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
                        ₹{item.unitCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </span>
                    ),
                  },
                  {
                    key: "totalValue",
                    header: "Total Value",
                    width: "120px",
                    sortable: true,
                    sortAccessor: (item) => (item.quantity - (item.consumed || 0)) * item.unitCost,
                    render: (item) => (
                      <div className="font-bold text-ink text-xs md:text-base font-mono">
                        ₹{((item.quantity - (item.consumed || 0)) * item.unitCost).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </div>
                    ),
                  },
                  {
                    key: "actions",
                    header: "Actions",
                    width: "100px",
                    render: (item) => (
                      <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingItem(item)}
                          className="p-1.5 hover:bg-surface rounded-lg text-ink-muted hover:text-indigo-600 border border-transparent hover:border-divider"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setItemToDelete(item)}
                          className="p-1.5 hover:bg-surface rounded-lg text-ink-muted hover:text-red-600 border border-transparent hover:border-divider"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          ) : viewMode === "reconciliation" ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white/50">
                  <th className="px-3 md:px-6 py-2 md:py-3 text-[9px] md:text-xs font-bold uppercase tracking-widest text-white/80">
                    Item Name
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-[9px] md:text-xs font-bold uppercase tracking-widest text-white/30 text-center">
                    System Qty
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-[9px] md:text-xs font-bold uppercase tracking-widest text-white/80 text-center">
                    Physical Count
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-[9px] md:text-xs font-bold uppercase tracking-widest text-white/80 text-center">
                    Variance
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-[9px] md:text-xs font-bold uppercase tracking-widest text-white/30 text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
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
                        (physicalCounts[item.id] !== undefined ? physicalCounts[item.id] : available) -
                        available;
                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-panel/50 apple-transition group"
                        >
                          <td className="px-6 py-3">
                            <div className="font-bold text-ink text-[11px] md:text-sm tracking-tight">
                              {item.name}
                            </div>
                            <div className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">
                              {item.materialId}
                            </div>
                          </td>
                          <td className="px-6 py-3 text-center">
                            <div className="text-[11px] md:text-sm font-bold text-ink-muted">
                              {available.toFixed(1)}
                            </div>
                          </td>
                          <td className="px-6 py-3 text-center">
                            <div className="flex justify-center">
                              <input
                                type="number"
                                className="w-16 md:w-20 bg-surface border border-divider rounded-lg px-2 py-1 text-[11px] md:text-sm font-bold outline-none focus:border-indigo-500 text-center"
                                value={physicalCounts[item.id] ?? available}
                                onChange={(e) =>
                                  setPhysicalCounts({
                                    ...physicalCounts,
                                    [item.id]: parseFloat(e.target.value) || 0,
                                  })
                                }
                              />
                            </div>
                          </td>
                          <td className="px-6 py-3 text-center">
                            <div
                              className={`text-[10px] md:text-xs font-bold font-mono px-2 py-1 rounded-lg ${Math.abs(variance) < 0.05 ? "text-ink-muted" : variance > 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}
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
                                  : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
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
            <div className="p-8">
              <div className="max-w-4xl mx-auto space-y-12">
                <div>
                  <h3 className="text-sm font-black text-ink uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <Package className="w-4 h-4 text-indigo-500" />
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
                                  className="flex-1 bg-surface border border-indigo-400 rounded px-2 py-0.5 text-[10px] md:text-xs font-bold outline-none"
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
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() =>
                                    setEditingConfig({
                                      type: "materialCodes",
                                      index: idx,
                                      value: code,
                                    })
                                  }
                                  className="text-ink-muted hover:text-indigo-600 transition-colors"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() =>
                                    handleDeleteConfig("materialCodes", idx)
                                  }
                                  className="text-ink-muted hover:text-red-500 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex gap-2">
                          <input
                            className="flex-1 bg-surface border border-divider rounded-lg px-2.5 py-1.5 text-[10px] md:text-xs font-bold outline-none focus:border-indigo-500"
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
                            className="p-1 bg-indigo-600 text-white rounded-lg"
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
                                  className="flex-1 bg-surface border border-indigo-400 rounded px-2 py-0.5 text-[10px] md:text-xs font-bold outline-none"
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
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() =>
                                    setEditingConfig({
                                      type: "groupCodes",
                                      index: idx,
                                      value: group,
                                    })
                                  }
                                  className="text-ink-muted hover:text-indigo-600 transition-colors"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() =>
                                    handleDeleteConfig("groupCodes", idx)
                                  }
                                  className="text-ink-muted hover:text-red-500 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex gap-2">
                          <input
                            className="flex-1 bg-surface border border-divider rounded-lg px-2.5 py-1.5 text-[10px] md:text-xs font-bold outline-none focus:border-indigo-500"
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
                            className="p-1 bg-indigo-600 text-white rounded-lg"
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
                                  className="flex-1 bg-surface border border-indigo-400 rounded px-2 py-0.5 text-[10px] md:text-xs font-bold outline-none"
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
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() =>
                                    setEditingConfig({
                                      type: "units",
                                      index: idx,
                                      value: unit,
                                    })
                                  }
                                  className="text-ink-muted hover:text-indigo-600 transition-colors"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() =>
                                    handleDeleteConfig("units", idx)
                                  }
                                  className="text-ink-muted hover:text-red-500 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex gap-2">
                          <input
                            className="flex-1 bg-surface border border-divider rounded-lg px-2.5 py-1.5 text-[10px] md:text-xs font-bold outline-none focus:border-indigo-500"
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
                            className="p-1 bg-indigo-600 text-white rounded-lg"
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
      <AnimatePresence>
        {itemToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden p-8 text-center"
            >
              <div className="bg-red-50 w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 md:mb-6 border border-red-100">
                <Trash2 className="w-5 h-5 text-red-500" />
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
                  className="w-full py-3 bg-red-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-red-700 transition-all shadow-sm"
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
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-surface rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden my-auto"
            >
              <div className="bg-slate-900 p-6 md:p-8 text-white relative">
                <div className="relative z-10 flex items-center justify-between">
                  <h3 className="text-lg md:text-xl font-bold flex items-center gap-3">
                    <Package className="w-4 h-4 md:w-5 md:h-5 text-indigo-400" />
                    {editingItem ? "Edit Item" : "New Item"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAdding(false);
                      setEditingItem(null);
                    }}
                    className="p-1.5 bg-surface/10 hover:bg-surface/20 rounded-lg transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <form
                onSubmit={editingItem ? handleUpdateItem : handleAddItem}
                className="p-6 md:p-8 space-y-4 md:space-y-6"
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
                          className="text-[9px] md:text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                        >
                          Back to List
                        </button>
                      )}
                    </div>
                    {customFields.materialId ? (
                      <input
                        placeholder="Enter custom code"
                        className="w-full bg-panel border border-divider focus:border-indigo-500 focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold"
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
                        className="w-full bg-panel border border-divider focus:border-indigo-500 focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold appearance-none"
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
                      className="w-full bg-panel border border-divider focus:border-indigo-500 focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold"
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
                          className="text-[9px] md:text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                        >
                          Back to List
                        </button>
                      )}
                    </div>
                    {customFields.groupCode ? (
                      <input
                        placeholder="Enter custom group"
                        className="w-full bg-panel border border-divider focus:border-indigo-500 focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold"
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
                        className="w-full bg-panel border border-divider focus:border-indigo-500 focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold appearance-none"
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
                      className="w-full bg-panel border border-divider focus:border-indigo-500 focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold appearance-none"
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
                          className="text-[9px] md:text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                        >
                          Back to List
                        </button>
                      )}
                    </div>
                    {customFields.unit ? (
                      <input
                        placeholder="Enter custom unit"
                        className="w-full bg-panel border border-divider focus:border-indigo-500 focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold"
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
                        className="w-full bg-panel border border-divider focus:border-indigo-500 focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold appearance-none"
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
                      Quantity
                    </label>
                    <input
                      type="number"
                      required
                      className="w-full bg-panel border border-divider focus:border-indigo-500 focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold"
                      value={
                        editingItem ? editingItem.quantity : newItem.quantity
                      }
                      onChange={(e) =>
                        editingItem
                          ? setEditingItem({
                              ...editingItem,
                              quantity: parseFloat(e.target.value) || 0,
                            })
                          : setNewItem({
                              ...newItem,
                              quantity: parseFloat(e.target.value) || 0,
                            })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-ink-muted ml-1">
                      Unit Cost (₹)
                    </label>
                    <input
                      type="number"
                      required
                      className="w-full bg-panel border border-divider focus:border-indigo-500 focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold text-indigo-600"
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
                      className="w-full bg-panel border border-divider focus:border-indigo-500 focus:bg-surface rounded-xl p-2.5 md:p-3 outline-none transition-all text-[10px] md:text-xs font-bold"
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
                    className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-sm"
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
