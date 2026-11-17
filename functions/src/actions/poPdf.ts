import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { computePoTotals, supplyKind, rupeesInWords, hsnSummary, GST_STATES, stateCodeOf } from "../shared/poTax";

/**
 * A purchase order as a one-or-more page A4 PDF, drawn on the server so the
 * bot can send it into the chat: a DRAFT PREVIEW before Confirm, and the
 * real PO (with its number) after. Laid out like the app's printable PO
 * (PurchaseOrderDocument.tsx): letterhead, vendor, lines with HSN and GST,
 * totals, amount in words, terms. The standard PDF fonts have no rupee sign,
 * so amounts read "Rs."; everything else is the same.
 */

export interface PoPdfInput {
  draft: boolean;
  poNumber?: string;
  /** "Draft" prints "DRAFT · NOT YET APPROVED" under the number, as the app does. */
  status?: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  notes?: string;
  company: { name: string; gstin?: string; addressLine1?: string; addressLine2?: string; city?: string; state?: string; pincode?: string; phone?: string; email?: string; pan?: string; logo?: string; poTerms?: string };
  vendor: { name: string; gstin?: string; address?: string; phone?: string };
  projectName: string;
  items: { name: string; hsn?: string; unit: string; orderedQty: number; rate: number; gstRate?: number }[];
}

