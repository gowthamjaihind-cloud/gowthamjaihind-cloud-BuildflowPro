import { useQueryClient } from "@tanstack/react-query";
import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Plus,
  Trash as Trash2,
  CircleNotch as Loader2,
  FloppyDisk as Save,
} from "@phosphor-icons/react";
import { useProjectData } from "../../hooks/useProjectData";
import { useAuthStore } from "../../store";
import { Vendor, InventoryItem, POLineItem, LaborRateCard, PurchaseOrder } from "../../types";
import { collection, doc, setDoc, updateDoc, runTransaction } from "firebase/firestore";
import { db } from "../../firebase";

interface PurchaseOrderFormProps {
  projectId: string;
  onClose: () => void;
  /** When set, the form edits this existing (Draft) PO instead of creating one. */
  existingPO?: PurchaseOrder | null;
}

export const PurchaseOrderForm: React.FC<PurchaseOrderFormProps> = ({ projectId, onClose, existingPO }) => {
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();
  const isEditing = !!existingPO;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState(existingPO?.vendorId || "");
  const [orderDate, setOrderDate] = useState(existingPO?.orderDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()));
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(existingPO?.expectedDeliveryDate || "");
  const [notes, setNotes] = useState(existingPO?.notes || "");
  const [items, setItems] = useState<Omit<POLineItem, "amount">[]>(
    existingPO?.lineItems?.length
      ? existingPO.lineItems.map((i) => ({
          itemId: i.itemId,
          materialId: i.materialId,
          name: i.name,
          orderedQty: i.orderedQty,
          unit: i.unit,
          rate: i.rate,
          receivedQty: i.receivedQty,
        }))
      : [{ itemId: "", materialId: "", name: "", orderedQty: 0, unit: "", rate: 0 }],
  );
  const [charges, setCharges] = useState({
    loading: existingPO?.charges?.loading || 0,
    transport: existingPO?.charges?.transport || 0,
    other: existingPO?.charges?.other || 0,
  });

  const { data: vendors = [] } = useProjectData<Vendor>(projectId, "suppliers");
  const { data: inventory = [] } = useProjectData<InventoryItem>(projectId, "inventory");
  const { data: laborCards = [] } = useProjectData<LaborRateCard>(projectId, "labor_rate_cards");

  const selectedVendor = useMemo(() => vendors.find(v => v.id === vendorId), [vendors, vendorId]);
  
  const handleItemSelect = (index: number, invItemId: string) => {
    const invItem = inventory.find(i => i.id === invItemId);
    const newItems = [...items];
    if (invItem) {
      newItems[index] = {
        ...newItems[index],
        itemId: invItem.id,
        materialId: invItem.materialId || "",
        name: invItem.name,
        unit: invItem.unit,
        rate: invItem.avgUnitCost || invItem.unitCost || 0
      };
    }
    setItems(newItems);
  };

  const handleLaborSelect = (index: number, laborId: string) => {
     const card = laborCards.find(l => l.id === laborId);
     const newItems = [...items];
     if (card) {
        newItems[index] = {
           ...newItems[index],
           itemId: card.id,
           materialId: card.role,
           name: card.role,
           unit: card.unit,
           rate: card.rate
        };
     }
     setItems(newItems);
  };

  const addItem = () => setItems([...items, { itemId: "", materialId: "", name: "", orderedQty: 0, unit: "", rate: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (index: number, field: keyof typeof items[0], value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const materialTotal = items.reduce((sum, item) => sum + (item.orderedQty || 0) * (item.rate || 0), 0);
  const chargesTotal =
    (Number(charges.loading) || 0) +
    (Number(charges.transport) || 0) +
    (Number(charges.other) || 0);
  const totalAmount = materialTotal + chargesTotal;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId || !selectedVendor || !user) return;
    
    setError(null);
    const invalidItem = items.find(i => i.orderedQty > 0 && i.rate === 0 && i.itemId);
    if (invalidItem) {
        setError(`Line item '${invalidItem.name}' has a rate of ₹0. Enter a valid rate — a zero rate will produce zero costs across the vendor ledger, inventory valuation, and task costs.`);
        return;
    }

    setIsSubmitting(true);
    try {
       const tenantPath = user.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;

       const validItems: POLineItem[] = items
          .filter(i => i.orderedQty > 0 && i.rate > 0 && i.itemId)
          .map(i => ({
             itemId: i.itemId,
             materialId: i.materialId,
             name: i.name,
             orderedQty: i.orderedQty,
             unit: i.unit,
             rate: i.rate,
             amount: i.orderedQty * i.rate,
             receivedQty: (i as any).receivedQty || 0,
          }));
       const chargesObj = {
          loading: Number(charges.loading) || 0,
          transport: Number(charges.transport) || 0,
          other: Number(charges.other) || 0,
       };
       const computedTotal =
          validItems.reduce((sum, item) => sum + item.amount, 0) + chargesTotal;

       if (isEditing && existingPO) {
          // Edit an existing Draft PO in place — keep its number/status/history.
          await updateDoc(doc(db, `${tenantPath}/purchase_orders/${existingPO.id}`), {
             vendorId: selectedVendor.id,
             vendorName: selectedVendor.name,
             orderDate,
             expectedDeliveryDate: expectedDeliveryDate || null,
             lineItems: validItems,
             charges: chargesObj,
             totalAmount: computedTotal,
             notes,
          });
       } else {
          await runTransaction(db, async (t) => {
             // get PO counter
             const counterRef = doc(db, `${tenantPath}/system/poCounter`);
             const counterDoc = await t.get(counterRef);
             let currentCount = 0;
             if (counterDoc.exists()) {
                currentCount = counterDoc.data()?.count || 0;
             }
             const nextCount = currentCount + 1;

             const year = orderDate.split('-')[0];
             const poNumber = `PO-${year}-${String(nextCount).padStart(4, '0')}`;

             const poRef = doc(collection(db, `${tenantPath}/purchase_orders`));
             t.set(poRef, {
                id: poRef.id,
                poNumber,
                projectId,
                vendorId: selectedVendor.id,
                vendorName: selectedVendor.name,
                status: "Draft",
                orderDate,
                expectedDeliveryDate: expectedDeliveryDate || null,
                lineItems: validItems,
                charges: chargesObj,
                totalAmount: computedTotal,
                notes,
                createdByUid: user.uid,
                createdByName: user.displayName || user.email || "Unknown",
                createdAt: new Date().toISOString()
             });

             t.set(counterRef, { count: nextCount }, { merge: true });
          });
       }
       queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'purchase_orders'] });
       onClose();
    } catch (e) {
       console.error("Failed to save PO", e);
       alert("Failed to save Purchase Order.");
    } finally {
       setIsSubmitting(false);
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
         <div className="flex justify-between items-center p-6 border-b border-divider bg-panel sticky top-0 z-10">
           <div>
             <h2 className="text-xl font-black text-ink tracking-tight mb-1">{isEditing ? `Edit ${existingPO?.poNumber || "Purchase Order"}` : "Create Purchase Order"}</h2>
             <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">Draft Order</p>
           </div>
           <button type="button" onClick={onClose} className="p-3 bg-white hover:bg-divider rounded-full transition text-ink cursor-pointer">
             <X className="w-5 h-5" />
           </button>
         </div>
         
         <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
            {error && (
              <div className="p-4 bg-danger/8 text-danger rounded-xl text-sm font-bold flex flex-col gap-1">
                <span>{error}</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
               <div className="space-y-1.5 focus-within:text-primary transition-colors">
                 <label className="text-[10px] font-black uppercase tracking-widest text-inherit ml-1">Vendor</label>
                 <select
                   required
                   value={vendorId}
                   onChange={e => setVendorId(e.target.value)}
                   className="w-full px-4 py-3 bg-panel border-none rounded-xl text-sm font-medium text-ink focus:ring-2 focus:ring-primary transition-all cursor-pointer"
                 >
                   <option value="">Select Vendor</option>
                   {vendors.map(v => (
                     <option key={v.id} value={v.id}>{v.name} ({v.type})</option>
                   ))}
                 </select>
               </div>
               <div className="space-y-1.5 focus-within:text-primary transition-colors">
                 <label className="text-[10px] font-black uppercase tracking-widest text-inherit ml-1">Order Date</label>
                 <input
                   type="date"
                   required
                   value={orderDate}
                   onChange={e => setOrderDate(e.target.value)}
                   className="w-full px-4 py-3 bg-panel border-none rounded-xl text-sm font-medium font-mono text-ink focus:ring-2 focus:ring-primary transition-all cursor-pointer"
                 />
               </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-end border-b border-divider pb-2">
                 <h3 className="text-xs font-black text-ink uppercase tracking-widest">Line Items</h3>
                 <button type="button" onClick={addItem} className="text-[10px] font-bold text-primary hover:text-[#B85F3B] uppercase tracking-widest flex items-center gap-1">
                   <Plus className="w-3.5 h-3.5" /> Add
                 </button>
              </div>

              {items.map((item, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row gap-3 items-end p-4 bg-panel rounded-xl group/row">
                  <div className="flex-1 w-full space-y-1.5">
                    <label className="text-[10px] font-bold text-ink-muted uppercase tracking-widest ml-1">Item</label>
                    <select
                      required
                      value={item.itemId}
                      onChange={e => selectedVendor?.type === "Labor" ? handleLaborSelect(idx, e.target.value) : handleItemSelect(idx, e.target.value)}
                      className="w-full px-3 py-2 bg-white rounded-lg text-sm font-medium"
                    >
                      <option value="">Select Item</option>
                      {selectedVendor?.type === "Labor" 
                         ? laborCards.map(l => <option key={l.id} value={l.id}>{l.role}</option>)
                         : inventory.map(i => <option key={i.id} value={i.id}>{i.name}</option>)
                      }
                    </select>
                  </div>
                  <div className="w-full sm:w-24 space-y-1.5">
                    <label className="text-[10px] font-bold text-ink-muted uppercase tracking-widest ml-1">Qty</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={item.orderedQty || ""}
                      onChange={e => updateItem(idx, "orderedQty", parseFloat(e.target.value))}
                      className="w-full px-3 py-2 bg-white rounded-lg text-sm font-mono"
                    />
                  </div>
                  <div className="w-full sm:w-32 space-y-1.5">
                    <label className="text-[10px] font-bold text-ink-muted uppercase tracking-widest ml-1">Rate (₹)</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.rate === 0 ? "" : item.rate}
                      onChange={e => updateItem(idx, "rate", parseFloat(e.target.value))}
                      className="w-full px-3 py-2 bg-white rounded-lg text-sm font-mono"
                    />
                  </div>
                  <div className="w-full sm:w-28 text-right pb-2 shrink-0">
                    <span className="text-xs font-mono font-bold text-ink">
                      ₹{((item.orderedQty || 0) * (item.rate || 0)).toLocaleString("en-IN")}
                    </span>
                  </div>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(idx)} className="p-2 text-ink-muted hover:text-danger hover:bg-white rounded-lg transition mb-1 shrink-0">
                      <Trash2 className="w-4 h-4 cursor-pointer" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4 pt-6 border-t border-divider">
               <div className="space-y-1.5 focus-within:text-primary transition-colors">
                 <label className="text-[10px] font-black uppercase tracking-widest text-inherit ml-1">Expected Delivery (Optional)</label>
                 <input
                   type="date"
                   value={expectedDeliveryDate}
                   onChange={e => setExpectedDeliveryDate(e.target.value)}
                   className="w-full px-4 py-3 bg-panel border-none rounded-xl text-sm font-medium font-mono text-ink focus:ring-2 focus:ring-primary transition-all cursor-pointer"
                 />
               </div>
               <div className="space-y-1.5 focus-within:text-primary transition-colors">
                 <label className="text-[10px] font-black uppercase tracking-widest text-inherit ml-1">Notes</label>
                 <input
                   type="text"
                   placeholder="e.g. Deliver to North Gate"
                   value={notes}
                   onChange={e => setNotes(e.target.value)}
                   className="w-full px-4 py-3 bg-panel border-none rounded-xl text-sm font-medium text-ink focus:ring-2 focus:ring-primary transition-all"
                 />
               </div>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
               {([["loading", "Loading"], ["transport", "Transport"], ["other", "Other"]] as const).map(([key, label]) => (
                  <div key={key}>
                     <label className="block text-[10px] font-black text-ink-muted uppercase tracking-widest mb-1.5">
                        {label} charges (₹)
                     </label>
                     <input
                        type="number"
                        min="0"
                        step="any"
                        value={charges[key] || ""}
                        onChange={(e) =>
                           setCharges((c) => ({ ...c, [key]: parseFloat(e.target.value) || 0 }))
                        }
                        placeholder="0"
                        className="w-full px-4 py-3 bg-panel border-none rounded-xl text-sm font-medium text-ink focus:ring-2 focus:ring-primary transition-all"
                     />
                  </div>
               ))}
            </div>

            <div className="mt-4 mb-4 p-6 bg-[#F7E4DB] border border-[#F7E4DB]/50 rounded-[20px] space-y-2">
               <div className="flex justify-between text-xs font-bold text-[#B85F3B]/80">
                  <span>Materials</span>
                  <span className="font-mono">₹{materialTotal.toLocaleString("en-IN")}</span>
               </div>
               {chargesTotal > 0 && (
                  <div className="flex justify-between text-xs font-bold text-[#B85F3B]/80">
                     <span>Loading + Transport + Other</span>
                     <span className="font-mono">₹{chargesTotal.toLocaleString("en-IN")}</span>
                  </div>
               )}
               <div className="flex justify-between items-center pt-2 border-t border-primary/20">
                  <span className="text-xs font-black text-primary uppercase tracking-widest">Total Amount</span>
                  <span className="text-2xl font-black text-primary tracking-tight font-mono">
                     ₹{totalAmount.toLocaleString("en-IN")}
                  </span>
               </div>
            </div>

            <div className="mt-auto pt-6 border-t border-divider">
              <button
                type="submit"
                disabled={isSubmitting || !vendorId || totalAmount <= 0}
                className="w-full py-4 bg-primary hover:bg-[#B85F3B] disabled:bg-fossil disabled:cursor-not-allowed text-white text-sm font-bold uppercase tracking-widest rounded-xl transition flex justify-center items-center gap-2 cursor-pointer shadow-[0_4px_20px_rgba(79,70,229,0.2)] hover:shadow-[0_8px_30px_rgba(79,70,229,0.3)]"
              >
                {isSubmitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> {isEditing ? "Updating PO..." : "Saving PO..."}</>
                ) : (
                  <><Save className="w-5 h-5" /> {isEditing ? "Update PO" : "Save Draft PO"}</>
                )}
              </button>
            </div>
         </form>
      </motion.div>
    </div>
  );
};
