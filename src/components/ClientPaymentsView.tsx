import React, { useState, useMemo } from "react";
import { exportToCSV, exportToPDF } from "../utils/exportUtils";
import {
  Plus,
  X,
  CurrencyInr as IndianRupee,
  HandCoins,
  Buildings as Building2,
  ArrowDownRight,
  ArrowUpRight,
  DownloadSimple as Download,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { CountUp } from "./motion";
import { ClientPayment, VendorLedgerEntry, Vendor, CostEntry } from "../types";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { collection, doc, setDoc, deleteDoc } from "firebase/firestore";
import { motion, AnimatePresence } from "motion/react";
import { useAuthStore } from "../store";
import { useQueryClient } from "@tanstack/react-query";

interface PaymentsViewProps {
  projectId: string;
  clientPayments: ClientPayment[];
  vendorLedger: VendorLedgerEntry[];
  vendors: Vendor[];
  costEntries: CostEntry[];
}

export const ClientPaymentsView: React.FC<PaymentsViewProps> = ({
  projectId,
  clientPayments,
  vendorLedger,
  vendors,
  costEntries,
}) => {

  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;
  const isAdminOrOwner = user?.role === "Admin" || user?.role === "Owner";

  const [isAdding, setIsAdding] = useState(false);
  const [newPayment, setNewPayment] = useState<Partial<ClientPayment>>({
    date: format(new Date(), "yyyy-MM-dd"),
    amount: 0,
    referenceNumber: "",
    description: "",
    paymentMethod: "Bank Transfer",
  });

  const totalClientReceived = clientPayments.reduce(
    (sum, p) => sum + (p.amount || 0),
    0,
  );

  // Vendor Payments: usually a DEBIT in vendor ledger (payment made to vendor)
  const totalVendorPaid = vendorLedger
    .filter((l) => l.type === "DEBIT")
    .reduce((sum, l) => sum + (l.amount || 0), 0);

  const totalDirectCosts = costEntries.filter((c) => c.type === "Actual" && !c.isAccrual)
    .reduce((sum, c) => sum + (c.amount || 0), 0);

  const netCashFlow = totalClientReceived - totalVendorPaid - totalDirectCosts;

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminOrOwner) return;
    try {
      const docRef = doc(
        collection(db, `${basePath}/client_payments`),
      );
      await setDoc(docRef, {
        id: docRef.id,
        projectId,
        ...newPayment,
        amount: Number(newPayment.amount),
      });
      setIsAdding(false);
      setNewPayment({
        date: format(new Date(), "yyyy-MM-dd"),
        amount: 0,
        referenceNumber: "",
        description: "",
        paymentMethod: "Bank Transfer",
      });
      queryClient.invalidateQueries({ queryKey: ["projectData", projectId] });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.CREATE,
        `${basePath}/client_payments`,
      );
    }
  };

  const handleDelete = async (
    id: string,
    type: "CLIENT" | "VENDOR" | "DIRECT_COST",
  ) => {
    if (type === "VENDOR") {
      alert(
        "Vendor payments must be deleted from the Procurement / Ledger section.",
      );
      return;
    }
    if (type === "DIRECT_COST") {
      alert(
        "Direct costs must be deleted from the Cost Management / Tasks section.",
      );
      return;
    }
    if (type === "CLIENT" && !isAdminOrOwner) return;

    if (!confirm("Are you sure you want to delete this payment record?"))
      return;
    try {
      await deleteDoc(doc(db, `${basePath}/client_payments`, id));
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `${basePath}/client_payments/${id}`,
      );
    }
  };

  const combinedLedger = useMemo(() => {
    const list: {
      id: string;
      date: string;
      description: string;
      reference: string;
      inward: number;
      outward: number;
      type: "CLIENT" | "VENDOR" | "DIRECT_COST";
      originalId: string;
      method?: string;
    }[] = [];

    clientPayments.forEach((p) => {
      list.push({
        id: p.id,
        date: p.date,
        description: p.description || "Client Payment",
        reference: p.referenceNumber || "-",
        inward: p.amount || 0,
        outward: 0,
        type: "CLIENT",
        originalId: p.id,
        method: p.paymentMethod,
      });
    });

    vendorLedger
      .filter((l) => l.type === "DEBIT")
      .forEach((l) => {
        const vendorName =
          vendors.find((v) => v.id === l.vendorId)?.name || "Vendor";
        list.push({
          id: l.id,
          date: l.date,
          description: `Payment to ${vendorName}`,
          reference: l.referenceId || l.referenceType || "-",
          inward: 0,
          outward: l.amount || 0,
          type: "VENDOR",
          originalId: l.id,
        });
      });

    costEntries
      .filter((c) => c.type === "Actual" && !c.isAccrual)
      .forEach((c) => {
        list.push({
          id: c.id,
          date: c.date,
          description: c.description || "Direct Cost",
          reference: c.category || "-",
          inward: 0,
          outward: c.amount || 0,
          type: "DIRECT_COST",
          originalId: c.id,
        });
      });

    // sort asc by date
    list.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    let runningBalance = 0;
    return list.map((item) => {
      runningBalance += item.inward - item.outward;
      return { ...item, balance: runningBalance };
    });
  }, [clientPayments, vendorLedger, vendors, costEntries]);

  const handleExportCSV = () => {
    const headers = ["Date", "Description", "Reference", "Type", "Inward Received (₹)", "Outward Paid (₹)", "Running Balance (₹)"];
    const rows = combinedLedger.map((row) => [
      row.date || "",
      row.description || "",
      row.reference || "",
      row.type || "",
      row.inward || 0,
      row.outward || 0,
      row.balance || 0,
    ]);
    const dateStr = new Date().toISOString().split("T")[0];
    exportToCSV(`Cash_Book_Ledger_${dateStr}`, headers, rows);
  };

  const handleExportPDF = () => {
    const headers = ["Date", "Description", "Ref", "Type", "Inward (₹)", "Outward (₹)", "Balance (₹)"];
    const rows = combinedLedger.map((row) => [
      row.date || "",
      row.description || "",
      row.reference || "",
      row.type || "",
      `₹${(row.inward || 0).toLocaleString("en-IN")}`,
      `₹${(row.outward || 0).toLocaleString("en-IN")}`,
      `₹${(row.balance || 0).toLocaleString("en-IN")}`,
    ]);
    const dateStr = new Date().toISOString().split("T")[0];
    exportToPDF(
      "INTEGRATED CASH BOOK LEDGER",
      `Project ID: ${projectId} | Inward: ₹${totalClientReceived.toLocaleString("en-IN")} | Outward: ₹${(totalVendorPaid + totalDirectCosts).toLocaleString("en-IN")}`,
      headers,
      rows,
      `Cash_Book_Ledger_${dateStr}`
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface border p-6 rounded-2xl shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-semibold text-ink-muted">
                Total Client Received
              </p>
              <h3 className="text-3xl font-black text-success mt-1">
                ₹
                <CountUp
                  value={totalClientReceived}
                  format={(n) =>
                    n.toLocaleString("en-IN", { maximumFractionDigits: 0 })
                  }
                />
              </h3>
            </div>
            <div className="bg-success/20 p-3 rounded-xl text-success">
              <Building2 className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-surface border p-6 rounded-2xl shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-semibold text-ink-muted">
                Total Vendor Paid
              </p>
              <h3 className="text-3xl font-black text-danger mt-1">
                ₹
                <CountUp
                  value={totalVendorPaid}
                  format={(n) =>
                    n.toLocaleString("en-IN", { maximumFractionDigits: 0 })
                  }
                />
              </h3>
            </div>
            <div className="bg-danger/15 p-3 rounded-xl text-danger">
              <HandCoins className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-surface border p-6 rounded-2xl shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-semibold text-ink-muted">
                Cash on Hand
              </p>
              <h3
                className={`text-3xl font-black mt-1 ${netCashFlow >= 0 ? "text-primary" : "text-[#C0653F]"}`}
              >
                ₹
                <CountUp
                  value={netCashFlow}
                  format={(n) =>
                    n.toLocaleString("en-IN", { maximumFractionDigits: 0 })
                  }
                />
              </h3>
            </div>
            <div
              className={`p-3 rounded-xl ${netCashFlow >= 0 ? "bg-[#F7E4DB] text-primary" : "bg-primary/15 text-[#C0653F]"}`}
            >
              <IndianRupee className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-2xl border shadow-sm overflow-hidden">
        <div className="p-6 border-b bg-panel/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h3 className="text-lg font-bold text-ink">
            Integrated Ledger (Cash Book)
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 bg-panel hover:bg-divider border border-divider rounded-xl text-xs font-bold uppercase tracking-wider text-ink transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-ink/80" />
              CSV
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#C0653F] hover:bg-[#A0522F] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              PDF
            </button>
            {isAdminOrOwner && (
              <button
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-primary/90 transition-colors ml-1"
              >
                <Plus className="w-4 h-4" /> Add Payment
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-panel border-b text-[10px] font-black uppercase tracking-wider text-ink-muted">
                <th className="p-4">Date</th>
                <th className="p-4">Description</th>
                <th className="p-4">Ref/Method</th>
                <th className="p-4 text-right">Inward (₹)</th>
                <th className="p-4 text-right">Outward (₹)</th>
                <th className="p-4 text-right">Balance (₹)</th>
                <th className="p-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {combinedLedger.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="p-5 text-center text-ink-muted italic"
                  >
                    No transactions recorded yet.
                  </td>
                </tr>
              ) : (
                [...combinedLedger].reverse().map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b last:border-0 hover:bg-panel/50 transition-colors"
                  >
                    <td className="p-4 font-medium">
                      {format(new Date(entry.date), "dd MMM yyyy")}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {entry.type === "CLIENT" ? (
                          <ArrowDownRight className="w-4 h-4 text-success" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4 text-danger" />
                        )}
                        <span
                          className={
                            entry.type === "CLIENT"
                              ? "text-success font-semibold"
                              : "text-danger"
                          }
                        >
                          {entry.description}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="font-mono text-xs text-ink-muted">
                          {entry.reference}
                        </span>
                        {entry.method && (
                          <span className="text-[10px] font-semibold text-ink-muted/80">
                            {entry.method}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      {entry.inward > 0 ? (
                        <span className="font-bold text-success">
                          {entry.inward.toLocaleString("en-IN", {
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {entry.outward > 0 ? (
                        <span className="font-bold text-danger">
                          {entry.outward.toLocaleString("en-IN", {
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="p-4 text-right font-black text-ink">
                      {entry.balance.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td className="p-4">
                      {entry.type === "CLIENT" && isAdminOrOwner && (
                        <button
                          onClick={() =>
                            handleDelete(entry.originalId, entry.type)
                          }
                          className="p-1 text-ink-muted hover:text-danger hover:bg-danger/8 rounded transition-colors"
                          title="Delete record"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-onyx/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-surface rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="bg-primary p-6 text-white flex justify-between items-center">
                <h3 className="text-lg font-bold">Record Client Payment</h3>
                <button
                  onClick={() => setIsAdding(false)}
                  className="hover:bg-white/20 p-1 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddPayment} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-ink-muted">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={newPayment.date}
                    onChange={(e) =>
                      setNewPayment({ ...newPayment, date: e.target.value })
                    }
                    className="w-full bg-panel p-3 rounded-xl border outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-ink-muted">
                    Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={newPayment.amount || ""}
                    onChange={(e) =>
                      setNewPayment({
                        ...newPayment,
                        amount: Number(e.target.value),
                      })
                    }
                    className="w-full bg-panel p-3 rounded-xl border outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-ink-muted">
                    Description
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mobilization Advance"
                    value={newPayment.description}
                    onChange={(e) =>
                      setNewPayment({
                        ...newPayment,
                        description: e.target.value,
                      })
                    }
                    className="w-full bg-panel p-3 rounded-xl border outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-ink-muted">
                      Reference / Cheque No.
                    </label>
                    <input
                      type="text"
                      required
                      value={newPayment.referenceNumber}
                      onChange={(e) =>
                        setNewPayment({
                          ...newPayment,
                          referenceNumber: e.target.value,
                        })
                      }
                      className="w-full bg-panel p-3 rounded-xl border outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-ink-muted">
                      Method
                    </label>
                    <select
                      value={newPayment.paymentMethod}
                      onChange={(e) =>
                        setNewPayment({
                          ...newPayment,
                          paymentMethod: e.target.value,
                        })
                      }
                      className="w-full bg-panel p-3 rounded-xl border outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option>Bank Transfer</option>
                      <option>Cheque</option>
                      <option>Cash</option>
                      <option>UPI</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="flex-1 px-4 py-3 bg-panel hover:bg-surface border rounded-xl font-bold text-ink-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-3 bg-success hover:bg-success text-white rounded-xl font-bold shadow-md transition-colors"
                  >
                    Save Payment
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
