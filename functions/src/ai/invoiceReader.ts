import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { db } from "../db";
import { chargeAiUsage } from "./usage";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest", "gemini-1.5-flash"];

const projPath = (orgId?: string, projectId?: string) =>
  orgId ? `organizations/${orgId}/projects/${projectId}` : `projects/${projectId}`;

const norm = (s: any) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Callable wrapper used by the web app's Scan Invoice flow.
export const extractVendorInvoice = onCall(
  { secrets: [GEMINI_API_KEY], timeoutSeconds: 120, memory: "512MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    const { orgId, projectId, fileBase64, mimeType } = request.data || {};
    if (!projectId || !fileBase64 || !mimeType) {
      throw new HttpsError("invalid-argument", "Missing file or project.");
    }
    return await readAndMatchInvoice(fileBase64, mimeType, orgId, projectId, GEMINI_API_KEY.value());
  }
);

// Core reader + matcher — shared by the callable above and the Telegram photo
// handler. Reads a GST invoice (image/PDF base64) with Gemini vision, then
// matches it to the project's vendors and open POs and flags discrepancies.
// Returns a draft VendorBill + flags — nothing is written.
export async function readAndMatchInvoice(
  fileBase64: string,
  mimeType: string,
  orgId: string | undefined,
  projectId: string,
  key: string,
) {
  const base = projPath(orgId, projectId);

  // Meter this AI action against the org's monthly quota (throws if exceeded).
  await chargeAiUsage(orgId, "invoice_scan");

  let companyState = "";
  let companyGstin = "";
  if (orgId) {
    const org = await db.doc(`organizations/${orgId}`).get();
    companyGstin = org.exists ? org.data()!.gstin || "" : "";
    companyState = org.exists ? org.data()!.stateCode || companyGstin.slice(0, 2) : "";
  }

  const raw = await callGeminiVision(fileBase64, mimeType, key);

  // ---- match vendor ----
  const vendorsSnap = await db.collection(`${base}/suppliers`).get();
  const vendors = vendorsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const exVendorName = norm(raw.vendorName);
  const exGstin = String(raw.vendorGSTIN || "").toUpperCase();
  const vendor =
    (exGstin && vendors.find((v) => String(v.gstin || "").toUpperCase() === exGstin)) ||
    vendors.find((v) => norm(v.name) === exVendorName) ||
    vendors.find((v) => exVendorName && (norm(v.name).includes(exVendorName) || exVendorName.includes(norm(v.name))));

  const flags: string[] = [];
  if (!vendor) flags.push(`Vendor "${raw.vendorName || "?"}" not found — pick it manually.`);

  // ---- match PO (open POs for this vendor) ----
  const posSnap = await db.collection(`${base}/purchase_orders`).get();
  const openPOs = posSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((p) => p.status === "Approved" || p.status === "Partially Received");

  const exPoNumber = norm(raw.poNumber);
  let po = (exPoNumber && openPOs.find((p) => norm(p.poNumber) === exPoNumber)) || undefined;
  if (!po && vendor) {
    const vpos = openPOs.filter((p) => p.vendorId === vendor!.id);
    po = vpos.map((p) => ({ p, score: overlapScore(p, raw.lineItems || []) })).sort((a, b) => b.score - a.score)[0]?.p;
  }
  if (!po) flags.push("No matching open PO found — this reader is PO-backed; pick a PO or enter manually.");

  const sameState = !!(companyState && exGstin && companyState === exGstin.slice(0, 2));

  // Map invoice lines to PO lines across differing nomenclature: try the AI
  // semantic mapper first (bridges "TMT BAR 8MM" vs "8MM TMT Fe500"), then fall
  // back to offline token matching if the AI call fails or leaves gaps.
  const lineMap: Record<number, string> = {};
  if (po) {
    try {
      Object.assign(lineMap, await matchInvoiceLinesToPO(raw.lineItems || [], po.lineItems || [], key));
    } catch { /* fall back to token matching below */ }
  }

  const lineItems = (raw.lineItems || []).map((li: any, index: number) => {
    const taxable = round2(Number(li.taxableValue) || (Number(li.qty) || 0) * (Number(li.rate) || 0));
    const gstRate = Number(li.gstRate) || 0;
    const taxAmt = round2((taxable * gstRate) / 100);
    let cgst = Number(li.cgst) || 0, sgst = Number(li.sgst) || 0, igst = Number(li.igst) || 0;
    if (!cgst && !sgst && !igst && taxAmt) {
      if (sameState) { cgst = round2(taxAmt / 2); sgst = round2(taxAmt / 2); }
      else { igst = taxAmt; }
    }
    const mappedId = lineMap[index];
    const poLine = po && (
      (mappedId && (po.lineItems || []).find((pl: any) => pl.itemId === mappedId)) ||
      (po.lineItems || []).find((pl: any) => tokenMatch(pl.name, li.name))
    );
    if (poLine) {
      const remaining = (Number(poLine.orderedQty) || 0) - (Number(poLine.receivedQty) || 0);
      if (Number(li.qty) > remaining + 0.001) flags.push(`"${li.name}": invoice qty ${li.qty} exceeds remaining ordered ${remaining}.`);
      if (poLine.rate && Math.abs(Number(li.rate) - poLine.rate) / poLine.rate > 0.05) {
        const dir = Number(li.rate) < poLine.rate ? "below" : "above";
        flags.push(`"${li.name}": invoice rate ₹${li.rate} is ${dir} PO rate ₹${poLine.rate}.`);
      }
    } else if (po) {
      flags.push(`"${li.name}" is not on the PO.`);
    }
    return {
      // Matched to a defined PO/inventory line: carry the group material code so
      // the goods receipt + inventory update tie to the already-defined material.
      poLineRef: poLine ? poLine.itemId : undefined,
      materialId: poLine ? (poLine.materialId || poLine.itemId) : undefined,
      name: String(li.name || "Item"),
      hsn: li.hsn ? String(li.hsn) : undefined,
      qty: Number(li.qty) || 0,
      unit: String(li.unit || poLine?.unit || ""),
      rate: Number(li.rate) || 0,
      taxableValue: taxable,
      gstRate,
      cgst, sgst, igst,
      lineTotal: round2(taxable + cgst + sgst + igst),
    };
  });

  if (vendor && exGstin && vendor.gstin && String(vendor.gstin).toUpperCase() !== exGstin)
    flags.push("Invoice GSTIN doesn't match the vendor's saved GSTIN.");

  const subtotalTaxable = round2(sum(lineItems.map((l: any) => l.taxableValue)));
  const totalCGST = round2(sum(lineItems.map((l: any) => l.cgst)));
  const totalSGST = round2(sum(lineItems.map((l: any) => l.sgst)));
  const totalIGST = round2(sum(lineItems.map((l: any) => l.igst)));
  const charges = raw.charges && typeof raw.charges === "object" ? {
    loading: Number(raw.charges.loading) || undefined,
    transport: Number(raw.charges.transport) || undefined,
    other: Number(raw.charges.other) || undefined,
  } : undefined;
  const chargesTotal = (charges?.loading || 0) + (charges?.transport || 0) + (charges?.other || 0);
  const computedTotal = round2(subtotalTaxable + totalCGST + totalSGST + totalIGST + chargesTotal);
  const grandTotal = round2(Number(raw.grandTotal) || computedTotal);
  const roundOff = round2(grandTotal - computedTotal);
  const matchStatus = !po ? "Unlinked" : flags.length ? "Has Discrepancies" : "Fully Matched";

  return {
    bill: {
      vendorId: vendor?.id || "",
      vendorName: vendor?.name || raw.vendorName || "",
      vendorGSTIN: exGstin || undefined,
      invoiceNumber: String(raw.invoiceNumber || ""),
      invoiceDate: String(raw.invoiceDate || ""),
      poId: po?.id || undefined,
      poNumber: po?.poNumber || undefined,
      lineItems,
      charges,
      subtotalTaxable,
      totalCGST, totalSGST, totalIGST,
      roundOff: roundOff || undefined,
      grandTotal,
      taxMode: "gst-itemized",
      matchStatus,
    },
    flags,
    confidence: Number(raw.confidence) || 0.8,
    candidatePOs: openPOs.map((p) => ({ id: p.id, poNumber: p.poNumber, vendorId: p.vendorId })),
  };
}

