import React, { useState } from "react";
import { motion } from "motion/react";
import {
  X,
  FloppyDisk as Save,
  Camera,
  Trash as Trash2,
  Image as ImageIcon,
} from "@phosphor-icons/react";
import { doc, setDoc, runTransaction, updateDoc, collection } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../firebase";
import { PurchaseOrder, GoodsReceiptNote, GRNLineItem } from "../../types";
import { useAuthStore } from "../../store";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { compressImage } from "../../utils/imageCompressor";
import { useQueryClient } from "@tanstack/react-query";

interface GoodsReceiptFormProps {
  po: PurchaseOrder;
  projectId: string;
  onClose: () => void;
}

export const GoodsReceiptForm: React.FC<GoodsReceiptFormProps> = ({ po, projectId, onClose }) => {
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();
  
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
      const newGRNRef = doc(collection(db, `${tenantPath}/goodsReceiptNotes`)); 
      const actualId = newGRNRef.id;

      let generatedNumber = "";

      await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, `${tenantPath}/system`, "grnCounter");
        const poRef = doc(db, `${tenantPath}/purchase_orders`, po.id);
        
        // ALL READS FIRST
        const counterDoc = await transaction.get(counterRef);
        const poDoc = await transaction.get(poRef);
        
        let poData: any = null;
        if (poDoc.exists()) poData = poDoc.data();
        
        let vendorDoc: any = null;
        if (poData && poData.vendorId) {
           const vendorRef = doc(db, `${tenantPath}/suppliers`, poData.vendorId);
           vendorDoc = await transaction.get(vendorRef);
        }

        let newCount = 1;
        if (counterDoc.exists()) {
          newCount = (counterDoc.data()?.count || 0) + 1;
        }

        const dateCode = new Date().getFullYear().toString();
        generatedNumber = `GRN-${dateCode}-${newCount.toString().padStart(4, "0")}`;

        const grnRef = doc(db, `${tenantPath}/goodsReceiptNotes`, actualId);
        const validLineItems = lineItems.filter(i => i.receivedQty > 0 || i.acceptedQty > 0);
        const materialIds = Array.from(new Set(validLineItems.map(i => i.poLineRef).filter(Boolean))) as string[];
        
        const inventoryItemDocs: { [id: string]: any } = {};
        for (const matId of materialIds) {
          const itemRef = doc(db, `${tenantPath}/inventory`, matId);
          inventoryItemDocs[matId] = await transaction.get(itemRef);
        }
        
        // Guard against duplicate / over-receipt.
        // poData is read inside the transaction, so a double-click or a repeat
        // submission of the same GRN sees the already-received quantities and fails.
        if (poData) {
          const overReceipts: string[] = [];
          validLineItems.forEach((grnItem) => {
            const poItem = poData.lineItems?.find(
              (i: any) => i.itemId === grnItem.poLineRef,
            );
            if (!poItem) return;
            const ordered = poItem.orderedQty || 0;
            const alreadyReceived = poItem.receivedQty || 0;
            const remaining = ordered - alreadyReceived;
            if ((grnItem.acceptedQty || 0) > remaining) {
              overReceipts.push(
                `• ${grnItem.name || poItem.name || "Item"}: accepting ${grnItem.acceptedQty} ${grnItem.unit || ""} but only ${remaining} of ${ordered} remain (${alreadyReceived} already received)`,
              );
            }
          });
          if (overReceipts.length > 0) {
            const err: any = new Error(
              `This receipt exceeds what's still outstanding on ${po.poNumber}. It may already have been recorded.\n\n${overReceipts.join("\n")}`,
            );
            err.isValidation = true;
            throw err;
          }
        }

        // Calculate Total Cost of this GRN
        let totalAmount = 0;
        if (poData) {
            validLineItems.forEach(grnItem => {
                const poItem = poData.lineItems?.find((i: any) => i.itemId === grnItem.poLineRef);
                if (poItem) {
                    totalAmount += grnItem.acceptedQty * poItem.rate;
                }
            });
        }

        const ledgerRef = doc(collection(db, `${tenantPath}/ledger`));
        const costRef = doc(collection(db, `${tenantPath}/costs`));

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
          createdAt: new Date().toISOString(),
          ledgerId: ledgerRef.id,
          costEntryId: costRef.id
        };

        // WRITES
        if (poData) {
           const updatedLineItems = poData.lineItems.map((item: any) => {
              const grnItem = validLineItems.find(i => i.poLineRef === item.itemId);
              if (grnItem) {
                 return { ...item, receivedQty: (item.receivedQty || 0) + grnItem.acceptedQty };
              }
              return item;
           });
           
           const isFullyReceived = updatedLineItems.every((i: any) => (i.receivedQty || 0) >= i.orderedQty);
           
           transaction.update(poRef, { 
             lineItems: updatedLineItems,
             status: isFullyReceived ? "Completed" : poData.status 
           });
           
           // Update vendor balance
           if (vendorDoc && vendorDoc.exists()) {
               transaction.update(vendorDoc.ref, {
                   outstandingBalance: (vendorDoc.data().outstandingBalance || 0) + totalAmount
               });
           }
           
           // Create Vendor Ledger Entry
           transaction.set(ledgerRef, {
               projectId,
               vendorId: poData.vendorId,
               date: receiptDate,
               type: "CREDIT",
               amount: totalAmount,
               referenceType: "GRN",
               referenceId: actualId,
               description: `Goods Receipt - ${generatedNumber} (PO: ${poData.poNumber})`
           });
           
           // Create Cost Entry
           transaction.set(costRef, {
               id: costRef.id,
               projectId,
               date: receiptDate,
               category: "Material",
               type: "Actual",
               amount: totalAmount,
               description: `Goods Receipt - ${generatedNumber} (${poData.vendorName})`,
               taskId: "",
               isAccrual: true
           });
        }
        
        for (const matId of materialIds) {
          const snap = inventoryItemDocs[matId];
          if (snap && snap.exists()) {
             const data = snap.data();
             const totalAcceptedForThisMaterial = validLineItems.filter(i => i.poLineRef === matId).reduce((acc, curr) => acc + curr.acceptedQty, 0);
             
             const qExisting = data.quantity || 0;
             const cExisting = data.avgUnitCost || data.unitCost || 0;
             const qNew = totalAcceptedForThisMaterial;
             
             const poItem = poData?.lineItems?.find((i: any) => i.itemId === matId);
             const cNew = poItem ? (poItem.rate || 0) : 0;
             
             const totalQty = qExisting + qNew;
             let newAvgUnitCost = cExisting;
             if (totalQty > 0) {
               newAvgUnitCost = ((qExisting * cExisting) + (qNew * cNew)) / totalQty;
             }
             
             const updateFields: any = {
               quantity: totalQty,
               avgUnitCost: newAvgUnitCost
             };
             
             if (!data.unitCost || data.unitCost === 0) {
               updateFields.unitCost = newAvgUnitCost;
             }
             
             transaction.update(snap.ref, updateFields);
          }
        }

        transaction.set(counterRef, { count: newCount }, { merge: true });
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

      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'goodsReceiptNotes'] });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'inventory'] });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'ledger'] });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'costs'] });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'suppliers'] });
      onClose();
    } catch (e: any) {
      console.error(e);
      // Validation failures are already human-readable — show them as-is.
      if (e?.isValidation) {
        setError(e.message);
        setIsSubmitting(false);
        return;
      }
      let errorMsg = "Failed to save Receipt";
      try { handleFirestoreError(e, OperationType.CREATE, "goodsReceiptNotes"); }
      catch (handledError: any) { errorMsg = handledError.message; }
      setError(errorMsg);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-onyx/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
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
             <div className="p-4 bg-[#EF4444]/8 text-[#EF4444] rounded-xl text-sm font-medium border border-[#EF4444]/20">
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
                   className="w-full px-4 py-3 bg-surface text-ink text-sm rounded-xl border border-divider focus:border-[#D97D54] focus:ring-1 focus:ring-[#D97D54] transition-colors"
                 />
              </div>
              <div>
                 <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-2">Challan / DC Number</label>
                 <input
                   type="text"
                   value={challanNumber}
                   onChange={e => setChallanNumber(e.target.value)}
                   className="w-full px-4 py-3 bg-surface text-ink text-sm rounded-xl border border-divider focus:border-[#D97D54] focus:ring-1 focus:ring-[#D97D54] transition-colors"
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
                                      className="w-full p-2 text-right bg-surface border border-divider rounded-lg font-mono text-sm focus:border-[#D97D54]"
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
                                      className="w-full p-2 text-right bg-surface border border-divider rounded-lg font-mono text-sm text-[#059669] focus:border-[#10B981]"
                                      placeholder="0"
                                   />
                                </td>
                                <td className="p-4 text-right font-mono text-[#EF4444]">
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
                className="w-full p-4 bg-surface text-ink text-sm rounded-xl border border-divider focus:border-[#D97D54] focus:ring-1 focus:ring-[#D97D54] transition-colors resize-none"
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
                          className="absolute top-1 right-1 p-1 bg-red-500/90 hover:bg-[#DC2626] text-white rounded-lg shadow-sm transition opacity-0 group-hover:opacity-100"
                       >
                          <X className="w-3.5 h-3.5" />
                       </button>
                    </div>
                 ))}
                 
                 <label className="w-24 h-24 flex flex-col items-center justify-center gap-2 bg-panel hover:bg-divider border-2 border-dashed border-divider hover:border-[#D97D54] rounded-xl transition cursor-pointer group flex-shrink-0">
                    <Camera className="w-6 h-6 text-ink-muted group-hover:text-[#D97D54] transition-colors" />
                    <span className="text-[9px] font-black uppercase text-ink-muted group-hover:text-[#D97D54] tracking-widest">Add Photo</span>
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
             className="px-8 py-4 bg-[#D97D54] hover:bg-[#B85F3B] text-white text-xs font-bold uppercase tracking-widest rounded-xl transition flex items-center gap-2 cursor-pointer shadow-[0_4px_20px_rgba(79,70,229,0.2)] disabled:opacity-50"
           >
             {isSubmitting ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></span> : <Save className="w-4 h-4" />} Save Receipt
           </button>
        </div>
      </motion.div>
    </div>
  );
};
