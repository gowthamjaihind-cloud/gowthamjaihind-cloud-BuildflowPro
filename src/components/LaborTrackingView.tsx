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
import {
  Vendor,
  LaborRateCard,
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
import { useTasksQuery } from "../hooks/queries";

interface LaborTrackingViewProps {
  projectId: string;
}

type Tab = "rates" | "billing";

export const LaborTrackingView: React.FC<LaborTrackingViewProps> = ({
  projectId,
}) => {
  const { user } = useAuthStore();
  const isAdminOrOwner = user?.role === "Admin" || user?.role === "Owner";

  const [activeTab, setActiveTab] = useState<Tab>("rates");
  const queryClient = useQueryClient();

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


  const { data: laborLogs } = useProjectData<DailyLaborLog>(
    projectId,
    "labor_logs",
    "date",
    "desc"
  );

  // Modals
  const [isAddingRate, setIsAddingRate] = useState(false);
  const [isDeletingRate, setIsDeletingRate] = useState<string | null>(null);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Form States
  const [newRate, setNewRate] = useState<Partial<LaborRateCard>>({
    vendorId: "",
    role: "",
    rate: 0,
    unit: "Shift",
  });



  
  const handleAddRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const path = `projects/${projectId}/labor_rate_cards`;
    try {
      if (editingRateId) {
        await updateDoc(doc(db, path, editingRateId), { ...newRate });
      } else {
        await addDoc(collection(db, path), { ...newRate, projectId });
      }
      setIsAddingRate(false);
      setEditingRateId(null);
      setNewRate({ vendorId: "", role: "", rate: 0, unit: "Shift" });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId] });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleDeleteRABill = async (billId: string) => {
    if (!billId || isProcessing) return;
    setIsProcessing(true);
    try {
      await deleteDoc(doc(db, `projects/${projectId}/ra_bills`, billId));
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId] });
    } catch (error) {
      console.error("Delete RA Bill Failed:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteRate = async (rateId: string) => {
    if (!rateId || isProcessing) return;
    setIsProcessing(true);
    const path = `projects/${projectId}/labor_rate_cards/${rateId}`;
    try {
      await deleteDoc(
        doc(db, `projects/${projectId}/labor_rate_cards`, rateId),
      );
      setIsDeletingRate(null);
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
    const path = `projects/${projectId}/ra_bills`;

    try {
      const billNumber = `RA-${vendor.name.substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`;
      const billData: Omit<RABill, "id"> = {
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

      await addDoc(collection(db, path), billData);
      alert(`RA Bill ${billNumber} generated successfully!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
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
      <ChevronUp className="w-3 h-3 text-indigo-500" />
    ) : (
      <ChevronDown className="w-3 h-3 text-indigo-500" />
    );
  };

  const renderRates = () => {
    const ratesByVendor = vendors.map((vendor) => ({
      vendor,
      rates: rateCards.filter((r) => r.vendorId === vendor.id),
    }));

    return (
      <div className="space-y-12">
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

        <div className="space-y-16">
          {ratesByVendor.map(({ vendor, rates }) => (
            <div key={vendor.id} className="space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-slate-900 text-white rounded-[18px] flex items-center justify-center font-black text-lg shadow-lg shadow-slate-200">
                    {vendor.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-xl md:text-2xl font-black text-ink tracking-tight leading-none mb-1">
                      {vendor.name}
                    </h3>
                    <div className="flex items-center gap-3">
                      <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">
                        {rates.length} Labor Classifications
                      </p>
                      <div className="w-1 h-1 rounded-full bg-divider" />
                      <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
                        ID: {vendor.id.slice(0, 8)}
                      </p>
                    </div>
                  </div>
                </div>
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
                  className="bg-panel text-ink px-6 py-3 rounded-xl hover:bg-slate-900 hover:text-white apple-transition shadow-sm flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] border border-divider"
                >
                  <Plus className="w-4 h-4" /> Add Rate for{" "}
                  {vendor.name.split(" ")[0]}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {rates.length === 0 ? (
                  <div className="col-span-full py-16 text-center bg-panel/50 border-2 border-dashed border-divider rounded-[40px]">
                    <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                      <Briefcase className="w-8 h-8 text-ink-muted" />
                    </div>
                    <p className="text-[10px] font-black text-ink-muted uppercase tracking-[0.3em] italic">
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
                      className="mt-4 text-indigo-600 text-[10px] font-black uppercase tracking-widest hover:underline"
                    >
                      Initialize Rate Sheet
                    </button>
                  </div>
                ) : (
                  rates.map((rate) => (
                    <div
                      key={rate.id}
                      className="bg-surface p-8 rounded-[32px] border border-slate-50 shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.05)] apple-transition group relative overflow-hidden border-b-4 border-b-transparent hover:border-b-amber-500"
                    >
                      <div className="flex justify-between items-start mb-8">
                        <div className="bg-panel p-4 rounded-2xl group-hover:bg-amber-50 group-hover:text-amber-600 apple-transition">
                          <Users className="w-6 h-6" />
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-ink-muted mb-1">
                            Daily Yield
                          </p>
                          <p className="text-2xl font-black text-emerald-600 font-mono tracking-tighter">
                            ₹{rate.rate.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                          </p>
                          <p className="text-[10px] text-ink-muted font-black uppercase tracking-widest">
                            / {rate.unit}
                          </p>
                        </div>
                      </div>
                      <h3 className="text-xl font-black text-ink tracking-tight mb-8 leading-tight">
                        {rate.role}
                      </h3>

                      {isAdminOrOwner && (
                        <div className="flex justify-start gap-2 opacity-0 group-hover:opacity-100 apple-transition transform translate-y-2 group-hover:translate-y-0">
                          <button
                            onClick={() => {
                              setNewRate({
                                vendorId: rate.vendorId,
                                role: rate.role,
                                rate: rate.rate,
                                unit: rate.unit,
                              });
                              setEditingRateId(rate.id);
                              setIsAddingRate(true);
                            }}
                            className="p-3 bg-panel text-ink-muted rounded-xl hover:bg-slate-900 hover:text-white apple-transition shadow-sm"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setIsDeletingRate(rate.id)}
                            className="p-3 bg-panel text-ink-muted rounded-xl hover:bg-red-500 hover:text-white apple-transition shadow-sm"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderBilling = () => {
    // RA Bill Logic - Calculate summary per vendor
    const raBillsSummary = vendors
      .map((vendor) => {
        const vendorLogs = laborLogs.filter((l) => l.vendorId === vendor.id);
        const grossAmount = vendorLogs.reduce((sum, l) => sum + l.totalCost, 0);
        const vendorLedger = ledger.filter((e) => e.vendorId === vendor.id);
        const totalPaid = vendorLedger
          .filter((e) => e.type === "DEBIT")
          .reduce((sum, e) => sum + e.amount, 0);
        const netPayable = grossAmount - totalPaid;

        return {
          vendor,
          grossAmount,
          totalPaid,
          netPayable,
          logCount: vendorLogs.length,
          logIds: vendorLogs.map((l) => l.id),
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
                  <div className="bg-slate-900 text-white p-4 md:p-6 rounded-[24px] md:rounded-[32px] shadow-2xl shadow-slate-200 group-hover:bg-indigo-600 apple-transition">
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
                      ₹{bill.grossAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="flex-1 min-w-[100px]">
                    <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] text-ink-muted mb-2 md:mb-3">
                      Amount Paid
                    </p>
                    <p className="text-base md:text-2xl font-mono font-black text-emerald-600 tracking-tighter leading-none">
                      ₹{bill.totalPaid.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="flex-1 min-w-[140px] bg-red-50/50 p-4 md:p-6 rounded-2xl md:rounded-[32px] border border-red-100 shadow-inner">
                    <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] text-red-300 mb-2 md:mb-3">
                      Outstanding
                    </p>
                    <p className="text-xl md:text-2xl font-mono font-black text-red-500 tracking-tighter leading-none">
                      ₹{bill.netPayable.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
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
                    {isAdminOrOwner && <th className="px-6 md:px-10 py-4 md:py-6 text-right"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {raBills.map((bill) => (
                    <tr
                      key={bill.id}
                      className="group hover:bg-panel/50 apple-transition"
                    >
                      <td className="px-6 md:px-10 py-6 md:py-8 font-black text-indigo-600 tracking-tighter text-sm whitespace-nowrap">
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
                        ₹{bill.grossAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-6 md:px-10 py-6 md:py-8 text-right font-black text-ink font-mono text-xl md:text-2xl tracking-tighter">
                        ₹{bill.netAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
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
                        .toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-6 md:px-10 py-8 md:py-12 text-right font-black text-white font-mono text-2xl md:text-4xl tracking-tighter">
                      ₹
                      {raBills
                        .reduce((sum, b) => sum + b.netAmount, 0)
                        .toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </td>
                    {isAdminOrOwner && <td colSpan={2}></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleExportCSV = () => {
    let headers: string[] = [];
    let rows: any[][] = [];

    if (activeTab === "rates") {
      headers = [
        "Supplier",
        "Role/Trade",
        "Daily Rate",
        "UOM",
        "Last Updated"
      ];
      rows = rateCards.map(rate => [
        `"${rate.vendorName || ""}"`,
        `"${rate.role || ""}"`,
        rate.dailyRate,
        `"${rate.uom || ""}"`,
        rate.updatedAt ? (rate.updatedAt as any).seconds ? new Date((rate.updatedAt as any).seconds * 1000).toLocaleDateString() : new Date(rate.updatedAt as any).toLocaleDateString() : ""
      ]);
    } else {
      headers = [
        "RA Bill No",
        "Supplier",
        "Date",
        "Gross Amount",
        "Deductions",
        "Net Payable",
        "Status"
      ];
      rows = raBills.map(bill => [
        `"${bill.billNumber || ""}"`,
        `"${bill.vendorName || ""}"`,
        `"${bill.billDate || ""}"`,
        bill.grossAmount,
        bill.deductions,
        bill.netAmount,
        `"${bill.status || ""}"`
      ]);
    }

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `${projectId}_${activeTab}_export.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 md:space-y-12 pb-24 md:pb-32">
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 md:gap-8 bg-surface/70 backdrop-blur-xl p-4 md:p-6 rounded-[24px] md:rounded-[32px] border border-white shadow-sm">
        <div className="flex gap-2 bg-panel/50 p-1 md:p-1.5 rounded-xl md:rounded-2xl w-full md:w-fit overflow-x-auto scrollbar-hide ring-1 ring-slate-200/50 shadow-inner">
          {(["rates", "billing"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 md:flex-none px-4 md:px-8 py-2 md:py-2.5 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] apple-transition whitespace-nowrap ${activeTab === tab ? "bg-surface text-indigo-600 shadow-sm ring-1 ring-slate-200" : "text-ink-muted hover:text-ink/80"}`}
            >
              {tab === "rates" ? "Pricing" : "RA Billing"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="hidden sm:flex flex-1 md:flex-none items-center justify-center gap-2 px-4 py-2 bg-indigo-50 rounded-lg md:rounded-2xl border border-indigo-100/50">
            <Users className="w-4 h-4 text-indigo-600" />
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest leading-none">
              Active Workload
            </span>
          </div>
          <button
            onClick={handleExportCSV}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-900 text-white px-6 md:px-8 py-2.5 md:py-3 rounded-lg md:rounded-2xl text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-800 apple-transition shadow-lg shadow-slate-200"
          >
            <Download className="w-3.5 h-3.5 md:w-4 md:h-4" /> Export
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
                    className="w-full bg-panel border-2 border-transparent focus:border-indigo-500 rounded-xl md:rounded-2xl p-3 md:p-4 outline-none text-xs md:text-sm font-bold appearance-none"
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
                      className="w-full bg-panel border-2 border-transparent focus:border-indigo-500 rounded-xl md:rounded-2xl p-3 md:p-4 outline-none text-xs md:text-sm font-bold"
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
                      className="w-full bg-panel border-2 border-transparent focus:border-indigo-500 rounded-xl md:rounded-2xl p-3 md:p-4 outline-none text-xs md:text-sm font-bold"
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