function overlapScore(po: any, lines: any[]): number {
  let s = 0;
  for (const li of lines) {
    if ((po.lineItems || []).some((pl: any) => tokenMatch(pl.name, li.name))) s++;
  }
  return s;
}

// Offline fuzzy fallback: match on shared tokens, treating size/spec tokens
// (8mm, 10mm, fe500, m20 …) as strong signals. Handles word-order and extra
// descriptors ("TMT BAR 8MM" vs "8MM TMT Fe500") without an AI call.
function tokenize(s: string): string[] {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}
const isSpecToken = (t: string) => /\d/.test(t); // e.g. 8mm, 10, fe500, m20
export function tokenMatch(a: string, b: string): boolean {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size || !B.size) return false;
  const shared = [...A].filter((t) => B.has(t));
  if (shared.length === 0) return false;
  // Every spec token present in BOTH names must agree (don't match 8mm with 10mm).
  const specsA = [...A].filter(isSpecToken);
  const specsB = [...B].filter(isSpecToken);
  if (specsA.length && specsB.length) {
    const specShared = specsA.filter((t) => B.has(t));
    if (specShared.length === 0) return false; // sizes differ → not the same item
  }
  // Otherwise require a decent word overlap relative to the shorter name.
  const ratio = shared.length / Math.min(A.size, B.size);
  return ratio >= 0.5 || shared.some(isSpecToken);
}

