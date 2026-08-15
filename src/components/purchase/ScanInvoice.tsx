import React, { useMemo, useState } from "react";
import {
  X,
  UploadSimple as Upload,
  ArrowsClockwise as RefreshCw,
  WarningCircle as AlertCircle,
  CheckCircle as CheckCircle2,
  Sparkle,
} from "@phosphor-icons/react";
import { useAuthStore } from "../../store";
import { useProjectData } from "../../hooks/useProjectData";
import { callExtractVendorInvoice } from "../../services/firebaseFunctions";
import { postInvoiceReceipt } from "../../services/invoiceReceiptService";
import { PurchaseOrder, VendorBill, InventoryItem } from "../../types";

interface ScanInvoiceProps {
  projectId: string;
  onClose: () => void;
  onPosted?: () => void;
  initialBill?: VendorBill; // when reviewing a pending draft (e.g. from Telegram)
}

const inr = (n: number) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function recalcLine(line: any) {
  const taxable = r2(line.qty * line.rate);
  const taxAmt = r2((taxable * (line.gstRate || 0)) / 100);
  const isIgst = (line.igst || 0) > 0 && !(line.cgst || 0);
  const cgst = isIgst ? 0 : r2(taxAmt / 2);
  const sgst = isIgst ? 0 : r2(taxAmt / 2);
  const igst = isIgst ? taxAmt : 0;
  return { ...line, taxableValue: taxable, cgst, sgst, igst, lineTotal: r2(taxable + cgst + sgst + igst) };
}

function totalsOf(lines: any[], charges: any) {
  const subtotalTaxable = r2(lines.reduce((a, l) => a + l.taxableValue, 0));
  const totalCGST = r2(lines.reduce((a, l) => a + (l.cgst || 0), 0));
  const totalSGST = r2(lines.reduce((a, l) => a + (l.sgst || 0), 0));
  const totalIGST = r2(lines.reduce((a, l) => a + (l.igst || 0), 0));
  const chargesTotal = (charges?.loading || 0) + (charges?.transport || 0) + (charges?.other || 0);
  const grandTotal = r2(subtotalTaxable + totalCGST + totalSGST + totalIGST + chargesTotal);
  return { subtotalTaxable, totalCGST, totalSGST, totalIGST, grandTotal };
}

