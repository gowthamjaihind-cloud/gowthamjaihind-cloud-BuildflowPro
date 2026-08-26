import { useQueryClient } from "@tanstack/react-query";
import { money } from "../../utils/num";
import React, { useState } from "react";
import { exportToCSV, exportToPDF } from "../../utils/exportUtils";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  CheckCircle,
  DownloadSimple as Download,
  PencilSimple as Edit3,
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
import { useL } from "../../i18n";

interface PurchaseOrderDetailsProps {
  po: PurchaseOrder;
  projectId: string;
  onClose: () => void;
  onEdit?: (po: PurchaseOrder) => void;
}

export const PurchaseOrderDetails: React.FC<PurchaseOrderDetailsProps> = ({ po, projectId, onClose, onEdit }) => {
  const L = useL();
  const statusLabel = (st: string) => ({
    Draft: L("Draft", "வரைவு"),
    Approved: L("Approved", "அங்கீகரிக்கப்பட்டது"),
    "Partially Received": L("Partially Received", "பகுதி பெறப்பட்டது"),
    Closed: L("Closed", "மூடப்பட்டது"),
  } as Record<string, string>)[st] || st;
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
      alert(L("Failed to approve PO","கொள்முதல் ஆணையை அங்கீகரிக்க முடியவில்லை"));
    } finally {
      setIsApproving(false);
    }
  };

  const handleDelete = async () => {
    if (!canEditOrDelete) return;
    if (!confirm(L("Delete this Purchase Order?","இந்த கொள்முதல் ஆணையை நீக்கவா?"))) return;
    setIsDeleting(true);
    try {
      await deleteDoc(poRef);
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'purchase_orders'] });
      onClose();
    } catch (e) {
      console.error(e);
      alert(L("Failed to delete PO","கொள்முதல் ஆணையை நீக்க முடியவில்லை"));
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
    exportToPDF(`PURCHASE ORDER: ${po.poNumber}`, `Vendor: ${po.vendorName} | Date: ${po.orderDate} | Total: ₹${money(po.totalAmount)}`, headers, formattedRows, `PO_${po.poNumber}`);
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
             <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">{statusLabel(po.status)} • {po.vendorName}</p>
           </div>
           <div className="flex items-center gap-2">
             {po.status === "Draft" && canEditOrDelete && onEdit && (
               <button
                 onClick={() => onEdit(po)}
                 className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-divider rounded-lg transition text-ink text-[10px] font-bold uppercase tracking-wider border border-divider cursor-pointer"
                 title={L("Edit draft PO","வரைவு கொள்முதல் ஆணையைத் திருத்து")}
               >
                 <Edit3 className="w-3.5 h-3.5 text-ink/80" /> {L("Edit","திருத்து")}
               </button>
             )}
             <button
               onClick={handleExportCSV}
               className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-divider rounded-lg transition text-ink text-[10px] font-bold uppercase tracking-wider border border-divider cursor-pointer"
               title={L("Export CSV","CSV எக்ஸ்போர்ட்")}
             >
               <Download className="w-3.5 h-3.5 text-ink/80" /> CSV
             </button>
             <button
               onClick={handleExportPDF}
               className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C0653F] hover:bg-[#A0522F] text-white rounded-lg transition text-[10px] font-bold uppercase tracking-wider shadow-sm cursor-pointer"
               title={L("Export PDF","PDF எக்ஸ்போர்ட்")}
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
                  <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">{L("Date","தேதி")}</p>
                  <p className="text-sm font-semibold text-ink font-mono">{po.orderDate}</p>
               </div>
               {po.expectedDeliveryDate && (
                  <div>
                    <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">{L("Expected","எதிர்பார்க்கப்படுவது")}</p>
                    <p className="text-sm font-semibold text-primary font-mono">{po.expectedDeliveryDate}</p>
                  </div>
               )}
               <div>
                  <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">{L("Created By","உருவாக்கியவர்")}</p>
                  <p className="text-sm font-semibold text-ink">{po.createdByName}</p>
               </div>
               <div>
                  <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">{L("Status","நிலை")}</p>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                     po.status === 'Draft' ? 'bg-ice text-[#56778E]' :
                     po.status === 'Approved' ? 'bg-[#E2E8ED] text-[#56778E]' :
                     po.status === 'Partially Received' ? 'bg-primary/10 text-[#C0653F]' :
                     'bg-success/12 text-success'
                  }`}>
                     {statusLabel(po.status)}
                  </span>
               </div>
            </div>

            <div>
               <h3 className="text-xs font-black text-ink uppercase tracking-widest mb-4 border-b border-divider pb-2">{L("Line Items","வரி உருப்படிகள்")}</h3>
               <div className="bg-panel rounded-2xl border border-divider overflow-hidden">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="bg-divider/30 text-[10px] font-bold text-ink-muted uppercase tracking-widest border-b border-divider">
                           <th className="p-4">{L("Item","உருப்படி")}</th>
                           <th className="p-4 text-right">{L("Qty","அளவு")}</th>
                           <th className="p-4 text-right">{L("Received","பெற்றது")}</th>
                           <th className="p-4 text-right">{L("Rate","விலை")}</th>
                           <th className="p-4 text-right">{L("Amount","தொகை")}</th>
                        </tr>
                     </thead>
                     <tbody className="text-sm font-medium">
                        {po.lineItems.map((item, i) => (
                           <tr key={i} className="border-b border-divider/50 last:border-none">
                              <td className="p-4">{item.name}</td>
                              <td className="p-4 text-right font-mono">{item.orderedQty} {item.unit}</td>
                              <td className="p-4 text-right font-mono text-success font-bold">{item.receivedQty || 0} {item.unit}</td>
                              <td className="p-4 text-right font-mono">₹{money(item.rate)}</td>
                              <td className="p-4 text-right font-mono text-ink">₹{money(item.amount)}</td>
                           </tr>
                        ))}
                     </tbody>
                     <tfoot className="bg-[#F7E4DB] border-t border-[#F7E4DB]">
                        {([["loading", L("Loading charges","ஏற்றுதல் கட்டணம்")], ["transport", L("Transport charges","போக்குவரத்து கட்டணம்")], ["other", L("Other charges","பிற கட்டணங்கள்")]] as const).map(([key, label]) =>
                           po.charges?.[key] ? (
                              <tr key={key}>
                                 <td colSpan={4} className="px-4 py-1.5 text-right text-[10px] font-bold text-[#B85F3B]/80 uppercase tracking-widest">{label}</td>
                                 <td className="px-4 py-1.5 text-right font-mono text-[#B85F3B]">₹{po.charges[key]!.toLocaleString("en-IN")}</td>
                              </tr>
                           ) : null,
                        )}
                        <tr>
                           <td colSpan={4} className="p-4 text-right text-[10px] font-black text-primary uppercase tracking-widest">{L("Total Amount","மொத்தத் தொகை")}</td>
                           <td className="p-4 text-right text-lg font-black font-mono text-primary tracking-tight">₹{po.totalAmount.toLocaleString("en-IN")}</td>
                        </tr>
                     </tfoot>
                  </table>
               </div>
               
               {po.notes && (
                  <div className="mt-6 p-4 bg-yellow-50/50 border border-primary/20 rounded-xl">
                     <p className="text-[10px] font-black text-[#C0653F] uppercase tracking-widest mb-1.5">{L("Notes","குறிப்புகள்")}</p>
                     <p className="text-sm font-medium text-ink/80">{po.notes}</p>
                  </div>
               )}
            </div>
         </div>

         <div className="p-6 border-t border-divider bg-panel flex flex-wrap justify-end gap-4 shrink-0">
            {(po.status === "Approved" || po.status === "Partially Received") && (
               <button onClick={() => setShowGRNForm(true)} className="px-6 py-3 bg-success hover:bg-success text-white text-xs font-bold uppercase tracking-widest rounded-xl transition flex items-center gap-2 cursor-pointer shadow-[0_4px_20px_rgba(5,150,105,0.2)]">
                 <PackagePlus className="w-4 h-4" /> {L("Record Goods Receipt","பொருள் ரசீதைப் பதிவு செய்")}
               </button>
            )}
            {canEditOrDelete && (
               <button onClick={handleDelete} disabled={isDeleting} className="px-6 py-3 bg-danger/8 hover:bg-danger/15 text-danger text-xs font-bold uppercase tracking-widest rounded-full transition flex items-center gap-2 cursor-pointer">
                 {isDeleting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4" />} {po.status === "Draft" ? L("Delete Draft","வரைவை நீக்கு") : L("Delete PO","ஆணையை நீக்கு")}
               </button>
            )}
            {po.status === "Draft" && isAdminOrOwner && (
               <button onClick={handleApprove} disabled={isApproving} className="px-6 py-3 bg-primary hover:bg-[#B85F3B] text-white text-xs font-bold uppercase tracking-widest rounded-xl transition flex items-center gap-2 cursor-pointer shadow-[0_4px_20px_rgba(79,70,229,0.2)]">
                 {isApproving ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4" />} {L("Approve Order","ஆணையை அங்கீகரி")}
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
