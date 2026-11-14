import React, { useRef, useState } from "react";
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";
import { X, DownloadSimple, Printer, CircleNotch } from "@phosphor-icons/react";
import type { CompanyProfile, OrgSettings, PurchaseOrder, Vendor } from "../../types";
import { computePoTotals, hsnSummary, rupeesInWords, stateCodeOf, GST_STATES, taxOn } from "../../lib/poTax";
import { money } from "../../utils/num";
import { toast } from "../../lib/feedback";
import { DialogBehaviour } from "../../lib/useDialog";

/**
 * The purchase order as a document: the company's letterhead, the vendor, the
 * lines with HSN codes and GST, the tax summary, terms and a signature block.
 *
 * Drawn as ordinary HTML at A4 width and captured to a PDF, rather than drawn
 * with PDF text commands: the built-in PDF fonts have no rupee sign, and a
 * captured page looks exactly like the preview the user approved.
 *
 * Styles are inline with plain hex colours on purpose. This is a printed page,
 * always black on white whatever theme the app is in.
 */

const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#d1d5db";
const SOFT = "#f3f4f6";

const fmtDate = (v?: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

interface DocProps {
  po: PurchaseOrder;
  vendor?: Vendor;
  org: OrgSettings;
  profile: CompanyProfile;
  projectName?: string;
}

const th: React.CSSProperties = { padding: "6px 6px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: MUTED, textAlign: "left", borderBottom: `1px solid ${LINE}`, background: SOFT };
const td: React.CSSProperties = { padding: "6px 6px", fontSize: 11, color: INK, borderBottom: `1px solid ${LINE}`, verticalAlign: "top" };
const num: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

export const PurchaseOrderDocument = React.forwardRef<HTMLDivElement, DocProps>(({ po, vendor, org, profile, projectName }, ref) => {
  const inter = po.interState === true;
  // Recomputed from the lines so a PO saved before these totals existed still
  // prints correctly; for one saved since, this reproduces what was stored.
  const totals = computePoTotals(po.lineItems || [], po.charges, po.chargesGstRate, inter);
  const hasGst = totals.hasGst;
  const lines = (po.lineItems || []).map((l, i) => ({ ...l, ...totals.lines[i] }));
  const summary = hasGst
    ? hsnSummary([
        ...lines.map((l) => ({ hsn: l.hsn, ...taxOn(l.taxableValue, l.gstRate, inter) })),
        ...(totals.chargesTaxable > 0 ? [{ hsn: "Charges", ...totals.chargesTax }] : []),
      ])
    : [];
  const address = [profile.addressLine1, profile.addressLine2, [profile.city, profile.state].filter(Boolean).join(", "), profile.pincode ? `PIN ${profile.pincode}` : ""].filter(Boolean);
  const buyerState = GST_STATES[stateCodeOf(org.gstin)] || profile.state || "";
  const vendorGstin = po.vendorGSTIN || vendor?.gstin || "";
  const vendorState = GST_STATES[stateCodeOf(vendorGstin)] || "";
  const chargeRows = ([["loading", "Loading charges"], ["transport", "Transport charges"], ["other", "Other charges"]] as const).filter(([k]) => (po.charges?.[k] || 0) > 0);
  const terms = String(profile.poTerms || "").split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
  const company = org.companyName || "Your company";

  return (
    <div ref={ref} style={{ width: 794, minHeight: 1123, background: "#ffffff", color: INK, padding: 40, boxSizing: "border-box", fontFamily: "Inter, 'Noto Sans', 'Segoe UI', Arial, sans-serif", lineHeight: 1.4 }}>
      {/* Letterhead */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, paddingBottom: 16, borderBottom: `2px solid ${INK}` }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", minWidth: 0 }}>
          {profile.logo && <img src={profile.logo} alt="" style={{ maxWidth: 150, maxHeight: 70, objectFit: "contain" }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{company}</div>
            {address.map((a, i) => <div key={i} style={{ fontSize: 10.5, color: MUTED }}>{a}</div>)}
            {(profile.phone || profile.email) && (
              <div style={{ fontSize: 10.5, color: MUTED }}>{[profile.phone && `Phone: ${profile.phone}`, profile.email, profile.website].filter(Boolean).join("  ·  ")}</div>
            )}
            {(org.gstin || profile.pan) && (
              <div style={{ fontSize: 10.5, color: INK, fontWeight: 600, marginTop: 2 }}>{[org.gstin && `GSTIN: ${org.gstin}`, profile.pan && `PAN: ${profile.pan}`].filter(Boolean).join("  ·  ")}</div>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>PURCHASE ORDER</div>
          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>{po.poNumber}</div>
          <div style={{ fontSize: 10.5, color: MUTED }}>Date: {fmtDate(po.orderDate)}</div>
          {po.expectedDeliveryDate && <div style={{ fontSize: 10.5, color: MUTED }}>Delivery by: {fmtDate(po.expectedDeliveryDate)}</div>}
          {po.status === "Draft" && <div style={{ fontSize: 10, fontWeight: 800, color: "#b45309", marginTop: 4 }}>DRAFT · NOT YET APPROVED</div>}
        </div>
      </div>

      {/* Parties */}
      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        <div style={{ flex: 1, border: `1px solid ${LINE}`, borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED }}>Vendor</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{po.vendorName}</div>
          {vendor?.address && <div style={{ fontSize: 10.5, color: MUTED, whiteSpace: "pre-line" }}>{vendor.address}</div>}
          {vendor?.contactPerson && <div style={{ fontSize: 10.5, color: MUTED }}>Attn: {vendor.contactPerson}</div>}
          {(vendor?.phone || vendor?.email) && <div style={{ fontSize: 10.5, color: MUTED }}>{[vendor.phone, vendor.email].filter(Boolean).join("  ·  ")}</div>}
          <div style={{ fontSize: 10.5, fontWeight: 600, marginTop: 2 }}>{vendorGstin ? `GSTIN: ${vendorGstin}${vendorState ? ` (${vendorState})` : ""}` : "GSTIN: not provided"}</div>
        </div>
        <div style={{ flex: 1, border: `1px solid ${LINE}`, borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED }}>Bill to and deliver to</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{company}</div>
          {projectName && <div style={{ fontSize: 10.5, color: INK }}>Project: {projectName}</div>}
          {address.map((a, i) => <div key={i} style={{ fontSize: 10.5, color: MUTED }}>{a}</div>)}
          <div style={{ fontSize: 10.5, fontWeight: 600, marginTop: 2 }}>{org.gstin ? `GSTIN: ${org.gstin}${buyerState ? ` (${buyerState})` : ""}` : "GSTIN: not provided"}</div>
          {hasGst && <div style={{ fontSize: 10.5, color: MUTED }}>Place of supply: {buyerState || "—"}</div>}
        </div>
      </div>

      {/* Lines */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, border: `1px solid ${LINE}` }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 22 }}>#</th>
            <th style={th}>Description</th>
            {hasGst && <th style={th}>HSN/SAC</th>}
            <th style={{ ...th, ...num }}>Qty</th>
            <th style={{ ...th, ...num }}>Rate</th>
            <th style={{ ...th, ...num }}>{hasGst ? "Taxable value" : "Amount"}</th>
            {hasGst && <th style={{ ...th, ...num }}>GST %</th>}
            {hasGst && (inter ? <th style={{ ...th, ...num }}>IGST</th> : <><th style={{ ...th, ...num }}>CGST</th><th style={{ ...th, ...num }}>SGST</th></>)}
            {hasGst && <th style={{ ...th, ...num }}>Total</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td style={td}>{i + 1}</td>
              <td style={td}>{l.name}</td>
              {hasGst && <td style={td}>{l.hsn || "—"}</td>}
              <td style={{ ...td, ...num }}>{l.orderedQty} {l.unit}</td>
              <td style={{ ...td, ...num }}>{money(l.rate)}</td>
              <td style={{ ...td, ...num }}>{money(l.taxableValue)}</td>
              {hasGst && <td style={{ ...td, ...num }}>{l.gstRate ? `${l.gstRate}%` : "—"}</td>}
              {hasGst && (inter ? <td style={{ ...td, ...num }}>{money(l.igst)}</td> : <><td style={{ ...td, ...num }}>{money(l.cgst)}</td><td style={{ ...td, ...num }}>{money(l.sgst)}</td></>)}
              {hasGst && <td style={{ ...td, ...num, fontWeight: 600 }}>{money(l.total)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginTop: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED }}>Order value in words</div>
          <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2 }}>{rupeesInWords(totals.grandTotal)}</div>
          {po.notes && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED }}>Notes</div>
              <div style={{ fontSize: 11, whiteSpace: "pre-line" }}>{po.notes}</div>
            </div>
          )}
        </div>
        <table style={{ width: 290, borderCollapse: "collapse", flexShrink: 0 }}>
          <tbody>
            <tr><td style={{ ...td, borderBottom: "none" }}>{hasGst ? "Material value before tax" : "Material value"}</td><td style={{ ...td, ...num, borderBottom: "none" }}>₹{money(totals.subtotalTaxable)}</td></tr>
            {chargeRows.map(([k, label]) => (
              <tr key={k}><td style={{ ...td, borderBottom: "none" }}>{label}</td><td style={{ ...td, ...num, borderBottom: "none" }}>₹{money(po.charges![k]!)}</td></tr>
            ))}
            {hasGst && totals.chargesTax.tax > 0 && (
              <tr><td style={{ ...td, borderBottom: "none", color: MUTED }}>GST on charges @ {totals.chargesTax.gstRate}%</td><td style={{ ...td, ...num, borderBottom: "none", color: MUTED }}>included below</td></tr>
            )}
            {hasGst && (inter ? (
              <tr><td style={{ ...td, borderBottom: "none" }}>IGST</td><td style={{ ...td, ...num, borderBottom: "none" }}>₹{money(totals.totalIGST)}</td></tr>
            ) : (
              <>
                <tr><td style={{ ...td, borderBottom: "none" }}>CGST</td><td style={{ ...td, ...num, borderBottom: "none" }}>₹{money(totals.totalCGST)}</td></tr>
                <tr><td style={{ ...td, borderBottom: "none" }}>SGST</td><td style={{ ...td, ...num, borderBottom: "none" }}>₹{money(totals.totalSGST)}</td></tr>
              </>
            ))}
            <tr>
              <td style={{ ...td, fontSize: 13, fontWeight: 800, borderTop: `2px solid ${INK}`, borderBottom: `2px solid ${INK}` }}>{hasGst ? "Total including GST" : "Total"}</td>
              <td style={{ ...td, ...num, fontSize: 13, fontWeight: 800, borderTop: `2px solid ${INK}`, borderBottom: `2px solid ${INK}` }}>₹{money(totals.grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Tax summary by HSN */}
      {hasGst && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED, marginBottom: 4 }}>Tax summary by HSN/SAC</div>
          <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${LINE}` }}>
            <thead>
              <tr>
                <th style={th}>HSN/SAC</th>
                <th style={{ ...th, ...num }}>Taxable value</th>
                <th style={{ ...th, ...num }}>Rate</th>
                {inter ? <th style={{ ...th, ...num }}>IGST</th> : <><th style={{ ...th, ...num }}>CGST</th><th style={{ ...th, ...num }}>SGST</th></>}
                <th style={{ ...th, ...num }}>Total tax</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r, i) => (
                <tr key={i}>
                  <td style={td}>{r.hsn}</td>
                  <td style={{ ...td, ...num }}>{money(r.taxableValue)}</td>
                  <td style={{ ...td, ...num }}>{r.gstRate}%</td>
                  {inter ? <td style={{ ...td, ...num }}>{money(r.igst)}</td> : <><td style={{ ...td, ...num }}>{money(r.cgst)}</td><td style={{ ...td, ...num }}>{money(r.sgst)}</td></>}
                  <td style={{ ...td, ...num, fontWeight: 600 }}>{money(r.tax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {terms.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED }}>Terms and conditions</div>
          {/* Numbered by hand: the page capture does not draw list markers. */}
          <div style={{ marginTop: 4 }}>
            {terms.map((t, i) => <div key={i} style={{ fontSize: 10.5 }}>{`${i + 1}. ${t.replace(/^\d+[.)]\s*/, "")}`}</div>)}
          </div>
        </div>
      )}

      {/* Sign-off */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 44 }}>
        <div style={{ fontSize: 10.5, color: MUTED }}>
          <div>Prepared by: {po.createdByName || "—"}</div>
          {po.approvedByName && <div>Approved by: {po.approvedByName}{po.approvedAt ? ` on ${fmtDate(po.approvedAt)}` : ""}</div>}
        </div>
        <div style={{ textAlign: "center", width: 220 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600 }}>For {company}</div>
          <div style={{ height: 44 }} />
          <div style={{ borderTop: `1px solid ${INK}`, fontSize: 10.5, paddingTop: 4 }}>Authorised signatory</div>
        </div>
      </div>
      <div style={{ fontSize: 9, color: MUTED, marginTop: 18, textAlign: "center" }}>
        Please quote the purchase order number {po.poNumber} on your delivery challan and tax invoice.
      </div>
    </div>
  );
});
PurchaseOrderDocument.displayName = "PurchaseOrderDocument";

/** Capture a rendered document node to an A4 PDF, splitting long ones over pages. */
async function nodeToPdf(node: HTMLElement): Promise<jsPDF> {
  const canvas = await html2canvas(node, { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff", windowWidth: 900 });
  const pdf = new jsPDF("p", "mm", "a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  // Canvas pixels that fit one page at this width.
  const slicePx = Math.floor((canvas.width * pageH) / pageW);
  let y = 0;
  let first = true;
  while (y < canvas.height) {
    const h = Math.min(slicePx, canvas.height - y);
    // A sliver of white at the very end is not worth a page of its own.
    if (!first && h < 12) break;
    const part = document.createElement("canvas");
    part.width = canvas.width;
    part.height = h;
    const ctx = part.getContext("2d");
    if (!ctx) throw new Error("Couldn't build the PDF in this browser.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, part.width, part.height);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (!first) pdf.addPage();
    pdf.addImage(part.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pageW, (h * pageW) / canvas.width);
    first = false;
    y += h;
  }
  return pdf;
}

/** Preview of the PO as it will be sent, with Download and Print. */
export const PurchaseOrderPreview: React.FC<DocProps & { onClose: () => void }> = ({ onClose, ...docProps }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"pdf" | "print" | null>(null);
  const missing = [
    !docProps.profile.addressLine1 && "your company address",
    !docProps.profile.logo && "your logo",
    !docProps.org.gstin && "your GSTIN",
  ].filter(Boolean) as string[];

  const run = async (mode: "pdf" | "print") => {
    if (!ref.current) return;
    setBusy(mode);
    try {
      const pdf = await nodeToPdf(ref.current);
      if (mode === "pdf") {
        pdf.save(`${docProps.po.poNumber}.pdf`);
      } else {
        pdf.autoPrint();
        const w = window.open(pdf.output("bloburl"), "_blank");
        if (!w) toast.info("Your browser blocked the print window. Download the PDF and print that instead.");
      }
    } catch (e) {
      console.error("PO PDF failed", e);
      toast.error("Couldn't create the PDF. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-[60] flex flex-col items-center p-3 sm:p-6 overflow-hidden">
      <DialogBehaviour />
      <div className="w-full max-w-[860px] flex items-center justify-between gap-3 mb-3 flex-wrap">
        <p className="text-white text-sm font-bold">{`${docProps.po.poNumber} · as it will be sent`}</p>
        <div className="flex items-center gap-2">
          <button onClick={() => run("print")} disabled={!!busy} className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-divider rounded-lg text-ink text-xs font-bold disabled:opacity-60">
            {busy === "print" ? <CircleNotch className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} {"Print"}
          </button>
          <button onClick={() => run("pdf")} disabled={!!busy} className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary-deep text-on-primary rounded-lg text-xs font-bold disabled:opacity-60">
            {busy === "pdf" ? <CircleNotch className="w-4 h-4 animate-spin" /> : <DownloadSimple className="w-4 h-4" />} {"Download PDF"}
          </button>
          <button aria-label="Close" onClick={onClose} className="p-2 bg-white hover:bg-divider rounded-full text-ink">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      {missing.length > 0 && (
        <p className="w-full max-w-[860px] mb-3 text-xs font-semibold text-ink bg-white rounded-lg px-3 py-2">
          {`This purchase order is missing ${missing.join(", ")}. An Owner or Admin can add ${missing.length === 1 ? "it" : "them"} in Settings → Default Organization.`}
        </p>
      )}
      <div className="flex-1 w-full overflow-auto">
        <div className="mx-auto shadow-2xl" style={{ width: 794 }}>
          <PurchaseOrderDocument ref={ref} {...docProps} />
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrderPreview;