export const ScanInvoice: React.FC<ScanInvoiceProps> = ({ projectId, onClose, onPosted, initialBill }) => {
  const user = useAuthStore((s) => s.user);
  const { data: pos = [] } = useProjectData<PurchaseOrder>(projectId, "purchase_orders");
  const { data: inventory = [] } = useProjectData<InventoryItem>(projectId, "inventory");

  // Inventory is keyed by its own doc id, which equals a matched line's
  // poLineRef — so we can show the already-defined material (name + group code)
  // each invoice line links to, and confirm that's where its qty will land.
  const invById = useMemo(() => {
    const m: Record<string, InventoryItem> = {};
    inventory.forEach((i) => { m[i.id] = i; });
    return m;
  }, [inventory]);
  const [step, setStep] = useState<"upload" | "review" | "posting" | "done">(initialBill ? "review" : "upload");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [bill, setBill] = useState<VendorBill | null>(initialBill || null);
  const [flags, setFlags] = useState<string[]>(initialBill?.flags || []);

  // Open POs for the match selector (works for both scanned + draft review).
  const candidatePOs = useMemo(
    () =>
      pos
        .filter((p) => p.status === "Approved" || p.status === "Partially Received")
        .map((p) => ({ id: p.id, poNumber: p.poNumber })),
    [pos],
  );

  const handleFile = async (f: File) => {
    setError(null);
    setFile(f);
    setStep("review");
    setBill(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });
      const res = await callExtractVendorInvoice({
        orgId: user?.currentOrgId,
        projectId,
        fileBase64: base64,
        mimeType: f.type || "image/jpeg",
      });
      setBill(res.bill as VendorBill);
      setFlags(res.flags || []);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Couldn't read the invoice. Try a clearer photo or PDF.");
      setStep("upload");
    }
  };

  const setPo = (poId: string) => {
    if (!bill) return;
    const po = candidatePOs.find((p) => p.id === poId);
    setBill({ ...bill, poId, poNumber: po?.poNumber });
  };

  const editQty = (idx: number, qty: number) => {
    if (!bill) return;
    const lines = bill.lineItems.map((l, i) => (i === idx ? recalcLine({ ...l, qty }) : l));
    setBill({ ...bill, lineItems: lines, ...totalsOf(lines, bill.charges) });
  };

  const confirm = async () => {
    if (!bill || !user) return;
    if (!bill.poId) { setError("Pick the matching PO before saving."); return; }
    setStep("posting");
    setError(null);
    try {
      await postInvoiceReceipt({ user, projectId, bill, sourceFile: file, draftBillId: initialBill?.id });
      setStep("done");
      onPosted?.();
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Failed to post the invoice.");
      setStep("review");
    }
  };

  const showReview = (step === "review" || step === "posting") && !!bill;
  const showLoading = step === "review" && !bill;

  return (
    <div className="fixed inset-0 bg-onyx/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-2xl rounded-3xl border border-divider shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-5 border-b border-divider shrink-0">
          <h2 className="font-black text-ink flex items-center gap-2">
            <Sparkle weight="fill" className="w-5 h-5 text-[#6E8CA0]" /> {initialBill ? "Review Vendor Bill" : "Scan Vendor Invoice"}
          </h2>
          <button onClick={onClose} className="p-2 bg-panel hover:bg-divider rounded-full">
            <X className="w-5 h-5 text-ink-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-danger/8 text-danger rounded-xl border border-danger/20 flex items-start gap-2 text-sm whitespace-pre-line">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {step === "upload" && (
            <label className="block border-2 border-dashed border-divider rounded-2xl p-10 text-center cursor-pointer hover:border-[#6E8CA0]/50 transition-colors">
              <Upload className="w-10 h-10 mx-auto text-ink-muted mb-3" />
              <div className="font-bold text-ink">Upload the GST invoice</div>
              <div className="text-sm text-ink-muted mt-1">Photo or PDF · reads it and matches your PO</div>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
          )}

          {showLoading && (
            <div className="p-10 text-center text-ink-muted">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
              Reading the invoice…
            </div>
          )}

          {showReview && bill && (
            <div className="space-y-5">
              {flags.length > 0 && (
                <div className="p-3 bg-primary/10 text-[#B85F3B] rounded-xl border border-primary/30 text-sm">
                  <div className="font-bold mb-1 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" /> Please check:</div>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {flags.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Vendor" value={bill.vendorName || "—"} />
                <Field label="Invoice #" value={bill.invoiceNumber || "—"} />
                <Field label="Invoice date" value={bill.invoiceDate || "—"} />
                <div>
                  <div className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1">Match to PO</div>
                  <select
                    value={bill.poId || ""}
                    onChange={(e) => setPo(e.target.value)}
                    className="w-full bg-panel p-2 rounded-lg border border-divider text-sm font-bold text-ink"
                  >
                    <option value="">— Select PO —</option>
                    {candidatePOs.map((p) => (
                      <option key={p.id} value={p.id}>{p.poNumber}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border border-divider rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-panel text-ink-muted">
                    <tr>
                      <th className="p-2 text-left">Item</th>
                      <th className="p-2 text-right">Qty</th>
                      <th className="p-2 text-right">Rate (ex-GST)</th>
                      <th className="p-2 text-right">GST%</th>
                      <th className="p-2 text-right">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bill.lineItems.map((l, i) => {
                      const inv = l.poLineRef ? invById[l.poLineRef] : undefined;
                      const code = inv?.groupCode || inv?.code || inv?.materialId || l.materialId;
                      return (
                      <tr key={i} className="border-t border-divider/50 align-top">
                        <td className="p-2">
                          {l.name}
                          {l.poLineRef ? (
                            <div className="text-[10px] font-semibold text-success mt-0.5">
                              ↳ {inv?.name || "matched to PO"}{code ? ` · ${code}` : ""}
                            </div>
                          ) : (
                            <span className="text-primary text-[10px] font-semibold" title="Not on PO"> ⚠️ not on PO</span>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            value={l.qty || ""}
                            min="0"
                            step="0.01"
                            onChange={(e) => editQty(i, parseFloat(e.target.value) || 0)}
                            className="w-16 bg-panel p-1 rounded border border-divider text-right font-mono"
                          />
                        </td>
                        <td className="p-2 text-right font-mono">{inr(l.rate)}</td>
                        <td className="p-2 text-right font-mono">{l.gstRate || 0}%</td>
                        <td className="p-2 text-right font-mono">{inr(l.lineTotal)}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="bg-panel rounded-xl p-4 text-sm space-y-1 font-mono">
                <Row k="Taxable (ex-GST)" v={inr(bill.subtotalTaxable)} />
                {bill.totalCGST > 0 && <Row k="CGST" v={inr(bill.totalCGST)} />}
                {bill.totalSGST > 0 && <Row k="SGST" v={inr(bill.totalSGST)} />}
                {bill.totalIGST > 0 && <Row k="IGST" v={inr(bill.totalIGST)} />}
                {!!((bill.charges?.loading || 0) + (bill.charges?.transport || 0) + (bill.charges?.other || 0)) && (
                  <Row k="Charges" v={inr((bill.charges?.loading || 0) + (bill.charges?.transport || 0) + (bill.charges?.other || 0))} />
                )}
                <div className="border-t border-divider pt-1 mt-1 flex justify-between font-black text-ink">
                  <span>Grand total (payable)</span><span>{inr(bill.grandTotal)}</span>
                </div>
              </div>

              <p className="text-[11px] text-ink-muted">
                Posting records the goods receipt + this bill. Payable = grand total (incl-GST); material cost is booked ex-GST (GST is input credit). Review before saving.
              </p>
            </div>
          )}

          {step === "done" && (
            <div className="p-10 text-center">
              <CheckCircle2 weight="fill" className="w-12 h-12 mx-auto mb-3 text-success" />
              <div className="font-black text-ink">Invoice posted</div>
              <div className="text-sm text-ink-muted mt-1">GRN + vendor bill recorded and matched to the PO.</div>
            </div>
          )}
        </div>

        {showReview && bill && (
          <div className="p-5 border-t border-divider shrink-0 flex gap-3">
            <button onClick={onClose} className="px-5 py-3 bg-panel text-ink font-bold rounded-xl hover:bg-divider">
              Cancel
            </button>
            <button
              onClick={confirm}
              disabled={step === "posting" || !bill.poId}
              className="flex-1 px-5 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {step === "posting" ? <><RefreshCw className="w-4 h-4 animate-spin" /> Posting…</> : "Confirm & Post"}
            </button>
          </div>
        )}
        {step === "done" && (
          <div className="p-5 border-t border-divider shrink-0">
            <button onClick={onClose} className="w-full px-5 py-3 bg-primary text-white font-bold rounded-xl">Done</button>
          </div>
        )}
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1">{label}</div>
    <div className="bg-panel p-2 rounded-lg border border-divider font-semibold text-ink truncate">{value}</div>
  </div>
);

const Row: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div className="flex justify-between text-ink-muted"><span>{k}</span><span>{v}</span></div>
);