// AI line matcher: maps invoice lines to PO lines by meaning (material + size),
// bridging different firms' nomenclature. Text-only, so it's cheap/fast.
async function matchInvoiceLinesToPO(
  invLines: any[],
  poLines: any[],
  key: string,
): Promise<Record<number, string>> {
  if (!invLines.length || !poLines.length) return {};
  const prompt = `Two lists of construction material line items: one from a vendor INVOICE, one from a purchase ORDER. Different firms name the same material differently (word order, extra words, abbreviations, brand vs spec). Map each INVOICE line to the ORDER line that is the SAME material — match on material type + size/grade (e.g. "8 mm", "Fe500"), ignoring wording. Only map when confident it's the same item; otherwise null. NEVER match different sizes (8mm vs 10mm).

Return ONLY a JSON array, one entry per invoice line:
[{ "invoiceIndex": number, "poItemId": string | null }]

INVOICE lines: ${JSON.stringify(invLines.map((l, i) => ({ index: i, name: l.name, unit: l.unit })))}
ORDER lines: ${JSON.stringify(poLines.map((p: any) => ({ id: p.itemId, name: p.name, unit: p.unit })))}`;

  const parsed = await callGeminiJSON(prompt, key);
  const arr = Array.isArray(parsed) ? parsed : parsed?.matches || [];
  const out: Record<number, string> = {};
  for (const e of arr) {
    if (e && typeof e.invoiceIndex === "number" && e.poItemId) out[e.invoiceIndex] = String(e.poItemId);
  }
  return out;
}

async function callGeminiJSON(prompt: string, key: string): Promise<any> {
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  };
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch { continue; }
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`gemini ${res.status}`);
    const data: any = await res.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) continue;
    try { return JSON.parse(text); } catch {
      const m = text.match(/[[{][\s\S]*[\]}]/);
      if (m) return JSON.parse(m[0]);
    }
  }
  throw new Error("no model for line match");
}

const sum = (a: number[]) => a.reduce((x, y) => x + (y || 0), 0);
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

async function callGeminiVision(fileBase64: string, mimeType: string, key: string): Promise<any> {
  const prompt = `You are reading an Indian GST vendor invoice (tax invoice). Extract its contents to JSON. Read only what is printed; if a value is absent leave it 0 or "". Return ONLY this JSON:
{
  "vendorName": string,
  "vendorGSTIN": string,
  "invoiceNumber": string,
  "invoiceDate": string (YYYY-MM-DD if possible),
  "poNumber": string (if the invoice references a PO/order number, else ""),
  "lineItems": [{"name": string, "hsn": string, "qty": number, "unit": string, "rate": number (ex-GST per-unit), "taxableValue": number, "gstRate": number (percent), "cgst": number, "sgst": number, "igst": number}],
  "charges": {"loading": number, "transport": number, "other": number},
  "grandTotal": number (final payable incl. all tax),
  "confidence": number (0-1, your confidence in the extraction)
}`;
  const body = {
    contents: [{
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: fileBase64 } },
      ],
    }],
    generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
  };

  let lastErr = "no models tried";
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) { lastErr = `network ${e}`; continue; }
    if (res.status === 404) { lastErr = `model ${model} unavailable`; continue; }
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      throw new HttpsError("internal", `AI service error (${res.status}): ${b.slice(0, 200)}`);
    }
    const data: any = await res.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) { lastErr = `empty from ${model}`; continue; }
    try { return JSON.parse(text); }
    catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      lastErr = "unparseable";
    }
  }
  throw new HttpsError("internal", `Could not read the invoice (${lastErr}).`);
}
