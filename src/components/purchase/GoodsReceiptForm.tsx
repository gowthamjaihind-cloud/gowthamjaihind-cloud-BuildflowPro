import React, { useState } from "react";
import { motion } from "motion/react";
import { X, Save, Camera, Trash2, Image as ImageIcon } from "lucide-react";
import { doc, setDoc, runTransaction, updateDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../firebase";
import { PurchaseOrder, GoodsReceiptNote, GRNLineItem } from "../../types";
import { useAuthStore } from "../../store";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { compressImage } from "../../utils/imageCompressor";

interface GoodsReceiptFormProps {
  po: PurchaseOrder;
  projectId: string;
  onClose: () => void;
}

export const GoodsReceiptForm: React.FC<GoodsReceiptFormProps> = ({ po, projectId, onClose }) => {
  const user = useAuthStore(state => state.user);
  
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0]);
  const [challanNumber, setChallanNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  
  const [lineItems, setLineItems] = useState<GRNLineItem[]>(() => {
    return po.lineItems.map(poLine => {
      const remaining = poLine.orderedQty - (poLine.receivedQty || 0);
      return {
        poLineRef: poLine.itemId, // The reference id in the PO line
        materialId: poLine.materialId,
        name: poLine.name,
        orderedQty: poLine.orderedQty,
        receivedQty: Math.max(0, remaining),
        acceptedQty: Math.max(0, remaining),
        rejectedQty: 0,
        unit: poLine.unit
      };
    });
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReceivedChange = (index: number, val: string) => {
    const num = parseFloat(val) || 0;
    const newItems = [...lineItems];
    newItems[index].receivedQty = num;
    newItems[index].acceptedQty = num; // auto sync initially
    newItems[index].rejectedQty = 0;
    setLineItems(newItems);
  };

  const handleAcceptedChange = (index: number, val: string) => {
    const num = parseFloat(val) || 0;
    const newItems = [...lineItems];
    newItems[index].acceptedQty = num;
    newItems[index].rejectedQty = Math.max(0, newItems[index].receivedQty - num);
    setLineItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);
    setError(null);

    const hasAnyReceived = lineItems.some(i => i.receivedQty > 0 || i.acceptedQty > 0);
    if (!hasAnyReceived) {
      setError("Please enter quantity for at least one item.");
      setIsSubmitting(false);
      return;
    }

    try {
      const tenantPath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;
      const newGRNRef = doc(db, `${tenantPath}/goodsReceiptNotes`, "new"); 
      const actualId = newGRNRef.id;

      let generatedNumber = "";

      await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, `${tenantPath}/system`, "grnCounter");
        const counterDoc = await transaction.get(counterRef);
        
        let newCount = 1;
        if (counterDoc.exists()) {
          newCount = (counterDoc.data()?.count || 0) + 1;
        }

        const dateCode = new Date().getFullYear().toString();
        generatedNumber = `GRN-${dateCode}-${newCount.toString().padStart(4, "0")}`;

        transaction.set(counterRef, { count: newCount }, { merge: true });

        const grnRef = doc(db, `${tenantPath}/goodsReceiptNotes`, actualId);
        const validLineItems = lineItems.filter(i => i.receivedQty > 0 || i.acceptedQty > 0);
        const materialIds = Array.from(new Set(validLineItems.map(i => i.poLineRef).filter(Boolean))) as string[];

        const newGRN: GoodsReceiptNote = {
          id: actualId,
          grnNumber: generatedNumber,
          projectId,
          poId: po.id,
          poNumber: po.poNumber,
          vendorId: po.vendorId,
          vendorName: po.vendorName,
          receiptDate,
          challanNumber: challanNumber || undefined,
          lineItems: validLineItems,
          materialIds: materialIds.length > 0 ? materialIds : undefined,
          notes: notes || undefined,
          createdByUid: user.uid,
          createdByName: user.displayName || user.email || "Unknown",
          createdAt: new Date().toISOString()
        };

        transaction.set(grnRef, newGRN);
      });

      // Upload photos after transaction commits successfully
      if (photos.length > 0) {
        const tenantPath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;
        const storage = getStorage();
        const urls: string[] = [];

        for (let i = 0; i < photos.length; i++) {
          try {
            const file = photos[i];
            const compressed = await compressImage(file, 1600, 0.7);
            const name = `grn_photo_${Date.now()}_${i}.jpg`;
            const sRef = storageRef(storage, `${tenantPath}/goodsReceiptNotes/${actualId}/${name}`);
            
            await uploadBytes(sRef, compressed);
            const url = await getDownloadURL(sRef);
            urls.push(url);
          } catch (error) {
            console.error("Photo upload failed", error);
          }
        }

        if (urls.length > 0) {
          const grnRef = doc(db, `${tenantPath}/goodsReceiptNotes`, actualId);
          await updateDoc(grnRef, { photoUrls: urls });
        }
      }

      onClose();
    } catch (e: any) {
      console.error(e);
      let errorMsg = "Failed to save Receipt";
      try { handleFirestoreError(e, OperationType.CREATE, "goodsReceiptNotes"); } 
      catch (handledError: any) { errorMsg = handledError.message; }
      setError(errorMsg);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-surface w-full max-w-4xl rounded-[32px] overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex justify-between items-center p-6 border-b border-divider bg-panel shrink-0">
          <div>
             <h2 className="text-xl font-bold text-ink">Record Goods Receipt</h2>
             <p className="text-xs text-ink-muted mt-1 uppercase tracking-widest font-bold">PO: {po.poNumber}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-divider rounded-full transition text-ink cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
           {error && (
             <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">
               {error}
             </div>
           )}

           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-panel p-6 rounded-2xl border border-divider">
              <div>
                 <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-2">Receipt Date *</label>
                 <input
                   type="date"
                   required
                   value={receiptDate}
                   onChange={e => setReceiptDate(e.target.value)}
                   className="w-full px-4 py-3 bg-surface text-ink text-sm rounded-xl border border-divider focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                 />
              </div>
              <div>
                 <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-2">Challan / DC Number</label>
                 <input
                   type="text"
                   value={challanNumber}
                   onChange={e => setChallanNumber(e.target.value)}
                   className="w-full px-4 py-3 bg-surface text-ink text-sm rounded-xl border border-divider focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                   placeholder="e.g. DC-10294"
                 />
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
                          <th className="p-4 text-right">Remaining</th>
                          <th className="p-4 text-right">Received</th>
                          <th className="p-4 text-right">Accepted</th>
                          <th className="p-4 text-right">Rejected</th>
                       </tr>
                    </thead>
                    <tbody className="text-sm font-medium">
                       {lineItems.map((item, i) => {
                          const poLine = po.lineItems.find(p => p.itemId === item.poLineRef);
                          const remaining = poLine ? poLine.orderedQty - (poLine.receivedQty || 0) : 0;
                          return (
                             <tr key={item.poLineRef} className="border-b border-divider/50 last:border-none">
                                <td className="p-4">{item.name}</td>
                                <td className="p-4 text-right font-mono text-ink-muted">
                                   {poLine?.orderedQty || 0}
                                </td>
                                <td className="p-4 text-right font-mono text-ink-muted">
                                   {Math.max(0, remaining)}
                                </td>
                                <td className="p-4 w-32">
                                   <input 
                                      type="number" 
                                      min="0" 
                                      step="0.01"
                                      value={item.receivedQty || ""}
                                      onChange={(e) => handleReceivedChange(i, e.target.value)}
                                      className="w-full p-2 text-right bg-surface border border-divider rounded-lg font-mono text-sm focus:border-indigo-500"
                                      placeholder="0"
                                   />
                                </td>
                                <td className="p-4 w-32">
                                   <input 
                                      type="number" 
                                      min="0" 
                                      step="0.01"
                                      value={item.acceptedQty || ""}
                                      onChange={(e) => handleAcceptedChange(i, e.target.value)}
                                      className="w-full p-2 text-right bg-surface border border-divider rounded-lg font-mono text-sm text-green-600 focus:border-green-500"
                                      placeholder="0"
                                   />
                                </td>
                                <td className="p-4 text-right font-mono text-red-500">
                                   {item.rejectedQty > 0 ? item.rejectedQty : "-"}
                                </td>
                             </tr>
                          )
                       })}
                    </tbody>
                 </table>
              </div>
           </div>
           
           <div>
              <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-2">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className="w-full p-4 bg-surface text-ink text-sm rounded-xl border border-divider focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none"
                placeholder="Any comments about the delivery condition..."
              />
           </div>

           <div>
              <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-3">Delivery Challan Photos</label>
              
              <div className="flex flex-wrap gap-4">
                 {photos.map((photo, i) => (
                    <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-divider group flex-shrink-0">
                       <img 
                          src={URL.createObjectURL(photo)} 
                          alt="Challan photo" 
                          className="w-full h-full object-cover" 
                       />
                       <button
                          type="button"
                          onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-1 right-1 p-1 bg-red-500/90 hover:bg-red-600 text-white rounded-lg shadow-sm transition opacity-0 group-hover:opacity-100"
                       >
                          <X className="w-3.5 h-3.5" />
                       </button>
                    </div>
                 ))}
                 
                 <label className="w-24 h-24 flex flex-col items-center justify-center gap-2 bg-panel hover:bg-divider border-2 border-dashed border-divider hover:border-indigo-300 rounded-xl transition cursor-pointer group flex-shrink-0">
                    <Camera className="w-6 h-6 text-ink-muted group-hover:text-indigo-500 transition-colors" />
                    <span className="text-[9px] font-black uppercase text-ink-muted group-hover:text-indigo-500 tracking-widest">Add Photo</span>
                    <input 
                       type="file" 
                       accept="image/*" 
                       multiple
                       capture="environment"
                       className="hidden" 
                       onChange={(e) => {
                          if (e.target.files?.length) {
                             setPhotos(prev => [...prev, ...Array.from(e.target.files!)]);
                          }
                       }} 
                    />
                 </label>
              </div>
           </div>
        </div>

        <div className="p-6 border-t border-divider bg-panel flex justify-end shrink-0">
           <button 
             onClick={handleSubmit} 
             disabled={isSubmitting} 
             className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition flex items-center gap-2 cursor-pointer shadow-[0_4px_20px_rgba(79,70,229,0.2)] disabled:opacity-50"
           >
             {isSubmitting ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></span> : <Save className="w-4 h-4" />} Save Receipt
           </button>
        </div>
      </motion.div>
    </div>
  );
};
