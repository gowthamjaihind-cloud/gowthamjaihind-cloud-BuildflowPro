import React, { useMemo, useState } from "react";
import { X, ArrowDown, ArrowUp, WarningCircle, Trash, CircleNotch } from "@phosphor-icons/react";
import { useProjectData } from "../../hooks/useProjectData";
import { useTasksQuery } from "../../hooks/queries";
import { useProjectDailyLogsQuery } from "../../hooks/useDailyLogs";
import { useAuthStore } from "../../store";
import { stockCard, type Movement } from "../../lib/stockCard";
import { deleteGrn } from "../../services/grnReversal";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { confirmDialog, toast } from "../../lib/feedback";
import { DialogBehaviour } from "../../lib/useDialog";
import type { InventoryItem } from "../../types";

/**
 * One material's stock card (Inventory > Stock Ledger > tap a material):
 * every receipt and every use with date, vendor, GRN / PO / challan, who
 * entered it and the running balance, with possible double entries flagged
 * (lib/stockCard.ts). A flagged receipt can be deleted from here, which undoes
 * it exactly as deleting it in Goods Receipt does.
 */

const fmtDate = (d: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const q = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });

export const StockCard: React.FC<{ item: InventoryItem; projectId: string; onClose: () => void }> = ({ item, projectId, onClose }) => {
  const user = useAuthStore((s) => s.user);
  const { data: grns = [] } = useProjectData<any>(projectId, "goodsReceiptNotes");
  const { data: dailyLogs = [] } = useProjectDailyLogsQuery(projectId);
  const { data: tasks = [] } = useTasksQuery(projectId);
  const [filter, setFilter] = useState<"all" | "in" | "out">("all");
  const [deleting, setDeleting] = useState("");
  const [openingEdit, setOpeningEdit] = useState<string | null>(null);
  const [savingOpening, setSavingOpening] = useState(false);
  const isManager = ["Owner", "Admin", "Project Manager", "Project Director"].includes(String(user?.role));

  const card = useMemo(
    () => stockCard(item, grns, dailyLogs as any[], (id) => tasks.find((t: any) => t.id === id)?.name || ""),
    [item, grns, dailyLogs, tasks],
  );
  const rows = card.rows.filter((r) => filter === "all" || (filter === "in" ? r.kind !== "out" : r.kind === "out"));
  const tenantPath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;
  // As GoodsReceiptDetails: managers, or whoever recorded the receipt.
  const canDelete = (r: Movement) => {
    const g = grns.find((x: any) => x.id === r.grnId);
    return !!g && (["Owner", "Admin", "Project Manager"].includes(String(user?.role)) || g.createdByUid === user?.uid);
  };

  const removeReceipt = async (r: Movement) => {
    const g = grns.find((x: any) => x.id === r.grnId);
    if (!g) return;
    const ok = await confirmDialog({
      title: `Delete ${g.grnNumber}?`,
      body: `This undoes the whole goods receipt (${g.vendorName}, ${fmtDate(r.date)}): its quantities come off inventory and the PO, and its amount off the vendor's balance. A bill posted with it goes back to "Pending review".`,
      confirmLabel: "Delete receipt",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(g.id);
    try {
      await deleteGrn(tenantPath, { id: g.id, ...g });
      toast.success(`${g.grnNumber} deleted.`);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't delete it.");
    } finally {
      setDeleting("");
    }
  };

  /**
   * Opening stock is not a record of its own: it is the item's quantity beyond
   * its receipts (inventory.openingQty; quantity = opening + receipts, as the
   * goods-receipt trigger keeps it). Correcting it sets both.
   */
  const saveOpening = async (value: number) => {
    if (!(value >= 0)) { toast.error("Enter 0 or more."); return; }
    setSavingOpening(true);
    try {
      await updateDoc(doc(db, `${tenantPath}/inventory/${item.id}`), {
        openingQty: value,
        quantity: Math.round((value + card.received) * 1000) / 1000,
      });
      toast.success(value ? `Opening stock set to ${q(value)} ${item.unit}.` : "Opening stock removed.");
      setOpeningEdit(null);
    } catch (e: any) {
      toast.error(e?.code === "permission-denied" ? "Only a manager can correct stock." : e?.message || "Couldn't save it.");
    } finally {
      setSavingOpening(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-surface-dark/50 backdrop-blur-sm flex justify-end" onClick={onClose}>
      <div className="bg-surface w-full max-w-3xl h-full flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <DialogBehaviour />
        <div className="flex items-start justify-between gap-3 p-5 border-b border-divider">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">Stock card</p>
            <h2 className="text-lg font-black text-ink truncate">{item.name}</h2>
            <p className="text-xs text-ink-muted">{item.materialId || ""}{item.materialId ? " · " : ""}{item.unit}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 bg-panel rounded-full hover:bg-divider"><X className="w-5 h-5 text-ink-muted" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["Received", card.received],
              ["Opening / entered", card.opening],
              ["Used", card.used],
              ["In stock", card.inStock],
            ].map(([label, v]) => (
              <div key={label as string} className="bg-panel rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">{label}</p>
                <p className="text-base font-black text-ink font-mono">{q(v as number)} <span className="text-[10px] text-ink-muted">{item.unit}</span></p>
              </div>
            ))}
          </div>

          {card.duplicates > 0 && (
            <div className="flex gap-2 p-3 rounded-xl bg-warning/10 border border-warning/30 text-sm text-ink">
              <WarningCircle weight="fill" className="w-5 h-5 text-warning shrink-0" />
              <p>
                <b>{card.duplicates} receipts may be the same delivery entered twice</b> (same vendor with the same challan/invoice number, or the same quantity within 3 days). Check them below; delete the extra one if it is a double entry.
              </p>
            </div>
          )}
          {card.mismatch > 0 && (
            <div className="flex gap-2 p-3 rounded-xl bg-panel border border-divider text-sm text-ink">
              <WarningCircle weight="fill" className="w-5 h-5 text-ink-muted shrink-0" />
              <p>
                Goods receipts add up to {q(card.mismatch)} {item.unit} more than this item's quantity. The quantity was probably edited in Inventory after a receipt.
                {isManager && (
                  <button onClick={() => saveOpening(0)} disabled={savingOpening} className="ml-2 font-bold text-primary underline disabled:opacity-50">
                    Make stock match the receipts
                  </button>
                )}
              </p>
            </div>
          )}

          <div className="flex gap-1 bg-panel p-1 rounded-xl w-fit" role="tablist">
            {(["all", "in", "out"] as const).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${filter === f ? "bg-surface shadow-sm text-primary" : "text-ink-muted"}`}>
                {f === "all" ? "All" : f === "in" ? "Received" : "Used"}
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-ink-muted py-8 text-center">No stock movements recorded for this material yet.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.id} className={`p-3 rounded-xl border ${r.duplicateOf ? "border-warning/50 bg-warning/5" : "border-divider bg-surface"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      {r.kind === "out"
                        ? <ArrowUp weight="bold" className="w-4 h-4 text-danger mt-0.5 shrink-0" aria-label="Used" />
                        : <ArrowDown weight="bold" className="w-4 h-4 text-success mt-0.5 shrink-0" aria-label="Received" />}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-ink">
                          {r.kind === "opening" ? "Opening stock" : r.kind === "in" ? r.party || "Vendor not recorded" : r.party || "Daily log"}
                          <span className="font-normal text-ink-muted"> · {fmtDate(r.date)}</span>
                        </p>
                        <p className="text-xs text-ink-muted break-words">{r.ref}{r.via && r.kind === "in" ? ` · ${r.via}` : ""}{r.by ? ` · by ${r.by}` : ""}</p>
                        {r.duplicateOf && <p className="text-xs font-bold text-warning mt-0.5">Possible double entry: looks like {r.duplicateOf}</p>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-black font-mono ${r.kind === "out" ? "text-danger" : "text-success"}`}>{r.kind === "out" ? "−" : "+"}{q(r.qty)}</p>
                      {r.rate ? <p className="text-[10px] text-ink-muted font-mono">@ ₹{r.rate.toLocaleString("en-IN")}</p> : null}
                      <p className="text-[10px] text-ink-muted font-mono">Bal {q(r.balance)}</p>
                    </div>
                  </div>
                  {r.kind === "opening" && isManager && (
                    openingEdit === null ? (
                      <button onClick={() => setOpeningEdit(String(r.qty))}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary px-2.5 py-1 rounded-lg hover:bg-primary/10">
                        Correct opening stock
                      </button>
                    ) : (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="text-xs font-bold text-ink-muted">
                          Opening stock ({item.unit})
                          <input type="number" min="0" step="any" value={openingEdit} onChange={(e) => setOpeningEdit(e.target.value)}
                            className="ml-2 w-24 px-2 py-1 rounded-lg bg-panel border border-divider font-mono text-ink" />
                        </label>
                        <button onClick={() => saveOpening(parseFloat(openingEdit) || 0)} disabled={savingOpening}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary text-on-primary disabled:opacity-50">
                          {savingOpening ? "Saving…" : "Save"}
                        </button>
                        <button onClick={() => saveOpening(0)} disabled={savingOpening}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg border border-divider text-danger disabled:opacity-50">
                          Remove (set to 0)
                        </button>
                        <button onClick={() => setOpeningEdit(null)} className="text-xs font-bold text-ink-muted">Cancel</button>
                        <p className="basis-full text-[11px] text-ink-muted">
                          Stock becomes this plus the goods received ({q(card.received)} {item.unit}). Use it to remove opening stock that was never there.
                        </p>
                      </div>
                    )
                  )}
                  {r.kind === "in" && r.duplicateOf && canDelete(r) && (
                    <button onClick={() => removeReceipt(r)} disabled={!!deleting}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-danger px-2.5 py-1 rounded-lg hover:bg-danger/10 disabled:opacity-50">
                      {deleting === r.grnId ? <CircleNotch className="w-3.5 h-3.5 animate-spin" /> : <Trash className="w-3.5 h-3.5" />}
                      Delete this receipt
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockCard;
