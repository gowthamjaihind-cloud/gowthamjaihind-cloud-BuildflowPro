import { useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { exportToCSV, exportToPDF } from "../../utils/exportUtils";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  CheckCircle,
  DownloadSimple as Download,
  FileText,
  Trash as Trash2,
  CircleNotch as Loader2,
  Package as PackagePlus,
} from "@phosphor-icons/react";
import { PurchaseOrder, GoodsReceiptNote } from "../../types";
import { useAuthStore } from "../../store";
import { doc, updateDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import { GoodsReceiptForm } from "./GoodsReceiptForm";
import { GoodsReceiptDetails } from "./GoodsReceiptDetails";

interface PurchaseOrderDetailsProps {
  po: PurchaseOrder;
  projectId: string;
  onClose: () => void;
}

export const PurchaseOrderDetails: React.FC<PurchaseOrderDetailsProps> = ({ po, projectId, onClose }) => {
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();
  const [isApproving, setIsApproving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showGRNForm, setShowGRNForm] = useState(false);

  const isAdminOrOwner = user?.role === "Admin" || user?.role === "Owner";
  const canEditOrDelete = isAdminOrOwner || (po.status === "Draft" && po.createdByUid === user?.uid);

  const tenantPathLogs = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;
  const poRef = doc(db, `${tenantPathLogs}/purchase_orders`, po.id);

  const handleApprove = async () => {
    if (!isAdminOrOwner || !user) return;
    setIsApproving(true);
    try {
      await updateDoc(poRef, {
        status: "Approved",
        approvedByUid: user.uid,
        approvedByName: user.displayName || user.email || "Unknown",
        approvedAt: new Date().toISOString()
      });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'purchase_orders'] });
      onClose();
    } catch (e) {
      console.error(e);
      alert("Failed to approve PO");
    } finally {
      setIsApproving(false);
    }
  };

  const handleDelete = async () => {
    if (!canEditOrDelete) return;
    if (!confirm("Delete this Purchase Order?")) return;
    setIsDeleting(true);
    try {
      await deleteDoc(poRef);
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'purchase_orders'] });
      onClose();
    } catch (e) {
      console.error(e);
      alert("Failed to delete PO");
    } finally {
      setIsDeleting(false);
    }
  };

  const getPOExportData = () => {
    const headers = ["Item Name", "Ordered Qty", "Unit", "Rate (₹)", "Amount (₹)"];
    const items = po.lineItems || [];
    const rows = items.map(item => [
      item.name || "",
      item.orderedQty || 0,
      item.unit || "",
      item.rate || 0,
      item.amount || 0
    ]);
    return { headers, rows };
  };

  const handleExportCSV = () => {
    const { headers, rows } = getPOExportData();
    exportToCSV(`PO_${po.poNumber}`, headers, rows);
  };

  const handleExportPDF = () => {
    const { headers, rows } = getPOExportData();
    const formattedRows = rows.map(r => [
      r[0],
      r[1],
      r[2],
      `₹${Number(r[3]).toLocaleString("en-IN")}`,
      `₹${Number(r[4]).toLocaleString("en-IN")}`
    ]);
    exportToPDF(`PURCHASE ORDER: ${po.poNumber}`, `Vendor: ${po.vendorName} | Date: ${po.orderDate} | Total: ₹${po.totalAmount.toLocaleString("en-IN")}`, headers, formattedRows, `PO_${po.poNumber}`);
  };

  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-50 flex items-center justify-end p-4 sm:p-6 overflow-hidden">
      <motion.div
        initial={{ x: "100%", opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="bg-surface w-full max-w-3xl h-full rounded-[24px] shadow-2xl flex flex-col overflow-hidden"
      >
         <div className="flex justify-between items-center p-6 border-b border-divider bg-panel sticky top-0 z-10 shrink-0">
           <div>
             <h2 className="text-xl font-black text-ink tracking-tight mb-1">{po.poNumber}</h2>
             <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">{po.status} • {po.vendorName}</p>
           </div>
           <div className="flex items-center gap-2">
             <button
               onClick={handleExportCSV}
               className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-divider rounded-lg transition text-ink text-[10px] font-bold uppercase tracking-wider border border-divider cursor-pointer"
               title="Export CSV"
             >
               <Download className="w-3.5 h-3.5 text-ink/80" /> CSV
             </button>
             <button
               onClick={handleExportPDF}
               className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C0653F] hover:bg-[#A0522F] text-white rounded-lg transition text-[10px] font-bold uppercase tracking-wider shadow-sm cursor-pointer"
               title="Export PDF"
             >
               <Download className="w-3.5 h-3.5" /> PDF
             </button>
             <button type="button" onClick={onClose} className="p-2 bg-white hover:bg-divider rounded-full transition text-ink cursor-pointer ml-1">
               <X className="w-5 h-5" />
             </button>
           </div>
         </div>
         
         <div className="flex-1 overflow-y-auto p-6 space-y-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 bg-panel p-6 rounded-2xl border border-divider">
               <div>
                  <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">Date</p>
                  <p className="text-sm font-semibold text-ink font-mono">{po.orderDate}</p>
               </div>
               {po.expectedDeliveryDate && (
                  <div>
                    <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">Expected</p>
                    <p className="text-sm font-semibold text-primary font-mono">{po.expectedDeliveryDate}</p>
                  </div>
               )}
               <div>
                  <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">Created By</p>
                  <p className="text-sm font-semibold text-ink">{po.createdByName}</p>
               </div>
               <div>
                  <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">Status</p>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                     po.status === 'Draft' ? 'bg-ice text-[#56778E]' :
                     po.status === 'Approved' ? 'bg-[#E2E8ED] text-[#56778E]' :
                     po.status === 'Partially Received' ? 'bg-[#D97D54]/10 text-[#C0653F]' :
                     'bg-[#34D399]/12 text-[#059669]'
                  }`}>
                     {po.status}
                  </span>
               </div>
            </div>

            <div>
               <h3 className="text-xs font-black text-ink uppercase tracking-widest mb-4 border-b border-divider pb-2">Line Items</h3>
               <div className="bg-panel rounded-2xl border border-divider overflow-hidden">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="bg-divider/30 text-[10px] font-bold text-ink-muted uppercase tracking-widest border-b border-divider">
                           <th className="p-4">Item</th>
                           <th className="p-4 text-right">Qty</th>
                           <th className="p-4 text-right">Received</th>
                           <th className="p-4 text-right">Rate</th>
                           <th className="p-4 text-right">Amount</th>
                        </tr>
                     </thead>
                     <tbody className="text-sm font-medium">
                        {po.lineItems.map((item, i) => (
                           <tr key={i} className="border-b border-divider/50 last:border-none">
                              <td className="p-4">{item.name}</td>
                              <td className="p-4 text-right font-mono">{item.orderedQty} {item.unit}</td>
                              <td className="p-4 text-right font-mono text-[#059669] font-bold">{item.receivedQty || 0} {item.unit}</td>
                              <td className="p-4 text-right font-mono">₹{item.rate.toLocaleString("en-IN")}</td>
                              <td className="p-4 text-right font-mono text-ink">₹{item.amount.toLocaleString("en-IN")}</td>
                           </tr>
                        ))}
                     </tbody>
                     <tfoot className="bg-[#F7E4DB] border-t border-[#F7E4DB]">
                        {([["loading", "Loading charges"], ["transport", "Transport charges"], ["other", "Other charges"]] as const).map(([key, label]) =>
                           po.charges?.[key] ? (
                              <tr key={key}>
                                 <td colSpan={4} className="px-4 py-1.5 text-right text-[11px] font-bold text-[#B85F3B]/80 uppercase tracking-widest">{label}</td>
                                 <td className="px-4 py-1.5 text-right font-mono text-[#B85F3B]">₹{po.charges[key]!.toLocaleString("en-IN")}</td>
                              </tr>
                           ) : null,
                        )}
                        <tr>
                           <td colSpan={4} className="p-4 text-right text-[11px] font-black text-[#D97D54] uppercase tracking-widest">Total Amount</td>
                           <td className="p-4 text-right text-lg font-black font-mono text-[#D97D54] tracking-tight">₹{po.totalAmount.toLocaleString("en-IN")}</td>
                        </tr>
                     </tfoot>
                  </table>
               </div>
               
               {po.notes && (
                  <div className="mt-6 p-4 bg-yellow-50/50 border border-[#D97D54]/20 rounded-xl">
                     <p className="text-[10px] font-black text-[#C0653F] uppercase tracking-widest mb-1.5">Notes</p>
                     <p className="text-sm font-medium text-ink/80">{po.notes}</p>
                  </div>
               )}
            </div>
         </div>

         <div className="p-6 border-t border-divider bg-panel flex flex-wrap justify-end gap-4 shrink-0">
            {(po.status === "Approved" || po.status === "Partially Received") && (
               <button onClick={() => setShowGRNForm(true)} className="px-6 py-3 bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold uppercase tracking-widest rounded-xl transition flex items-center gap-2 cursor-pointer shadow-[0_4px_20px_rgba(5,150,105,0.2)]">
                 <PackagePlus className="w-4 h-4" /> Record Goods Receipt
               </button>
            )}
            {canEditOrDelete && (
               <button onClick={handleDelete} disabled={isDeleting} className="px-6 py-3 bg-[#EF4444]/8 hover:bg-[#EF4444]/15 text-[#EF4444] text-xs font-bold uppercase tracking-widest rounded-full transition flex items-center gap-2 cursor-pointer">
                 {isDeleting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4" />} {po.status === "Draft" ? "Delete Draft" : "Delete PO"}
               </button>
            )}
            {po.status === "Draft" && isAdminOrOwner && (
               <button onClick={handleApprove} disabled={isApproving} className="px-6 py-3 bg-[#D97D54] hover:bg-[#B85F3B] text-white text-xs font-bold uppercase tracking-widest rounded-xl transition flex items-center gap-2 cursor-pointer shadow-[0_4px_20px_rgba(79,70,229,0.2)]">
                 {isApproving ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4" />} Approve Order
               </button>
            )}
         </div>
      </motion.div>

      <AnimatePresence>
         {showGRNForm && po && (
            <GoodsReceiptForm
               po={po}
               projectId={projectId}
               onClose={() => setShowGRNForm(false)}
            />
         )}
      </AnimatePresence>
    </div>
  );
};
