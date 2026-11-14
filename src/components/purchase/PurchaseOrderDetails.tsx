import { useQueryClient } from "@tanstack/react-query";
import { money } from "../../utils/num";
import React, { useState } from "react";
import { exportToCSV } from "../../utils/exportUtils";
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
import { confirmDialog, toast } from "../../lib/feedback";
import { Tooltip } from "../Tooltip";
import { DialogBehaviour } from "../../lib/useDialog";
import { PurchaseOrderPreview } from "./PurchaseOrderDocument";
import { useProjectData } from "../../hooks/useProjectData";
import { useOrgSettings } from "../../hooks/useOrgSettings";
import { useCompanyProfile } from "../../hooks/useCompanyProfile";
import { useProjectStore } from "../../store/projectStore";
import { computePoTotals } from "../../lib/poTax";
import type { Vendor } from "../../types";

interface PurchaseOrderDetailsProps {
  po: PurchaseOrder;
  projectId: string;
  onClose: () => void;
  onEdit?: (po: PurchaseOrder) => void;
}

export const PurchaseOrderDetails: React.FC<PurchaseOrderDetailsProps> = ({ po, projectId, onClose, onEdit }) => {
  const statusLabel = (st: string) => ({
    Draft: "Draft",
    Approved: "Approved",
    "Partially Received": "Partially Received",
    Closed: "Closed",
  } as Record<string, string>)[st] || st;
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();
  const [isApproving, setIsApproving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showGRNForm, setShowGRNForm] = useState(false);
  const [showDocument, setShowDocument] = useState(false);
  // What the printed purchase order needs beyond the order itself.
  const { data: vendors = [] } = useProjectData<Vendor>(projectId, "suppliers");
  const vendor = vendors.find((v) => v.id === po.vendorId);
  const { settings: org } = useOrgSettings();
  const { profile } = useCompanyProfile();
  const projectName = useProjectStore((st) => st.activeProject?.name);
  const inter = po.interState === true;
  const totals = computePoTotals(po.lineItems || [], po.charges, po.chargesGstRate, inter);
  const hasGst = totals.hasGst;

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
      toast.error("Failed to approve PO");
    } finally {
      setIsApproving(false);
    }
  };

  const handleDelete = async () => {
    if (!canEditOrDelete) return;
    if (!(await confirmDialog({ title: "Delete this Purchase Order?" }))) return;
    setIsDeleting(true);
    try {
      await deleteDoc(poRef);
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'purchase_orders'] });
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete PO");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportCSV = () => {
    const headers = hasGst
      ? ["Item Name", "HSN/SAC", "Ordered Qty", "Unit", "Rate before tax (₹)", "Taxable value (₹)", "GST %", "CGST (₹)", "SGST (₹)", "IGST (₹)", "Line total (₹)"]
      : ["Item Name", "Ordered Qty", "Unit", "Rate (₹)", "Amount (₹)"];
    const rows = (po.lineItems || []).map((item, i) => {
      const t = totals.lines[i];
      return hasGst
        ? [item.name || "", item.hsn || "", item.orderedQty || 0, item.unit || "", item.rate || 0, t.taxableValue, t.gstRate, t.cgst, t.sgst, t.igst, t.total]
        : [item.name || "", item.orderedQty || 0, item.unit || "", item.rate || 0, item.amount || 0];
    });
    exportToCSV(`PO_${po.poNumber}`, headers, rows);
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
        <DialogBehaviour />
         <div className="flex justify-between items-center p-6 border-b border-divider bg-panel sticky top-0 z-10 shrink-0">
           <div>
             <h2 className="text-xl font-black text-ink tracking-tight mb-1">{po.poNumber}</h2>
             <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">{statusLabel(po.status)} • {po.vendorName}</p>
           </div>
           <div className="flex items-center gap-2">
             {po.status === "Draft" && canEditOrDelete && onEdit && (
               <Tooltip label={"Edit draft PO"}>
                 <button
                   onClick={() => onEdit(po)}
                   className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-divider rounded-lg transition text-ink text-[10px] font-bold uppercase tracking-wider border border-divider cursor-pointer"
                  
                 >
                   <Edit3 className="w-3.5 h-3.5 text-ink/80" /> {"Edit"}
                 </button>
               </Tooltip>
             )}
             <Tooltip label={"Export CSV"}>
               <button
                 onClick={handleExportCSV}
                 className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-divider rounded-lg transition text-ink text-[10px] font-bold uppercase tracking-wider border border-divider cursor-pointer"
                
               >
                 <Download className="w-3.5 h-3.5 text-ink/80" /> CSV
               </button>
             </Tooltip>
             <Tooltip label={"View the purchase order as it will be sent, then download or print it"}>
               <button
                 onClick={() => setShowDocument(true)}
                 className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-deep text-on-primary rounded-lg transition text-[10px] font-bold uppercase tracking-wider shadow-sm cursor-pointer"
                
               >
                 <Download className="w-3.5 h-3.5" /> View / PDF
               </button>
             </Tooltip>
             <button aria-label={"Close"} type="button" onClick={onClose} className="p-2 bg-white hover:bg-divider rounded-full transition text-ink cursor-pointer ml-1">
               <X className="w-5 h-5" />
             </button>
           </div>
         </div>
         
         <div className="flex-1 overflow-y-auto p-6 space-y-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 bg-panel p-6 rounded-2xl border border-divider">
               <div>
                  <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">{"Date"}</p>
                  <p className="text-sm font-semibold text-ink font-mono">{po.orderDate}</p>
               </div>
               {po.expectedDeliveryDate && (
                  <div>
                    <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">{"Expected"}</p>
                    <p className="text-sm font-semibold text-primary font-mono">{po.expectedDeliveryDate}</p>
                  </div>
               )}
               <div>
                  <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">{"Created By"}</p>
                  <p className="text-sm font-semibold text-ink">{po.createdByName}</p>
               </div>
               <div>
                  <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">{"Status"}</p>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                     po.status === 'Draft' ? 'bg-page text-ink-muted' :
                     po.status === 'Approved' ? 'bg-divider text-ink-muted' :
                     po.status === 'Partially Received' ? 'bg-primary/10 text-primary' :
                     'bg-success/12 text-success'
                  }`}>
                     {statusLabel(po.status)}
                  </span>
               </div>
            </div>

            <div>
               <h3 className="text-xs font-black text-ink uppercase tracking-widest mb-4 border-b border-divider pb-2">{"Line Items"}</h3>
               <div className="bg-panel rounded-2xl border border-divider overflow-x-auto">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="bg-divider/30 text-[10px] font-bold text-ink-muted uppercase tracking-widest border-b border-divider">
                           <th className="p-4">{"Item"}</th>
                           <th className="p-4 text-right">{"Qty"}</th>
                           <th className="p-4 text-right">{"Received"}</th>
                           <th className="p-4 text-right">{hasGst ? "Rate before tax" : "Rate"}</th>
                           <th className="p-4 text-right">{hasGst ? "Taxable value" : "Amount"}</th>
                           {hasGst && <th className="p-4 text-right">{"GST"}</th>}
                           {hasGst && <th className="p-4 text-right">{"Total"}</th>}
                        </tr>
                     </thead>
                     <tbody className="text-sm font-medium">
                        {po.lineItems.map((item, i) => (
                           <tr key={i} className="border-b border-divider/50 last:border-none">
                              <td className="p-4">
                                 {item.name}
                                 {hasGst && <span className="block text-[10px] font-mono text-ink-muted">{item.hsn ? `HSN ${item.hsn}` : "No HSN code"}</span>}
                              </td>
                              <td className="p-4 text-right font-mono">{item.orderedQty} {item.unit}</td>
                              <td className="p-4 text-right font-mono text-success font-bold">{item.receivedQty || 0} {item.unit}</td>
                              <td className="p-4 text-right font-mono">₹{money(item.rate)}</td>
                              <td className="p-4 text-right font-mono text-ink">₹{money(item.amount)}</td>
                              {hasGst && (
                                 <td className="p-4 text-right font-mono text-ink-muted">
                                    {totals.lines[i].gstRate ? `${totals.lines[i].gstRate}%` : "—"}
                                    {totals.lines[i].tax > 0 && <span className="block text-[10px]">₹{money(totals.lines[i].tax)}</span>}
                                 </td>
                              )}
                              {hasGst && <td className="p-4 text-right font-mono text-ink font-bold">₹{money(totals.lines[i].total)}</td>}
                           </tr>
                        ))}
                     </tbody>
                     <tfoot className="bg-warning/12 border-t border-warning/25">
                        {([["loading", "Loading charges"], ["transport", "Transport charges"], ["other", "Other charges"]] as const).map(([key, label]) =>
                           po.charges?.[key] ? (
                              <tr key={key}>
                                 <td colSpan={hasGst ? 6 : 4} className="px-4 py-1.5 text-right text-[10px] font-bold text-warning/80 uppercase tracking-widest">{label}</td>
                                 <td className="px-4 py-1.5 text-right font-mono text-warning">₹{po.charges[key]!.toLocaleString("en-IN")}</td>
                              </tr>
                           ) : null,
                        )}
                        {hasGst && ((inter
                           ? [["IGST", totals.totalIGST]]
                           : [["CGST", totals.totalCGST], ["SGST", totals.totalSGST]]) as Array<[string, number]>).map(([label, value]) => (
                           <tr key={label}>
                              <td colSpan={6} className="px-4 py-1.5 text-right text-[10px] font-bold text-warning/80 uppercase tracking-widest">{label}</td>
                              <td className="px-4 py-1.5 text-right font-mono text-warning">₹{money(value)}</td>
                           </tr>
                        ))}
                        <tr>
                           <td colSpan={hasGst ? 6 : 4} className="p-4 text-right text-[10px] font-black text-primary uppercase tracking-widest">{hasGst ? "Total including GST" : "Total Amount"}</td>
                           <td className="p-4 text-right text-lg font-black font-mono text-primary tracking-tight">₹{po.totalAmount.toLocaleString("en-IN")}</td>
                        </tr>
                     </tfoot>
                  </table>
               </div>
               
               {po.notes && (
                  <div className="mt-6 p-4 bg-yellow-50/50 border border-primary/20 rounded-xl">
                     <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1.5">{"Notes"}</p>
                     <p className="text-sm font-medium text-ink/80">{po.notes}</p>
                  </div>
               )}
            </div>
         </div>

         <div className="p-6 border-t border-divider bg-panel flex flex-wrap justify-end gap-4 shrink-0">
            {(po.status === "Approved" || po.status === "Partially Received") && (
               <button onClick={() => setShowGRNForm(true)} className="px-6 py-3 bg-success hover:bg-success text-on-success text-xs font-bold uppercase tracking-widest rounded-xl transition flex items-center gap-2 cursor-pointer shadow-[0_4px_20px_rgba(5,150,105,0.2)]">
                 <PackagePlus className="w-4 h-4" /> {"Record Goods Receipt"}
               </button>
            )}
            {canEditOrDelete && (
               <Tooltip label={"Delete"}>
                 <button aria-label={"Delete"} onClick={handleDelete} disabled={isDeleting} className="px-6 py-3 bg-danger/8 hover:bg-danger/15 text-danger text-xs font-bold uppercase tracking-widest rounded-full transition flex items-center gap-2 cursor-pointer">
                   {isDeleting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4" />} {po.status === "Draft" ? "Delete Draft" : "Delete PO"}
                 </button>
               </Tooltip>
            )}
            {po.status === "Draft" && isAdminOrOwner && (
               <button onClick={handleApprove} disabled={isApproving} className="px-6 py-3 bg-primary hover:bg-primary-deep text-on-primary text-xs font-bold uppercase tracking-widest rounded-xl transition flex items-center gap-2 cursor-pointer shadow-[0_4px_20px_rgba(79,70,229,0.2)]">
                 {isApproving ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4" />} {"Approve Order"}
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
      {showDocument && (
        <PurchaseOrderPreview po={po} vendor={vendor} org={org} profile={profile} projectName={projectName} onClose={() => setShowDocument(false)} />
      )}
    </div>
  );
};