const A4 = { w: 595.28, h: 841.89 };
const M = 40;
const ink = rgb(0.1, 0.12, 0.16);
const muted = rgb(0.42, 0.45, 0.5);
const line = rgb(0.85, 0.87, 0.9);
const rs = (n: number) => `Rs. ${(Math.round(n * 100) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** The standard fonts are WinAnsi only: anything else (Tamil, the rupee sign, emoji) would throw. */
const safe = (s: unknown) => String(s ?? "").replace(/₹/g, "Rs.").replace(/[^\n\x20-\x7E\u00A0-\u00FF]/g, "?");
const day = (d?: string) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "");

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of safe(text).split("\n")) {
    let cur = "";
    for (const w of para.split(/\s+/)) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width && cur) {
        out.push(cur);
        cur = w;
      } else cur = next;
    }
    out.push(cur);
  }
  return out;
}

export async function renderPoPdf(i: PoPdfInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${i.draft ? "Draft " : ""}Purchase Order ${i.poNumber || ""}`.trim());
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const text = (s: string, x: number, size = 9, f = font, color = ink) => page.drawText(safe(s), { x, y, size, font: f, color });
  const right = (s: string, xr: number, size = 9, f = font, color = ink) => page.drawText(safe(s), { x: xr - f.widthOfTextAtSize(safe(s), size), y, size, font: f, color });
  const rule = () => page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.6, color: line });
  const need = (h: number) => {
    if (y - h < M + 20) {
      page = pdf.addPage([A4.w, A4.h]);
      y = A4.h - M;
      if (i.draft) watermark(page);
    }
  };
  const watermark = (p: PDFPage) => p.drawText("DRAFT PREVIEW", { x: 120, y: 330, size: 64, font: bold, color: rgb(0.85, 0.2, 0.2), opacity: 0.12, rotate: { type: "degrees" as any, angle: 35 } as any });
  if (i.draft) watermark(page);

  // Letterhead.
  let logoW = 0;
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(i.company.logo || "");
  if (m) {
    try {
      const img = m[1].toLowerCase() === "png" ? await pdf.embedPng(Buffer.from(m[2], "base64")) : await pdf.embedJpg(Buffer.from(m[2], "base64"));
      const s = img.scaleToFit(70, 50);
      page.drawImage(img, { x: M, y: y - s.height + 10, width: s.width, height: s.height });
      logoW = s.width + 12;
    } catch {
      /* a logo that will not embed is left out */
    }
  }
  text(i.company.name, M + logoW, 15, bold);
  y -= 14;
  const addr = [i.company.addressLine1, i.company.addressLine2, [i.company.city, i.company.state, i.company.pincode].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  for (const l of wrap(addr, font, 8, 300)) { text(l, M + logoW, 8, font, muted); y -= 10; }
  const ids = [i.company.gstin ? `GSTIN ${i.company.gstin}` : "", i.company.pan ? `PAN ${i.company.pan}` : "", i.company.phone || "", i.company.email || ""].filter(Boolean).join("  ·  ");
  if (ids) { text(ids, M + logoW, 8, font, muted); y -= 10; }
  y = Math.min(y, A4.h - M - 52);
  y -= 8;
  rule();
  y -= 20;
  text(i.draft ? "PURCHASE ORDER (DRAFT PREVIEW)" : "PURCHASE ORDER", M, 13, bold);
  right(i.poNumber ? i.poNumber : "Number given on Confirm", A4.w - M, 10, bold);
  y -= 14;
  text(`Project: ${i.projectName}`, M, 9, font, muted);
  right(`Date: ${day(i.orderDate)}${i.expectedDeliveryDate ? `   Delivery by: ${day(i.expectedDeliveryDate)}` : ""}`, A4.w - M, 9, font, muted);
  if (!i.draft && i.status === "Draft") {
    y -= 12;
    right("DRAFT · NOT YET APPROVED", A4.w - M, 8, bold, rgb(0.71, 0.33, 0.04));
  }
  y -= 22;

  // Vendor.
  text("VENDOR", M, 8, bold, muted);
  y -= 12;
  text(i.vendor.name, M, 10, bold);
  y -= 12;
  for (const l of wrap([i.vendor.address, i.vendor.phone].filter(Boolean).join("  ·  "), font, 8, 340)) { if (l) { text(l, M, 8, font, muted); y -= 10; } }
  const supply = supplyKind(i.company.gstin, i.vendor.gstin);
  text(i.vendor.gstin ? `GSTIN ${i.vendor.gstin} (${GST_STATES[stateCodeOf(i.vendor.gstin)] || "state ?"})` : "GSTIN not given", M, 8, font, muted);
  y -= 10;
  text(supply.interState ? "Inter-state supply: IGST" : "Intra-state supply: CGST + SGST", M, 8, font, muted);
  y -= 18;

  // Lines.
  const t = computePoTotals(i.items, {}, 0, supply.interState);
  const col = { no: M, item: M + 20, hsn: M + 220, qty: M + 300, rate: M + 380, gst: M + 430, amt: A4.w - M };
  const head = () => {
    page.drawRectangle({ x: M, y: y - 4, width: A4.w - 2 * M, height: 16, color: rgb(0.95, 0.96, 0.97) });
    y += 1;
    text("#", col.no + 2, 8, bold); text("Item", col.item, 8, bold); text("HSN", col.hsn, 8, bold);
    right("Qty", col.rate - 10, 8, bold); right("Rate", col.gst - 6, 8, bold); right("GST", col.gst + 30, 8, bold); right("Amount", col.amt - 2, 8, bold);
    y -= 17;
  };
  head();
  i.items.forEach((it, k) => {
    const nameLines = wrap(it.name, font, 9, 190);
    need(12 * nameLines.length + 6);
    text(String(k + 1), col.no + 2);
    nameLines.forEach((nl, j) => { page.drawText(nl, { x: col.item, y: y - j * 11, size: 9, font, color: ink }); });
    text(it.hsn || "-", col.hsn);
    right(`${it.orderedQty} ${it.unit}`, col.rate - 10);
    right(rs(it.rate).replace("Rs. ", ""), col.gst - 6);
    right(`${it.gstRate || 0}%`, col.gst + 30);
    right(rs(t.lines[k].total).replace("Rs. ", ""), col.amt - 2);
    y -= 11 * nameLines.length + 5;
    rule();
    y -= 10;
  });

  // Totals.
  need(110);
  const row = (label: string, value: string, b = false) => { right(label, col.amt - 110, 9, b ? bold : font, b ? ink : muted); right(value, col.amt - 2, 9, b ? bold : font); y -= 13; };
  row("Taxable value", rs(t.subtotalTaxable));
  if (supply.interState) row("IGST", rs(t.totalIGST));
  else { row("CGST", rs(t.totalCGST)); row("SGST", rs(t.totalSGST)); }
  row("Total", rs(t.grandTotal), true);
  y -= 4;
  for (const l of wrap(`Amount in words: ${rupeesInWords(t.grandTotal)}`, font, 8, A4.w - 2 * M)) { text(l, M, 8, font, muted); y -= 10; }

  // HSN summary, only when there is tax.
  if (t.hasGst) {
    const sum = hsnSummary(i.items.map((it, k) => ({ hsn: it.hsn, ...t.lines[k] })));
    need(30 + sum.length * 12);
    y -= 8;
    text("Tax by HSN", M, 8, bold, muted);
    y -= 12;
    for (const h of sum) { text(`${h.hsn || "-"}  @ ${h.gstRate}%   taxable ${rs(h.taxableValue)}   tax ${rs(h.tax)}`, M, 8, font, muted); y -= 11; }
  }

  // Notes and terms.
  for (const [title, body] of [["Notes", i.notes], ["Terms", i.company.poTerms]] as const) {
    if (!body) continue;
    const ls = wrap(body, font, 8, A4.w - 2 * M);
    need(20 + ls.length * 10);
    y -= 8;
    text(title, M, 8, bold, muted);
    y -= 11;
    for (const l of ls) { text(l, M, 8); y -= 10; }
  }
  need(50);
  y -= 30;
  right(`For ${i.company.name}`, A4.w - M, 9, bold);
  y -= 26;
  right("Authorised signatory", A4.w - M, 8, font, muted);
  return Buffer.from(await pdf.save());
}
