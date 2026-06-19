import React, { useState } from "react";
import { motion } from "motion/react";
import { X, Trash2, Loader2, Image as ImageIcon } from "lucide-react";
import { GoodsReceiptNote } from "../../types";
import { useAuthStore } from "../../store";
import { doc, deleteDoc } from "firebase/firestore";
import { db } from "../../firebase";

interface GoodsReceiptDetailsProps {
  grn: GoodsReceiptNote;
  projectId: string;
  onClose: () => void;
}

export const GoodsReceiptDetails: React.FC<GoodsReceiptDetailsProps> = ({ grn, projectId, onClose }) => {
  const user = useAuthStore(state => state.user);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAdminOrOwner = user?.role === "Admin" || user?.role === "Owner" || user?.role === "Project Manager";
  const isCreatorSameDay = user?.uid === grn.createdByUid && new Date().toISOString().split("T")[0] === grn.createdAt.split("T")[0];
  const canEditOrDelete = isAdminOrOwner || isCreatorSameDay;

  const tenantPath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;
  const grnRef = doc(db, `${tenantPath}/goodsReceiptNotes`, grn.id);

  const handleDelete = async () => {
    if (!canEditOrDelete) return;
    if (!confirm("Are you sure you want to delete this GRN? This will revert the received quantities on the PO and Inventory.")) return;
    setIsDeleting(true);
    try {
      await deleteDoc(grnRef);
      onClose();
    } catch (e) {
      console.error(e);
      alert("Failed to delete GRN");
    } finally {
      setIsDeleting(false);
    }
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
             <h2 className="text-xl font-black text-ink tracking-tight mb-1">{grn.grnNumber}</h2>
             <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">{grn.poNumber} • {grn.vendorName}</p>
           </div>
           <button type="button" onClick={onClose} className="p-3 bg-white hover:bg-divider rounded-full transition text-ink cursor-pointer">
             <X className="w-5 h-5" />
           </button>
         </div>
         
         <div className="flex-1 overflow-y-auto p-6 space-y-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 bg-panel p-6 rounded-2xl border border-divider">
               <div>
                  <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">Date</p>
                  <p className="text-sm font-semibold text-ink font-mono">{grn.receiptDate}</p>
               </div>
               <div>
                  <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">Challan / DC</p>
                  <p className="text-sm font-semibold text-ink font-mono">{grn.challanNumber || "-"}</p>
               </div>
               <div className="col-span-2">
                  <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1.5">Recorded By</p>
                  <p className="text-sm font-semibold text-ink">{grn.createdByName}</p>
               </div>
            </div>

            <div>
               <h3 className="text-xs font-black text-ink uppercase tracking-widest mb-4 border-b border-divider pb-2">Material Received</h3>
               <div className="bg-panel rounded-2xl border border-divider overflow-hidden">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="bg-divider/30 text-[10px] font-bold text-ink-muted uppercase tracking-widest border-b border-divider">
                           <th className="p-4">Item</th>
                           <th className="p-4 text-right">Ordered</th>
                           <th className="p-4 text-right">Received</th>
                           <th className="p-4 text-right">Accepted</th>
                           <th className="p-4 text-right text-red-500">Rejected</th>
                        </tr>
                     </thead>
                     <tbody className="text-sm font-medium">
                        {grn.lineItems.map((item, i) => (
                           <tr key={i} className="border-b border-divider/50 last:border-none">
                              <td className="p-4">{item.name}</td>
                              <td className="p-4 text-right font-mono text-ink-muted">{item.orderedQty} {item.unit}</td>
                              <td className="p-4 text-right font-mono">{item.receivedQty} {item.unit}</td>
                              <td className="p-4 text-right font-mono text-green-600">{item.acceptedQty} {item.unit}</td>
                              <td className="p-4 text-right font-mono text-red-500">{item.rejectedQty > 0 ? item.rejectedQty : "-"}</td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
               
               {grn.notes && (
                  <div className="mt-6 p-4 bg-yellow-50/50 border border-yellow-100 rounded-xl">
                     <p className="text-[10px] font-black text-yellow-600 uppercase tracking-widest mb-1.5">Notes</p>
                     <p className="text-sm font-medium text-ink/80">{grn.notes}</p>
                  </div>
               )}
               
               {grn.photoUrls && grn.photoUrls.length > 0 && (
                  <div className="mt-6">
                     <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-3">Attachments</p>
                     <div className="flex gap-4 overflow-x-auto pb-4">
                        {grn.photoUrls.map((url, i) => (
                           <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block w-32 h-32 rounded-xl overflow-hidden border border-divider group flex-shrink-0 relative">
                              <img src={url} alt={`Attachment ${i}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                              <div className="absolute inset-0 bg-ink/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                 <ImageIcon className="w-6 h-6 text-white" />
                              </div>
                           </a>
                        ))}
                     </div>
                  </div>
               )}
            </div>
         </div>

         {canEditOrDelete && (
            <div className="p-6 border-t border-divider bg-panel flex justify-end gap-4 shrink-0">
               <button onClick={handleDelete} disabled={isDeleting} className="px-6 py-3 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold uppercase tracking-widest rounded-xl transition flex items-center gap-2 cursor-pointer">
                 {isDeleting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4" />} Delete GRN
               </button>
            </div>
         )}
      </motion.div>
    </div>
  );
};
