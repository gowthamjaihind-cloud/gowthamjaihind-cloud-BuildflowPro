// SERVER COPY of src/lib/poTax.ts -- keep identical below this header;
// src/lib/poTaxParity.test.ts fails if the two drift apart.

/**
 * GST on a purchase order.
 *
 * Rates on a PO are entered WITHOUT tax. Each line carries an HSN/SAC code and
 * a GST rate; the tax is worked out per line and shown split the way an Indian
 * tax document must show it:
 *
 *   - buyer and vendor in the SAME state  -> CGST + SGST, half the rate each
 *   - in DIFFERENT states                 -> IGST, the whole rate
 *
 * The state is the first two digits of a GSTIN. If either side's GSTIN is
 * missing the supply is treated as within the state (the common case for a
 * local supplier) and `stateKnown` is false, so the screen can say that the
 * split is an assumption rather than present it as fact.
 *
 * Pure, so the form, the PO screen, the PDF and the goods receipt all compute
 * the same figures from the same function.
 */

export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28] as const;

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100 + Number.EPSILON) / 100;

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** A syntactically valid GSTIN (15 characters). Empty is not valid. */
export function isValidGstin(gstin: unknown): boolean {
  return typeof gstin === "string" && GSTIN_RE.test(gstin.trim().toUpperCase());
}

/** The two-digit GST state code a GSTIN begins with, or "" when unusable. */
export function stateCodeOf(gstin: unknown): string {
  const g = typeof gstin === "string" ? gstin.trim().toUpperCase() : "";
  return /^[0-9]{2}/.test(g) && g.length >= 2 ? g.slice(0, 2) : "";
}

export const GST_STATES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
  "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya",
  "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa",
  "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands",
  "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};

export interface SupplyKind {
  /** True when buyer and vendor are in different states: IGST applies. */
  interState: boolean;
  /** False when a GSTIN was missing and "same state" was assumed. */
  stateKnown: boolean;
}

export function supplyKind(buyerGstin: unknown, vendorGstin: unknown): SupplyKind {
  const b = stateCodeOf(buyerGstin), v = stateCodeOf(vendorGstin);
  if (!b || !v) return { interState: false, stateKnown: false };
  return { interState: b !== v, stateKnown: true };
}

export interface TaxSplit {
  taxableValue: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  total: number;
}

/** Tax on one taxable amount at one rate. */
export function taxOn(taxableValue: number, gstRate: number, interState: boolean): TaxSplit {
  const taxable = round2(taxableValue);
  const rate = Number(gstRate) > 0 && Number.isFinite(Number(gstRate)) ? Number(gstRate) : 0;
  if (interState) {
    const igst = round2((taxable * rate) / 100);
    return { taxableValue: taxable, gstRate: rate, cgst: 0, sgst: 0, igst, tax: igst, total: round2(taxable + igst) };
  }
  // Each half is rounded on its own, as it is printed: CGST and SGST must be
  // equal, and their sum is the tax (which can differ by a paisa from rounding
  // the whole).
  const half = round2((taxable * rate) / 200);
  return { taxableValue: taxable, gstRate: rate, cgst: half, sgst: half, igst: 0, tax: round2(half * 2), total: round2(taxable + half * 2) };
}

export interface PoTaxLineIn {
  orderedQty: number;
  rate: number;
  gstRate?: number;
}

export interface PoTotals {
  lines: TaxSplit[];
  /** Material value before tax. */
  subtotalTaxable: number;
  /** Loading + transport + other, before tax. */
  chargesTaxable: number;
  chargesTax: TaxSplit;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  totalTax: number;
  /** What the vendor is owed for the whole order: value + charges + tax. */
  grandTotal: number;
  /** True when any tax is charged: the PO is a GST document. */
  hasGst: boolean;
}

export function computePoTotals(
  lines: PoTaxLineIn[],
  charges: { loading?: number; transport?: number; other?: number } | undefined,
  chargesGstRate: number | undefined,
  interState: boolean,
): PoTotals {
  const split = lines.map((l) => taxOn((Number(l.orderedQty) || 0) * (Number(l.rate) || 0), Number(l.gstRate) || 0, interState));
  const chargesTaxable = round2((Number(charges?.loading) || 0) + (Number(charges?.transport) || 0) + (Number(charges?.other) || 0));
  const chargesTax = taxOn(chargesTaxable, Number(chargesGstRate) || 0, interState);
  const sum = (f: (t: TaxSplit) => number) => round2(split.reduce((n, t) => n + f(t), 0) + f(chargesTax));
  const subtotalTaxable = round2(split.reduce((n, t) => n + t.taxableValue, 0));
  const totalCGST = sum((t) => t.cgst), totalSGST = sum((t) => t.sgst), totalIGST = sum((t) => t.igst);
  const totalTax = round2(totalCGST + totalSGST + totalIGST);
  return {
    lines: split, subtotalTaxable, chargesTaxable, chargesTax, totalCGST, totalSGST, totalIGST, totalTax,
    grandTotal: round2(subtotalTaxable + chargesTaxable + totalTax),
    hasGst: totalTax > 0,
  };
}

/**
 * The tax summary a GST document prints under its lines: one row per HSN code
 * and rate, so the reader can check the tax without adding the lines up.
 */
export function hsnSummary(
  lines: Array<{ hsn?: string; taxableValue: number; gstRate: number; cgst: number; sgst: number; igst: number }>,
): Array<{ hsn: string; gstRate: number; taxableValue: number; cgst: number; sgst: number; igst: number; tax: number }> {
  const map = new Map<string, { hsn: string; gstRate: number; taxableValue: number; cgst: number; sgst: number; igst: number; tax: number }>();
  for (const l of lines) {
    const hsn = String(l.hsn || "").trim() || "—";
    const key = `${hsn}|${l.gstRate}`;
    const row = map.get(key) || { hsn, gstRate: l.gstRate, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, tax: 0 };
    row.taxableValue = round2(row.taxableValue + l.taxableValue);
    row.cgst = round2(row.cgst + l.cgst);
    row.sgst = round2(row.sgst + l.sgst);
    row.igst = round2(row.igst + l.igst);
    row.tax = round2(row.cgst + row.sgst + row.igst);
    map.set(key, row);
  }
  return [...map.values()];
}

/** An HSN (goods) or SAC (services) code: 4, 6 or 8 digits. Empty is allowed. */
export function isValidHsn(hsn: unknown): boolean {
  const h = String(hsn ?? "").trim();
  return h === "" || /^[0-9]{4}([0-9]{2}){0,2}$/.test(h);
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const below100 = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`);
const below1000 = (n: number) => (n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? " " + below100(n % 100) : ""}` : below100(n));

/** "Rupees One Lakh Two Thousand and Fifty Paise Only", the Indian way. */
export function rupeesInWords(amount: number): string {
  const v = round2(Math.abs(Number(amount) || 0));
  let rupees = Math.floor(v);
  const paise = Math.round((v - rupees) * 100);
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10000000); rupees %= 10000000;
  const lakh = Math.floor(rupees / 100000); rupees %= 100000;
  const thousand = Math.floor(rupees / 1000); rupees %= 1000;
  if (crore) parts.push(`${crore >= 1000 ? rupeesInWords(crore).replace(/^Rupees | Only$/g, "") : below1000(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rupees) parts.push(below1000(rupees));
  const r = parts.join(" ") || "Zero";
  return `Rupees ${r}${paise ? ` and ${below100(paise)} Paise` : ""} Only`;
}
