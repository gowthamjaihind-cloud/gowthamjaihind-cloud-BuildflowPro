import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  FloppyDisk as Save,
  Trash as Trash2,
  Plus,
  WarningCircle as AlertCircle,
  CheckCircle as CheckCircle2,
  CaretDown as ChevronDown,
  Package,
} from "@phosphor-icons/react";
import { doc, getDoc, runTransaction, collection } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../firebase";
import {
  Vendor,
  MaterialReceipt,
  ReceiptLineItem,
  PurchaseOrder,
  GoodsReceiptNote,
  InventoryItem
} from "../../types";
import { useAuthStore } from "../../store";
import { useQueryClient } from "@tanstack/react-query";

interface MaterialReceiptFormProps {
  projectId: string;
  vendors: Vendor[];
  inventory: InventoryItem[];
  allPOs: PurchaseOrder[];
  allGRNs: GoodsReceiptNote[];
  existingReceipt: MaterialReceipt | null;
  onClose: () => void;
}

export const MaterialReceiptForm: React.FC<MaterialReceiptFormProps> = ({
  projectId,
  vendors,
  inventory,
  allPOs,
  allGRNs,
  existingReceipt,
  onClose,
}) => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState(existingReceipt?.supplierId || "");
  const [invoiceNumber, setInvoiceNumber] = useState(existingReceipt?.invoiceNumber || "");
  const [receiptDate, setReceiptDate] = useState(existingReceipt?.receiptDate || new Date().toISOString().split("T")[0]);
  const [poId, setPoId] = useState(existingReceipt?.poId || "");
  const [grnIds, setGrnIds] = useState<string[]>(existingReceipt?.grnIds || []);
  const [items, setItems] = useState<ReceiptLineItem[]>(existingReceipt?.items || []);
  const [notes, setNotes] = useState(existingReceipt?.notes || "");

  const vendorPOs = useMemo(() => {
    if (!supplierId) return [];
    return allPOs.filter(po => po.vendorId === supplierId && (po.status === "Approved" || po.status === "Partially Received" || po.status === "Closed"));
  }, [allPOs, supplierId]);

  const poGRNs = useMemo(() => {
    if (!poId) return [];
    return allGRNs.filter(grn => grn.poId === poId);
  }, [allGRNs, poId]);

  const selectedPO = useMemo(() => allPOs.find(p => p.id === poId), [allPOs, poId]);
  const selectedGRNs = useMemo(() => allGRNs.filter(g => grnIds.includes(g.id)), [allGRNs, grnIds]);

  // Pre-fill items based on selected GRNs if items is empty
  useEffect(() => {
    if (!existingReceipt && selectedGRNs.length > 0) {
      const mergedItems = new Map<string, ReceiptLineItem>();
      selectedGRNs.forEach(grn => {
        grn.lineItems.forEach(line => {
          if (line.acceptedQty > 0) {
            const key = line.poLineRef;
            if (mergedItems.has(key)) {
              const existing = mergedItems.get(key)!;
              existing.quantity += line.acceptedQty;
              existing.totalPrice = existing.quantity * existing.unitRate;
            } else {
              const poLine = selectedPO?.lineItems.find(pl => pl.itemId === line.poLineRef);
              const rate = poLine?.rate || 0;
              mergedItems.set(key, {
                itemId: line.poLineRef,
                materialId: line.materialId,
                name: line.name,
                poLineRef: key,
                quantity: line.acceptedQty,
                unitRate: rate,
                totalPrice: line.acceptedQty * rate
              });
            }
          }
        });
      });
      setItems(Array.from(mergedItems.values()));
    }
  }, [selectedGRNs, selectedPO]);

  const matchData = useMemo(() => {
    return items.map(item => {
      // Find PO details
      const poLine = selectedPO?.lineItems.find(p => p.itemId === item.poLineRef);
      const orderedQty = poLine?.orderedQty || 0;
      const poRate = poLine?.rate || 0;

      // Find GRN totals
      let grnAcceptedQty = 0;
      selectedGRNs.forEach(grn => {
        const gl = grn.lineItems.find(g => g.poLineRef === item.poLineRef);
        if (gl) grnAcceptedQty += gl.acceptedQty;
      });

      let status = "Unlinked";
      if (poId) {
        if (!poLine) {
          status = "Unmatched";
        } else if (item.quantity !== grnAcceptedQty) {
          status = "Quantity mismatch";
        } else if (Math.abs(item.unitRate - poRate) > 0.01) {
          status = "Rate mismatch";
        } else {
          status = "Matched";
        }
      }

      return {
        item,
        poLine,
        orderedQty,
        poRate,
        grnAcceptedQty,
        status
      };
    });
  }, [items, selectedPO, selectedGRNs, poId]);

  const overallMatchStatus = useMemo(() => {
    if (!poId) return "Unlinked";
    if (matchData.length === 0) return "Unlinked";
    if (matchData.some(m => m.status === "Unmatched" || m.status === "Quantity mismatch" || m.status === "Rate mismatch")) {
      return "Has Discrepancies";
    }
    return "Fully Matched";
  }, [matchData, poId]);
  
  const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);

  const handleSave = async (e: React.FormEvent) => {
    const tenantPath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;
    e.preventDefault();
    if (!supplierId || items.length === 0) return;

    setIsSubmitting(true);
    setError(null);

    const vendor = vendors.find(v => v.id === supplierId);
    if (!vendor) return;

    try {
      await runTransaction(db, async (transaction) => {
        let oldData: MaterialReceipt | null = null;
        if (existingReceipt) {
           const oldRef = doc(db, `${tenantPath}/receipts/${existingReceipt.id}`);
           const oldDoc = await transaction.get(oldRef);
           if (oldDoc.exists()) oldData = oldDoc.data() as MaterialReceipt;
        }

        const vendorRef = doc(db, `${tenantPath}/suppliers/${supplierId}`);
        const vendorDoc = await transaction.get(vendorRef);
        if (!vendorDoc.exists()) throw new Error("Vendor not found");

        let oldVendorDoc = null;
        if (oldData && oldData.supplierId !== supplierId) {
           const oldVendorRef = doc(db, `${tenantPath}/suppliers/${oldData.supplierId}`);
           oldVendorDoc = await transaction.get(oldVendorRef);
        }

        const receiptId = existingReceipt?.id || doc(db, `${tenantPath}/receipts`).id;

        let diff = totalAmount;
        if (oldData) {
           diff = totalAmount - oldData.totalAmount;
           if (oldVendorDoc && oldData.supplierId !== supplierId) {
              const ovData = oldVendorDoc.data() as Vendor;
              transaction.update(doc(db, `${tenantPath}/suppliers/${oldData.supplierId}`), {
                 outstandingBalance: (ovData.outstandingBalance || 0) - oldData.totalAmount
              });
              diff = totalAmount; // apply full as new to new vendor
           }
        }

        const vData = vendorDoc.data() as Vendor;
        transaction.update(vendorRef, {
           outstandingBalance: (vData.outstandingBalance || 0) + diff
        });

        const costRef = existingReceipt?.costEntryId
            ? doc(db, `${tenantPath}/costs/${existingReceipt.costEntryId}`)
            : doc(collection(db, `${tenantPath}/costs`));
        const ledgerRef = existingReceipt?.ledgerId
            ? doc(db, `${tenantPath}/ledger/${existingReceipt.ledgerId}`)
            : doc(collection(db, `${tenantPath}/ledger`));

        transaction.set(ledgerRef, {
            id: ledgerRef.id,
            projectId,
            vendorId: supplierId,
            date: new Date(receiptDate || "").toISOString(),
            type: "CREDIT",
            amount: totalAmount,
            referenceType: "GRN",
            referenceId: receiptId,
            description: `Material Inward - Invoice: ${invoiceNumber}`
        });
        transaction.set(costRef, {
            id: costRef.id,
            projectId,
            date: new Date(receiptDate || "").toISOString(),
            category: "Material",
            type: "Actual",
            amount: totalAmount,
            description: `Material Inward - Invoice: ${invoiceNumber} (${vendor.name})`,
            taskId: "",
            isAccrual: true
        });

        const newReceipt: MaterialReceipt = {
           id: receiptId,
           projectId,
           supplierId,
           supplierName: vendor.name,
           receiptDate,
           invoiceNumber,
           totalAmount,
           notes: notes || undefined,
           items,
           poId: poId || undefined,
           poNumber: selectedPO?.poNumber,
           grnIds: grnIds.length > 0 ? grnIds : undefined,
           grnNumbers: selectedGRNs.map(g => g.grnNumber),
           matchStatus: overallMatchStatus,
           ledgerId: ledgerRef.id,
           costEntryId: costRef.id
        };

        transaction.set(doc(db, `${tenantPath}/receipts/${receiptId}`), newReceipt);
      });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'receipts'] });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'ledger'] });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'suppliers'] });
      onClose();
    } catch (err: any) {
      console.error(err);
      let errorMsg = "Failed to save Receipt";
      try { handleFirestoreError(err, OperationType.CREATE, "receipts"); } 
      catch (handledError: any) { errorMsg = handledError.message; }
      setError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-onyx/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface rounded-[24px] md:rounded-[32px] w-full max-w-5xl overflow-hidden my-auto shadow-2xl"
      >
        <div className={`p-6 md:p-8 text-white flex justify-between items-center transition-colors
          ${overallMatchStatus === "Fully Matched" ? "bg-[#059669]" : 
            overallMatchStatus === "Has Discrepancies" ? "bg-[#C0653F]" : "bg-[#465D6E]"}`}
        >
          <div>
            <h3 className="text-xl md:text-2xl font-black">
              {existingReceipt ? "Edit Invoice" : "Record Material Invoice"}
            </h3>
            <div className="flex items-center gap-2 mt-1">
               <span className="text-white/80 text-[10px] font-bold uppercase tracking-widest">{overallMatchStatus}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 md:p-8 space-y-6 md:space-y-8">
          {error && (
            <div className="p-4 bg-[#EF4444]/8 text-[#EF4444] rounded-xl text-sm font-bold flex flex-col gap-1">
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1.5 md:space-y-2">
              <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">Vendor</label>
              <select
                required
                className="w-full bg-panel p-3.5 md:p-4 rounded-xl text-sm font-bold border-2 border-transparent focus:border-[#D97D54] outline-none"
                value={supplierId}
                onChange={(e) => {
                   setSupplierId(e.target.value);
                   setPoId("");
                   setGrnIds([]);
                }}
                disabled={!!existingReceipt}
              >
                <option value="">Select Vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 md:space-y-2">
              <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">Purchase Order (Optional)</label>
              <select
                className="w-full bg-panel p-3.5 md:p-4 rounded-xl text-sm font-bold border-2 border-transparent focus:border-[#D97D54] outline-none disabled:opacity-50"
                value={poId}
                onChange={(e) => {
                   setPoId(e.target.value);
                   setGrnIds([]);
                }}
                disabled={!supplierId || !!existingReceipt}
              >
                <option value="">None / Unlinked</option>
                {vendorPOs.map(po => (
                  <option key={po.id} value={po.id}>{po.poNumber} - {po.status}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 md:space-y-2">
              <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">Goods Receipts (GRN)</label>
              <div className="relative">
                 <select
                   multiple
                   className="w-full bg-panel p-2 rounded-xl text-xs font-bold border-2 border-transparent focus:border-[#D97D54] outline-none min-h-[58px]"
                   value={grnIds}
                   onChange={(e) => setGrnIds(Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value))}
                   disabled={!poId}
                 >
                   {poGRNs.length === 0 && <option disabled>No GRNs available</option>}
                   {poGRNs.map(grn => (
                     <option key={grn.id} value={grn.id}>{grn.grnNumber}</option>
                   ))}
                 </select>
                 <p className="text-[9px] text-ink-muted mt-1 ml-1 font-medium">Ctrl/Cmd+click to select multiple</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-divider">
            <div className="space-y-1.5 md:space-y-2">
              <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">Invoice / Ref No.</label>
              <input
                required
                placeholder="INV-001"
                className="w-full bg-panel p-3.5 md:p-4 rounded-xl text-sm font-bold border-2 border-transparent focus:border-[#D97D54] outline-none"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 md:space-y-2">
              <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">Date</label>
              <input
                type="date"
                required
                className="w-full bg-panel p-3.5 md:p-4 rounded-xl text-sm font-bold border-2 border-transparent focus:border-[#D97D54] outline-none"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center bg-[#F7E4DB] p-4 rounded-xl border border-[#F7E4DB]/50">
              <h4 className="text-xs font-black uppercase tracking-widest text-[#B85F3B]">Invoice Items</h4>
              <button
                type="button"
                onClick={() => setItems([...items, { itemId: "", materialId: "", name: "", quantity: 0, unitRate: 0, totalPrice: 0 }])}
                className="text-[#D97D54] text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-[#F7E4DB] px-4 py-2 rounded-xl transition-all"
              >
                <Plus className="w-3 h-3" /> Add Item
              </button>
            </div>

            {/* Three way match table display if PO is selected */}
            {items.length > 0 && poId && (
              <div className="overflow-x-auto rounded-xl border border-divider">
                 <table className="w-full text-left">
                    <thead>
                       <tr className="bg-panel text-[10px] uppercase font-black tracking-widest text-ink-muted border-b border-divider">
                          <th className="p-3">Material</th>
                          <th className="p-3 text-right">PO Rate</th>
                          <th className="p-3 text-right border-l border-divider/50">Ord Qty</th>
                          <th className="p-3 text-right">Rec Qty (GRN)</th>
                          <th className="p-3 text-right border-l border-divider/50 bg-[#F7E4DB]/50">Inv Qty</th>
                          <th className="p-3 text-right bg-[#F7E4DB]/50">Inv Rate</th>
                          <th className="p-3 bg-[#F7E4DB]/50">Status</th>
                          <th className="p-3"></th>
                       </tr>
                    </thead>
                    <tbody className="text-sm font-medium">
                       {matchData.map((data, idx) => (
                          <tr key={idx} className="border-b border-divider/40">
                             <td className="p-3 max-w-[150px]">
                                <select className="w-full bg-transparent outline-none font-bold text-xs" value={data.item.materialId} onChange={(e) => {
                                   const invItem = inventory.find(i => i.id === e.target.value);
                                   const newItems = [...items];
                                   newItems[idx] = { ...data.item, itemId: e.target.value, materialId: e.target.value, name: invItem?.name || "" };
                                   setItems(newItems);
                                }}>
                                   <option value="">Select</option>
                                   {inventory.map(inv => <option key={inv.id} value={inv.id}>{inv.name}</option>)}
                                </select>
                             </td>
                             <td className="p-3 text-right font-mono text-xs">{data.poRate > 0 ? `₹${data.poRate}` : '-'}</td>
                             <td className="p-3 text-right font-mono text-xs text-ink-muted border-l border-divider/50">{data.orderedQty > 0 ? data.orderedQty : '-'}</td>
                             <td className="p-3 text-right font-mono text-xs text-ink-muted">{data.grnAcceptedQty > 0 ? data.grnAcceptedQty : '-'}</td>
                             
                             <td className="p-2 border-l border-divider/50 bg-[#F7E4DB]/20">
                                <input type="number" className="w-20 text-right bg-panel border-divider border rounded p-1 ml-auto block" value={data.item.quantity || ''} onChange={e => {
                                   const qty = parseFloat(e.target.value) || 0;
                                   const newItems = [...items];
                                   newItems[idx] = { ...data.item, quantity: qty, totalPrice: qty * (data.item.unitRate || 0) };
                                   setItems(newItems);
                                }}/>
                             </td>
                             <td className="p-2 bg-[#F7E4DB]/20">
                                <input type="number" className="w-24 text-right bg-panel border-divider border rounded p-1 ml-auto block" value={data.item.unitRate || ''} onChange={e => {
                                   const rate = parseFloat(e.target.value) || 0;
                                   const newItems = [...items];
                                   newItems[idx] = { ...data.item, unitRate: rate, totalPrice: rate * (data.item.quantity || 0) };
                                   setItems(newItems);
                                }}/>
                             </td>
                             <td className="p-3 text-xs bg-[#F7E4DB]/20">
                                {data.status === "Matched" && <span className="text-[#059669] bg-[#34D399]/12 px-2 py-1 rounded-full font-bold">Matched</span>}
                                {data.status === "Rate mismatch" && <span className="text-[#C0653F] bg-[#D97D54]/10 px-2 py-1 rounded-full font-bold" title="Rate != PO">Rate mismatch</span>}
                                {data.status === "Quantity mismatch" && <span className="text-[#C0653F] bg-[#D97D54]/10 px-2 py-1 rounded-full font-bold" title="Qty != GRN">Qty mismatch</span>}
                                {data.status === "Unmatched" && <span className="text-[#EF4444] bg-[#EF4444]/8 px-2 py-1 rounded-full font-bold">Unmatched</span>}
                             </td>
                             <td className="p-2 text-right">
                                <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-[#F87171] hover:text-[#EF4444] hover:bg-[#EF4444]/8 p-1.5 rounded-lg transition-colors">
                                   <Trash2 className="w-4 h-4" />
                                </button>
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
            )}

            {/* Simple list display if NO PO is selected */}
            {!poId && items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-panel p-4 rounded-2xl border border-divider">
                <div className="col-span-1 md:col-span-4 space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-ink-muted">Material</label>
                  <select
                    required
                    className="w-full bg-surface border rounded-xl p-2.5 text-xs font-bold"
                    value={item.itemId}
                    onChange={(e) => {
                      const invItem = inventory.find((i) => i.id === e.target.value);
                      const newItems = [...items];
                      newItems[idx] = {
                        ...item,
                        itemId: e.target.value,
                        materialId: e.target.value,
                        name: invItem?.name || "",
                      };
                      setItems(newItems);
                    }}
                  >
                    <option value="">Select Material</option>
                    {inventory.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div className="col-span-1 md:col-span-2 space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-ink-muted">Quantity</label>
                  <input
                    type="number" required
                    className="w-full bg-surface border rounded-xl p-2.5 text-xs font-bold"
                    value={item.quantity || ""}
                    onChange={(e) => {
                      const qty = parseFloat(e.target.value) || 0;
                      const newItems = [...items];
                      newItems[idx] = { ...item, quantity: qty, totalPrice: qty * item.unitRate };
                      setItems(newItems);
                    }}
                  />
                </div>
                <div className="col-span-1 md:col-span-2 space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-ink-muted">Unit Rate (₹)</label>
                  <input
                    type="number" required
                    className="w-full bg-surface border rounded-xl p-2.5 text-xs font-bold"
                    value={item.unitRate || ""}
                    onChange={(e) => {
                      const rate = parseFloat(e.target.value) || 0;
                      const newItems = [...items];
                      newItems[idx] = { ...item, unitRate: rate, totalPrice: rate * item.quantity };
                      setItems(newItems);
                    }}
                  />
                </div>
                <div className="col-span-1 md:col-span-3 space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-ink-muted">Total Amount</label>
                  <div className="w-full bg-surface/50 border border-transparent rounded-xl p-2.5 text-xs font-bold text-ink flex justify-between items-center">
                     <span>₹</span>
                     <span>{item.totalPrice.toLocaleString("en-IN")}</span>
                  </div>
                </div>
                <div className="col-span-1 flex justify-end pb-1 pb-1">
                  <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-[#F87171] hover:text-[#EF4444] hover:bg-[#EF4444]/8 p-2 rounded-xl transition-colors">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
            
            {items.length === 0 && (
               <div className="text-center py-8 text-ink-muted text-sm font-medium border-2 border-dashed border-divider rounded-xl">
                  No items added. Select GRNs to auto-fill or add manually.
               </div>
            )}
          </div>

          <div className="flex justify-between items-end border-t border-divider pt-6">
             <div className="space-y-1 w-1/2">
                <label className="text-[9px] font-black uppercase tracking-widest text-ink-muted">Notes</label>
                <textarea rows={2} className="w-full bg-panel border rounded-xl p-3 text-xs" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Terms, comments..."></textarea>
             </div>
             <div className="text-right">
               <p className="text-[10px] font-black text-ink-muted uppercase tracking-widest mb-1">Total Invoice Value</p>
               <h3 className="text-3xl font-black font-mono text-[#059669] tracking-tight">₹{totalAmount.toLocaleString("en-IN")}</h3>
             </div>
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <button type="button" onClick={onClose} className="px-6 py-3 bg-panel hover:bg-divider text-ink text-xs font-bold uppercase tracking-widest rounded-xl transition">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting || items.length === 0 || !supplierId} className="px-8 py-3 bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold uppercase tracking-widest rounded-xl transition flex items-center gap-2 shadow-[0_4px_20px_rgba(5,150,105,0.2)] disabled:opacity-50 disabled:shadow-none">
              <Save className="w-4 h-4" /> Save Invoice
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
