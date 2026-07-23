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
  handleFirestoreError,
  OperationType,
  runTransaction,
  where,
  orderBy,
  getDoc,
} from "../firebase";
import { exportToCSV, exportToPDF } from "../utils/exportUtils";
import {
  Vendor,
  LaborRateCard,
  DailyLogEntry,
  LaborLogLineItem,
  DailyLaborLog,
  Task,
  VendorLedgerEntry,
  RABill,
} from "../types";
import {
  Users,
  Plus,
  Search,
  IndianRupee,
  Trash2,
  Edit2,
  X,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  History,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Briefcase,
  ChevronRight,
  Filter,
  Download,
  Save,
  Calculator,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { useProjectData } from "../hooks/useProjectData";
import { useTaskStore, useAuthStore } from "../store";
import { useQueryClient } from "@tanstack/react-query";
import { useTasksQuery, useProjectDataQuery } from "../hooks/queries";
import { useProjectDailyLogsQuery } from "../hooks/useDailyLogs";
import { useBreakpoint } from "../hooks/useBreakpoint";

interface LaborTrackingViewProps {
  projectId: string;
}

type Tab = "rates" | "billing";

export const LaborTrackingView: React.FC<LaborTrackingViewProps> = ({
  projectId,
}) => {
  const { user } = useAuthStore();
  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;
  const isAdminOrOwner = user?.role === "Admin" || user?.role === "Owner";

  const [activeTab, setActiveTab] = useState<Tab>("rates");
  const queryClient = useQueryClient();
  const breakpoint = useBreakpoint();

  const { data: tasks = [] } = useTasksQuery(projectId);

  const { data: allVendors } = useProjectData<Vendor>(projectId, "suppliers");
  const vendors = allVendors.filter((v) => ["Labor", "Both"].includes(v.type));
  const { data: rateCards } = useProjectData<LaborRateCard>(
    projectId,
    "labor_rate_cards",
  );
  const { data: raBills } = useProjectData<RABill>(
    projectId,
    "ra_bills",
    "billDate",
    "desc",
  );
  const { data: ledger } = useProjectData<VendorLedgerEntry>(
    projectId,
    "ledger",
  );

  const { data: dailyLogs } = useProjectDailyLogsQuery(projectId);
  const { data: legacyLaborLogs } = useProjectDataQuery<DailyLaborLog>(
    projectId,
    "labor_logs",
    "date",
    "desc"
  );

  const laborLogs = useMemo(() => {
    if (!dailyLogs || !rateCards || !tasks || !vendors) return [];
    const logs: DailyLaborLog[] = legacyLaborLogs ? [...legacyLaborLogs] : [];
    
    dailyLogs.forEach((dailyLog) => {
      const vendorItems: Record<string, LaborLogLineItem[]> = {};
      
      dailyLog.labour?.forEach((labourItem) => {
        const rateCard = rateCards.find(r => r.id === labourItem.roleId);
        if (rateCard) {
          if (!vendorItems[rateCard.vendorId]) {
            vendorItems[rateCard.vendorId] = [];
          }
          vendorItems[rateCard.vendorId].push({
            taskId: dailyLog.taskId,
            taskName: tasks.find(t => t.id === dailyLog.taskId)?.name || "Unknown Task",
            role: rateCard.role,
            headcount: labourItem.headcount,
            shifts: 1, 
            rate: rateCard.rate,
            cost: labourItem.headcount * 1 * rateCard.rate,
          });
        }
      });

      Object.entries(vendorItems).forEach(([vendorId, items]) => {
        const vendor = vendors.find(v => v.id === vendorId);
        const totalCost = items.reduce((sum, i) => sum + i.cost, 0);
        logs.push({
          id: `${dailyLog.id}_${vendorId}`, 
          projectId,
          vendorId,
          vendorName: vendor?.name || "Unknown",
          date: dailyLog.workDate, 
          totalCost,
          status: "Approved", 
          items,
        });
      });
    });
    
    return logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [dailyLogs, rateCards, tasks, vendors]);

  // Modals
  const [isAddingRate, setIsAddingRate] = useState(false);
  const [isDeletingRate, setIsDeletingRate] = useState<string | null>(null);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedVendorId, setExpandedVendorId] = useState<string | null>(null);

  // Form States
  const [newRate, setNewRate] = useState<Partial<LaborRateCard>>({
    vendorId: "",
    role: "",
    rate: 0,
    unit: "Shift",
  });

  const handleAddRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const path = `${basePath}/labor_rate_cards`;
    try {
      if (editingRateId) {
        await updateDoc(doc(db, path, editingRateId), { ...newRate });
      } else {
        await addDoc(collection(db, path), { ...newRate, projectId });
      }
      setIsAddingRate(false);
      setEditingRateId(null);
      setNewRate({ vendorId: "", role: "", rate: 0, unit: "Shift" });
      queryClient.invalidateQueries({ queryKey: ["projectData", projectId] });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleDeleteRABill = async (billId: string) => {
    if (!billId || isProcessing) return;
    setIsProcessing(true);
    
    try {
      const billToDel = raBills.find((b) => b.id === billId);
      if (!billToDel) throw new Error("Bill not found");
      
      const ledgerEntry = ledger.find((e) => e.referenceId === billId && e.referenceType === "LABOR_DEPLOYMENT");
      
      await runTransaction(db, async (transaction) => {
        const vendorRef = doc(db, `${basePath}/suppliers/${billToDel.vendorId}`);
        const vendorDoc = await transaction.get(vendorRef);
        if (vendorDoc.exists()) {
          transaction.update(vendorRef, {
            outstandingBalance: (vendorDoc.data().outstandingBalance || 0) - billToDel.netAmount,
          });
        }
        
        if (ledgerEntry) {
          transaction.delete(doc(db, `${basePath}/ledger/${ledgerEntry.id}`));
        }
        transaction.delete(doc(db, `${basePath}/ra_bills/${billId}`));
      });
      
      queryClient.invalidateQueries({ queryKey: ["projectData", projectId] });
    } catch (error) {
      console.error("Delete RA Bill Failed:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteRate = async (rateId: string) => {
    if (!rateId || isProcessing) return;
    setIsProcessing(true);
    const path = `${basePath}/labor_rate_cards/${rateId}`;
    try {
      await deleteDoc(
        doc(db, `${basePath}/labor_rate_cards`, rateId),
      );
      setIsDeletingRate(null);
      queryClient.invalidateQueries({ queryKey: ["projectData", projectId] });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateRABill = async (
    vendor: Vendor,
    gross: number,
    net: number,
    logIds: string[],
  ) => {
    if (!isAdminOrOwner) return;
    if (isProcessing) return;
    setIsProcessing(true);
    
    try {
      const billNumber = `RA-${vendor.name.substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`;
      
      await runTransaction(db, async (transaction) => {
        const vendorRef = doc(db, `${basePath}/suppliers/${vendor.id}`);
        console.log("Checking vendorRef:", vendorRef.path, vendor);
        const vendorDoc = await transaction.get(vendorRef);
        if (!vendorDoc.exists()) { console.error("Vendor not found at path:", vendorRef.path); return; }
        
        const billRef = doc(collection(db, `${basePath}/ra_bills`));
        const ledgerRef = doc(collection(db, `${basePath}/ledger`));
        
        const billData = {
          projectId,
          vendorId: vendor.id,
          vendorName: vendor.name,
          billDate: new Date().toISOString().split("T")[0],
          billNumber,
          grossAmount: gross,
          deductions: gross - net,
          netAmount: net,
          status: "Certified",
          logIds: logIds,
        };
        
        transaction.set(billRef, billData);
        
        transaction.set(ledgerRef, {
          projectId,
          vendorId: vendor.id,
          date: new Date().toISOString(),
          type: "CREDIT",
          amount: net,
          referenceType: "LABOR_DEPLOYMENT",
          referenceId: billRef.id,
          description: `RA Bill - ${billNumber}`,
        });
        
        transaction.update(vendorRef, {
          outstandingBalance: (vendorDoc.data().outstandingBalance || 0) + net,
        });
      });
      
      queryClient.invalidateQueries({ queryKey: ["projectData", projectId] });
      console.log("RA Bill generated", billNumber);
      alert(`RA Bill ${billNumber} generated successfully!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${basePath}/ra_bills`);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Render Helpers ---

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    date: "",
    vendor: "",
    task: "",
    role: "",
  });
  const [sortField, setSortField] = useState<
    "date" | "vendorName" | "totalCost"
  >("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const filteredAndSortedLogs = laborLogs
    .filter((log) => {
      const matchDate = !filters.date || log.date === filters.date;
      const matchVendor = !filters.vendor || log.vendorName === filters.vendor;

      const matchesSubItems = log.items.some((item) => {
        const matchTask = !filters.task || item.taskName === filters.task;
        const matchRole = !filters.role || item.role === filters.role;
        return matchTask && matchRole;
      });

      return (
        matchDate && (filters.vendor ? matchVendor : true) && matchesSubItems
      );
    })
    .sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      if (sortField === "date") {
        aValue = new Date(a.date).getTime();
        bValue = new Date(b.date).getTime();
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

  const handleSort = (field: "date" | "vendorName" | "totalCost") => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field)
      return <ArrowUpDown className="w-3 h-3 opacity-20" />;
    return sortDirection === "asc" ? (
      <ChevronUp className="w-3 h-3 text-[#F3E8D2]0" />
    ) : (
      <ChevronDown className="w-3 h-3 text-[#F3E8D2]0" />
    );
  };

  const renderRates = () => {
    const ratesByVendor = vendors.map((vendor) => ({
      vendor,
      rates: rateCards.filter((r) => r.vendorId === vendor.id),
    }));

    return (
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 bg-surface/70 backdrop-blur-xl p-6 md:p-8 rounded-[24px] md:rounded-[32px] border border-white shadow-sm">
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-ink tracking-tight leading-none mb-2">
              Labor Matrix
            </h2>
            <p className="text-ink-muted font-bold text-xs md:text-sm tracking-tight uppercase tracking-[0.1em]">
              Pricing indexes mapped to active vendors.
            </p>
          </div>
          <button
            onClick={() => {
              setNewRate({ vendorId: "", role: "", rate: 0, unit: "Shift" });
              setIsAddingRate(true);
            }}
            className="w-full sm:w-auto bg-amber-500 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-amber-600 apple-transition shadow-lg shadow-amber-100 text-[10px]"
          >
            <Plus className="w-4 h-4" /> Global Rate Entry
          </button>
        </div>

        <div className="space-y-4">
          {ratesByVendor.map(({ vendor, rates }) => {
            const isExpanded = expandedVendorId === vendor.id;
            return (
              <div
                key={vendor.id}
                className="bg-surface rounded-2xl border border-divider hover:border-amber-500/20 transition-all overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.01)]"
              >
                {/* Vendor Header Row */}
                <div
                  onClick={() => setExpandedVendorId(isExpanded ? null : vendor.id)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 md:p-5 gap-4 cursor-pointer select-none hover:bg-panel/20 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-base shadow-sm">
                      {vendor.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-base md:text-lg font-black text-ink tracking-tight leading-none mb-1.5">
                        {vendor.name}
                      </h3>
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">
                          {rates.length} Labor Classification{rates.length !== 1 ? "s" : ""}
                        </p>
                        <div className="w-1 h-1 rounded-full bg-divider" />
                        <p className="text-[10px] font-bold text-[#A3711C] uppercase tracking-widest">
                          ID: {vendor.id.slice(0, 8)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setNewRate({
                          vendorId: vendor.id,
                          role: "",
                          rate: 0,
                          unit: "Shift",
                        });
                        setIsAddingRate(true);
                      }}
                      className="bg-panel text-ink px-4 py-2 rounded-lg hover:bg-slate-900 hover:text-white apple-transition shadow-sm flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-[0.15em] border border-divider"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Rate
                    </button>
                    <div className={`p-1.5 text-ink-muted rounded-lg bg-panel/40 border border-divider/40 transition-transform duration-250 ${isExpanded ? "rotate-180 text-[#A3711C]" : ""}`}>
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* Rates list (Expanded view with minimal cards) */}
                {isExpanded && (
                  <div className="px-4 pb-5 pt-3 border-t border-divider/40 bg-panel/30">
                    {rates.length === 0 ? (
                      <div className="py-12 text-center bg-surface/50 border border-dashed border-divider/60 rounded-xl">
                        <div className="w-12 h-12 bg-panel rounded-xl flex items-center justify-center mx-auto mb-3">
                          <Briefcase className="w-5 h-5 text-ink-muted" />
                        </div>
                        <p className="text-[10px] font-bold text-ink-muted uppercase tracking-[0.2em]">
                          No active rate cards for this entity
                        </p>
                        <button
                          onClick={() => {
                            setNewRate({
                              vendorId: vendor.id,
                              role: "",
                              rate: 0,
                              unit: "Shift",
                            });
                            setIsAddingRate(true);
                          }}
                          className="mt-3 text-[#A3711C] text-[10px] font-black uppercase tracking-widest hover:underline"
                        >
                          Initialize Rate Sheet
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {rates.map((rate) => (
                          <div
                            key={rate.id}
                            className="bg-surface p-3.5 rounded-xl border border-divider/60 hover:border-amber-500/30 transition-all flex flex-col justify-between group relative overflow-hidden shadow-sm"
                          >
                            <div className="flex justify-between items-start gap-2 mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="bg-panel p-1.5 rounded-lg text-amber-600 shrink-0">
                                  <Users className="w-3.5 h-3.5" />
                                </div>
                                <h4 className="text-xs font-bold text-ink tracking-tight truncate" title={rate.role}>
                                  {rate.role}
                                </h4>
                              </div>

                              {isAdminOrOwner && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setNewRate({
                                        vendorId: rate.vendorId,
                                        role: rate.role,
                                        rate: rate.rate,
                                        unit: rate.unit,
                                      });
                                      setEditingRateId(rate.id);
                                      setIsAddingRate(true);
                                    }}
                                    className="p-1 bg-panel text-ink-muted rounded hover:bg-slate-900 hover:text-white transition-all"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setIsDeletingRate(rate.id);
                                    }}
                                    className="p-1 bg-panel text-ink-muted rounded hover:bg-red-500 hover:text-white transition-all"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="flex justify-between items-baseline border-t border-divider/30 pt-2.5 mt-1">
                              <span className="text-[8px] font-black uppercase tracking-widest text-ink-muted">
                                Daily Yield
                              </span>
                              <div className="text-right">
                                <span className="text-sm font-bold text-emerald-600 font-mono">
                                  ₹{rate.rate.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                </span>
                                <span className="text-[10px] text-ink-muted font-bold ml-1">
                                  / {rate.unit}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderBilling = () => {
    // RA Bill Logic - Calculate summary per vendor
    const billedLogIds = new Set(raBills.flatMap((b) => b.logIds || []));

    console.log("LaborLogs", laborLogs); console.log("Vendors", vendors); const raBillsSummary = vendors
      .map((vendor) => {
        const unbilledLogs = laborLogs.filter(
          (l) => l.vendorId === vendor.id && !billedLogIds.has(l.id)
        );
        const grossAmount = unbilledLogs.reduce((sum, l) => sum + l.totalCost, 0);
        const netPayable = grossAmount;
        return {
          vendor,
          grossAmount,
          totalPaid: 0,
          netPayable,
          logCount: unbilledLogs.length,
          logIds: unbilledLogs.map((l) => l.id),
        };
      })
      .filter((bill) => bill.grossAmount > 0);

    return (
      <div className="space-y-12 md:space-y-20">
        <div className="space-y-6 md:space-y-10">
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-ink tracking-tight leading-none mb-2">
              RA Bill Summaries
            </h2>
            <p className="text-ink-muted font-bold text-xs md:text-sm tracking-tight uppercase tracking-[0.1em]">
              Running account fiscal reconciliation.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:gap-10">
            {raBillsSummary.map((bill) => (
              <div
                key={bill.vendor.id}
                className="bg-surface p-6 md:p-10 rounded-[32px] md:rounded-[48px] border border-slate-50 shadow-[0_10px_30px_rgba(0,0,0,0.02)] md:shadow-[0_20px_80px_rgba(0,0,0,0.03)] flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 md:gap-12 group hover:shadow-[0_40px_100px_rgba(0,0,0,0.06)] apple-transition relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-48 md:w-64 h-48 md:h-64 bg-panel/50 rounded-full -mr-24 md:-mr-32 -mt-24 md:-mt-32 group-hover:scale-110 apple-transition" />
                <div className="flex items-center gap-4 md:gap-8 relative z-10">
                  <div className="bg-slate-900 text-white p-4 md:p-6 rounded-[24px] md:rounded-[32px] shadow-2xl shadow-slate-200 group-hover:bg-[#A3711C] apple-transition">
                    <Calculator className="w-6 h-6 md:w-10 md:h-10" />
                  </div>
                  <div>
                    <h3 className="text-xl md:text-3xl font-black text-ink tracking-tighter leading-none mb-2 truncate max-w-[200px] md:max-w-none">
                      {bill.vendor.name}
                    </h3>
                    <p className="text-ink-muted font-bold uppercase tracking-[0.2em] text-[9px] md:text-[10px]">
                      {bill.logCount} Postings Certified
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 md:gap-12 relative z-10 w-full xl:w-auto">
                  <div className="flex-1 min-w-[100px]">
                    <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] text-ink-muted mb-2 md:mb-3">
                      Gross Amount
                    </p>
                    <p className="text-base md:text-2xl font-mono font-black text-ink tracking-tighter leading-none">
                      ₹
                      {bill.grossAmount.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </div>
                  <div className="flex-1 min-w-[100px]">
                    <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] text-ink-muted mb-2 md:mb-3">
                      Amount Paid
                    </p>
                    <p className="text-base md:text-2xl font-mono font-black text-emerald-600 tracking-tighter leading-none">
                      ₹
                      {bill.totalPaid.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </div>
                  <div className="flex-1 min-w-[140px] bg-red-50/50 p-4 md:p-6 rounded-2xl md:rounded-[32px] border border-red-100 shadow-inner">
                    <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] text-red-300 mb-2 md:mb-3">
                      Outstanding
                    </p>
                    <p className="text-xl md:text-2xl font-mono font-black text-red-500 tracking-tighter leading-none">
                      ₹
                      {bill.netPayable.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </div>
                </div>

                {isAdminOrOwner && (
                  <button
                    onClick={() =>
                      handleGenerateRABill(
                        bill.vendor,
                        bill.grossAmount,
                        bill.netPayable,
                        bill.logIds,
                      )
                    }
                    disabled={isProcessing}
                    className="w-full xl:w-auto bg-slate-900 text-white px-8 md:px-10 py-4 md:py-5 rounded-xl md:rounded-2xl font-black uppercase tracking-[0.2em] text-[9px] md:text-[10px] hover:bg-slate-800 apple-transition shadow-lg shadow-slate-200 disabled:opacity-50 relative z-10 active:scale-95"
                  >
                    {isProcessing ? "Certifying..." : "Certify RA"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6 md:space-y-10">
          <div className="flex items-center gap-4 md:gap-6">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-panel flex items-center justify-center rounded-xl md:rounded-2xl">
              <History className="w-5 h-5 md:w-6 md:h-6 text-ink-muted" />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-ink tracking-tight leading-none mb-1 md:mb-2">
                Archive
              </h2>
              <p className="text-ink-muted font-bold text-xs md:text-sm tracking-tight uppercase tracking-[0.1em]">
                All fiscal certifications.
              </p>
            </div>
          </div>

          {breakpoint !== "desktop" ? (
            <div className="space-y-4">
              {raBills.map((bill) => (
                <div
                  key={bill.id}
                  className="bg-surface rounded-[24px] shadow-[0_10px_40px_rgba(0,0,0,0.02)] border border-slate-50 p-5 md:p-6 relative"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="pr-4">
                      <h4 className="font-black text-ink text-base md:text-lg tracking-tight leading-none mb-2">
                        {bill.vendorName}
                      </h4>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-[#A3711C] tracking-tighter text-xs md:text-sm">
                          {bill.billNumber}
                        </span>
                        <span className="font-mono text-[9px] md:text-[10px] font-black text-ink-muted">
                          {bill.billDate}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 shrink-0">
                      <span className="bg-emerald-50 text-emerald-600 px-3 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] border border-emerald-100/50 shadow-sm shrink-0">
                        {bill.status}
                      </span>
                      {isAdminOrOwner && (
                        <button
                          onClick={() => handleDeleteRABill(bill.id)}
                          className="p-1.5 text-ink-muted hover:text-red-500 bg-red-50/50 rounded-lg apple-transition shrink-0"
                        >
                          <Trash2 className="w-3.5 md:w-4 h-3.5 md:h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-end mt-4 pt-4 border-t border-divider/30">
                    <div>
                      <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] text-ink-muted mb-1">
                        Gross
                      </p>
                      <p className="text-xs md:text-sm font-mono font-black text-ink-muted tracking-tighter">
                        ₹
                        {bill.grossAmount.toLocaleString("en-IN", {
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] text-ink-muted mb-1">
                        Net Amount
                      </p>
                      <p className="text-xl md:text-2xl font-mono font-black text-ink tracking-tighter leading-none">
                        ₹
                        {bill.netAmount.toLocaleString("en-IN", {
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {raBills.length === 0 && (
                <div className="bg-surface rounded-[24px] shadow-[0_10px_40px_rgba(0,0,0,0.02)] border border-slate-50 p-12 text-center">
                  <Calculator className="w-12 h-12 text-ink-muted mx-auto mb-4" />
                  <p className="text-[9px] md:text-[10px] font-black text-ink-muted uppercase tracking-[0.3em]">
                    No certification logs found in the archive
                  </p>
                </div>
              )}

              {raBills.length > 0 && (
                <div className="bg-slate-900 rounded-[24px] p-6 text-white mt-8">
                  <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-4 text-center">
                    Aggregated Fiscal Output
                  </p>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-1">
                        Total Gross
                      </p>
                      <p className="text-base md:text-lg font-mono font-black text-white/40 tracking-tighter">
                        ₹
                        {raBills
                          .reduce((sum, b) => sum + b.grossAmount, 0)
                          .toLocaleString("en-IN", {
                            maximumFractionDigits: 0,
                          })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] text-white/50 mb-1">
                        Total Net
                      </p>
                      <p className="text-2xl md:text-3xl font-mono font-black text-white tracking-tighter leading-none">
                        ₹
                        {raBills
                          .reduce((sum, b) => sum + b.netAmount, 0)
                          .toLocaleString("en-IN", {
                            maximumFractionDigits: 0,
                          })}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-surface rounded-[24px] md:rounded-[40px] shadow-[0_10px_40px_rgba(0,0,0,0.02)] md:shadow-[0_20px_80px_rgba(0,0,0,0.03)] border border-slate-50 overflow-hidden">
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full text-left min-w-[900px] md:min-w-[1000px]">
                  <thead>
                    <tr className="bg-slate-900 text-white/40 border-b border-white/5">
                      <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-white/30 italic">
                        Ref No.
                      </th>
                      <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-white/30 italic">
                        Date
                      </th>
                      <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-white/80">
                        Vendor
                      </th>
                      <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-white/80 text-right">
                        Gross Amount
                      </th>
                      <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-white/80 text-right">
                        Net Amount
                      </th>
                      <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-white/80 text-center">
                        Status
                      </th>
                      {isAdminOrOwner && (
                        <th className="px-6 md:px-10 py-4 md:py-6 text-right"></th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {raBills.map((bill) => (
                      <tr
                        key={bill.id}
                        className="group hover:bg-panel/50 apple-transition"
                      >
                        <td className="px-6 md:px-10 py-6 md:py-8 font-black text-[#A3711C] tracking-tighter text-sm whitespace-nowrap">
                          {bill.billNumber}
                        </td>
                        <td className="px-6 md:px-10 py-6 md:py-8 font-mono text-[9px] md:text-[10px] font-black text-ink-muted group-hover:text-ink-muted apple-transition">
                          {bill.billDate}
                        </td>
                        <td className="px-6 md:px-10 py-6 md:py-8">
                          <div className="font-black text-ink text-base md:text-lg tracking-tight leading-none truncate max-w-[150px] md:max-w-none">
                            {bill.vendorName}
                          </div>
                        </td>
                        <td className="px-6 md:px-10 py-6 md:py-8 text-right font-black text-ink-muted font-mono text-base md:text-lg tracking-tighter">
                          ₹
                          {bill.grossAmount.toLocaleString("en-IN", {
                            maximumFractionDigits: 0,
                          })}
                        </td>
                        <td className="px-6 md:px-10 py-6 md:py-8 text-right font-black text-ink font-mono text-xl md:text-2xl tracking-tighter">
                          ₹
                          {bill.netAmount.toLocaleString("en-IN", {
                            maximumFractionDigits: 0,
                          })}
                        </td>
                        <td className="px-6 md:px-10 py-6 md:py-8 text-center">
                          <span className="bg-emerald-50 text-emerald-600 px-3 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] border border-emerald-100/50 shadow-sm">
                            {bill.status}
                          </span>
                        </td>
                        {isAdminOrOwner && (
                          <td className="px-6 md:px-10 py-6 md:py-8 text-right">
                            <button
                              onClick={() => handleDeleteRABill(bill.id)}
                              className="opacity-0 group-hover:opacity-100 p-2 text-ink-muted hover:text-red-500 apple-transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {raBills.length === 0 && (
                      <tr>
                        <td
                          colSpan={!isAdminOrOwner ? 6 : 7}
                          className="px-6 md:px-10 py-20 md:py-32 text-center"
                        >
                          <Calculator className="w-12 h-12 md:w-16 md:h-16 text-ink-muted mx-auto mb-4" />
                          <p className="text-[9px] md:text-[10px] font-black text-ink-muted uppercase tracking-[0.3em]">
                            No certification logs found in the archive
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="bg-slate-900 border-t border-white/5">
                    <tr className="font-black text-sm">
                      <td
                        colSpan={3}
                        className="px-6 md:px-10 py-8 md:py-12 text-right uppercase tracking-[0.3em] md:tracking-[0.4em] text-white/20 text-[10px] md:text-[11px]"
                      >
                        Aggregated Fiscal Output
                      </td>
                      <td className="px-6 md:px-10 py-8 md:py-12 text-right font-black text-white/40 font-mono text-xl md:text-2xl tracking-tighter">
                        ₹
                        {raBills
                          .reduce((sum, b) => sum + b.grossAmount, 0)
                          .toLocaleString("en-IN", {
                            maximumFractionDigits: 0,
                          })}
                      </td>
                      <td className="px-6 md:px-10 py-8 md:py-12 text-right font-black text-white font-mono text-2xl md:text-4xl tracking-tighter">
                        ₹
                        {raBills
                          .reduce((sum, b) => sum + b.netAmount, 0)
                          .toLocaleString("en-IN", {
                            maximumFractionDigits: 0,
                          })}
                      </td>
                      {isAdminOrOwner && <td colSpan={2}></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const getExportData = () => {
    let headers: string[] = [];
    let rows: (string | number)[][] = [];

    if (activeTab === "rates") {
      headers = ["Supplier", "Role/Trade", "Rate (₹)", "Unit"];
      rows = rateCards.map((rate) => {
        const matchingVendor = vendors.find((v) => v.id === rate.vendorId);
        return [
          matchingVendor?.name || "N/A",
          rate.role || "",
          rate.rate,
          rate.unit || "Shift",
        ];
      });
    } else {
      headers = [
        "RA Bill No",
        "Supplier",
        "Date",
        "Gross Amount (₹)",
        "Deductions (₹)",
        "Net Payable (₹)",
        "Status",
      ];
      rows = raBills.map((bill) => [
        bill.billNumber || "",
        bill.vendorName || "",
        bill.billDate || "",
        bill.grossAmount || 0,
        bill.deductions || 0,
        bill.netAmount || 0,
        bill.status || "Draft",
      ]);
    }
    return { headers, rows };
  };

  const handleExportCSV = () => {
    const { headers, rows } = getExportData();
    exportToCSV(`Labor_${activeTab}_Export`, headers, rows);
  };

  const handleExportPDF = () => {
    const { headers, rows } = getExportData();
    const formattedRows = rows.map((r) =>
      r.map((val) => typeof val === "number" ? `₹${val.toLocaleString("en-IN")}` : val)
    );
    exportToPDF(`Labor ${activeTab === "rates" ? "Pricing Matrix" : "RA Billing"} Report`, `Project ID: ${projectId}`, headers, formattedRows, `Labor_${activeTab}_Report`);
  };

  return (
    <div className="space-y-6 md:space-y-12 pb-24 md:pb-32">
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 md:gap-8 bg-surface/70 backdrop-blur-xl p-4 md:p-6 rounded-[24px] md:rounded-[32px] border border-white shadow-sm">
        <div className="flex gap-2 bg-panel/50 p-1 md:p-1.5 rounded-xl md:rounded-2xl w-full md:w-fit overflow-x-auto scrollbar-hide ring-1 ring-slate-200/50 shadow-inner">
          {(["rates", "billing"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 md:flex-none px-4 md:px-8 py-2 md:py-2.5 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] apple-transition whitespace-nowrap ${activeTab === tab ? "bg-surface text-[#A3711C] shadow-sm ring-1 ring-slate-200" : "text-ink-muted hover:text-ink/80"}`}
            >
              {tab === "rates" ? "Pricing" : "RA Billing"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={handleExportCSV}
            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-slate-900 text-white px-4 md:px-5 py-2.5 md:py-3 rounded-lg md:rounded-2xl text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] hover:bg-slate-800 apple-transition shadow-lg shadow-slate-200"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button
            onClick={handleExportPDF}
            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-amber-600 text-white px-4 md:px-5 py-2.5 md:py-3 rounded-lg md:rounded-2xl text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] hover:bg-amber-700 apple-transition shadow-lg shadow-amber-200"
          >
            <Download className="w-3.5 h-3.5" /> Export PDF
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "rates" && renderRates()}
          {activeTab === "billing" && renderBilling()}
        </motion.div>
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {isAddingRate && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-surface rounded-[32px] md:rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="bg-slate-900 p-6 md:p-10 text-white flex justify-between items-center">
                <div>
                  <h3 className="text-xl md:text-2xl font-black tracking-tight">
                    Rate Card
                  </h3>
                  <p className="text-white/40 text-[10px] md:text-xs mt-1 uppercase tracking-widest font-bold">
                    Labor Matrix Index
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingRate(false);
                    setEditingRateId(null);
                  }}
                  className="p-2 hover:bg-surface/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 md:w-6 md:h-6" />
                </button>
              </div>
              <form
                onSubmit={handleAddRate}
                className="p-6 md:p-10 space-y-4 md:space-y-6 md:space-y-8"
              >
                <div className="space-y-1.5 md:space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">
                    Vendor
                  </label>
                  <select
                    required
                    className="w-full bg-panel border-2 border-transparent focus:border-[#F3E8D2]0 rounded-xl md:rounded-2xl p-3 md:p-4 outline-none text-xs md:text-sm font-bold appearance-none"
                    value={newRate.vendorId}
                    onChange={(e) =>
                      setNewRate({ ...newRate, vendorId: e.target.value })
                    }
                  >
                    <option value="">Select Vendor</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                  <div className="space-y-1.5 md:space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">
                      Role Type
                    </label>
                    <input
                      required
                      placeholder="e.g. Mason"
                      className="w-full bg-panel border-2 border-transparent focus:border-[#F3E8D2]0 rounded-xl md:rounded-2xl p-3 md:p-4 outline-none text-xs md:text-sm font-bold"
                      value={newRate.role}
                      onChange={(e) =>
                        setNewRate({ ...newRate, role: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5 md:space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">
                      Rate (₹) / Unit
                    </label>
                    <input
                      type="number"
                      required
                      className="w-full bg-panel border-2 border-transparent focus:border-[#F3E8D2]0 rounded-xl md:rounded-2xl p-3 md:p-4 outline-none text-xs md:text-sm font-bold"
                      value={newRate.rate}
                      onChange={(e) =>
                        setNewRate({
                          ...newRate,
                          rate: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full bg-slate-900 text-white py-4 rounded-xl md:rounded-2xl text-xs md:text-sm font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-100"
                >
                  Save Index Entry
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {isDeletingRate && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-surface rounded-[40px] p-10 max-w-md w-full text-center"
            >
              <div className="bg-red-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-10 h-10 text-red-600" />
              </div>
              <h3 className="text-2xl font-black text-ink mb-2">
                Delete Rate Card?
              </h3>
              <p className="text-ink-muted mb-8">
                This will remove this role from future labor deployment
                selections. Existing logs will not be affected.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setIsDeletingRate(null)}
                  className="flex-1 bg-panel text-ink py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-divider transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteRate(isDeletingRate)}
                  disabled={isProcessing}
                  className="flex-1 bg-red-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-xl shadow-red-100 disabled:opacity-50"
                >
                  {isProcessing ? "Deleting..." : "Delete Rate"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
