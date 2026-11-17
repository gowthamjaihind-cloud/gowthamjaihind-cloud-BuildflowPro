// SERVER COPY of src/lib/hsnTable.ts -- keep identical below this header;
// src/lib/hsnTable.test.ts fails if the two drift apart.

/**
 * HSN codes and GST rates for common building materials, checked by hand.
 *
 * Used before any AI suggestion: a material whose name matches here gets this
 * HSN and rate, marked "from Sitetru's list"; anything else may get an AI
 * suggestion, marked "please check". GST rates change (cement went from 28% to
 * 18% on 22 Sep 2025), so this list carries the date it was last checked and
 * only holds items whose code and rate are not in doubt.
 *
 * Order matters: the first match wins, so specific items ("binding wire")
 * come before general ones ("wire").
 */

export const TAX_LIST_CHECKED = "2025-09-22";

export interface TaxEntry { hsn: string; gstRate: number; label: string }

const LIST: { test: RegExp; entry: TaxEntry }[] = [
  { test: /\bbinding\s*wire\b/, entry: { hsn: "7217", gstRate: 18, label: "Binding wire" } },
  { test: /\bwire\s*rods?\b/, entry: { hsn: "7213", gstRate: 18, label: "Steel wire rod" } },
  { test: /\b(ismb|ismc|isa|joists?)\b|\b(ms|steel)\s*(angles?|channels?|beams?|flats?)\b/, entry: { hsn: "7216", gstRate: 18, label: "Structural steel sections" } },
  { test: /\b(tmt|rebars?|tor\s*steel|fe\s?\d{3}d?)\b|\bsteel\s*(rods?|bars?)\b/, entry: { hsn: "7214", gstRate: 18, label: "TMT / reinforcement bars" } },
  { test: /\b(rmc|ready\s*-?\s*mix(ed)?\s*concrete)\b/, entry: { hsn: "3824", gstRate: 18, label: "Ready-mix concrete" } },
  { test: /\bcement\s*(paint|board|sheets?|blocks?|bricks?|primer|putty)\b/, entry: { hsn: "", gstRate: -1, label: "" } },
  { test: /\b(opc|ppc|psc)\b|\bcement\b/, entry: { hsn: "2523", gstRate: 18, label: "Cement" } },
  { test: /\b(m|p)\s*-?\s*sand\b|\bcrushed\s*sand\b/, entry: { hsn: "2517", gstRate: 5, label: "Manufactured sand" } },
  { test: /\bsand\b/, entry: { hsn: "2505", gstRate: 5, label: "Natural sand" } },
  { test: /\b(aggregates?|jelly|jalli|blue\s*metal|gravel)\b/, entry: { hsn: "2517", gstRate: 5, label: "Stone aggregate" } },
  { test: /\b(paints?|emulsion|enamel|distemper)\b/, entry: { hsn: "3209", gstRate: 18, label: "Paint" } },
  { test: /\b(vitrified|ceramic)\b.*\btiles?\b|\b(floor|wall)\s*tiles?\b/, entry: { hsn: "6907", gstRate: 18, label: "Ceramic / vitrified tiles" } },
  { test: /\b(u?pvc|cpvc)\b.*\b(pipes?|fittings?|elbows?|tees?)\b/, entry: { hsn: "3917", gstRate: 18, label: "Plastic pipes and fittings" } },
  { test: /\b(electrical|copper|frls?)\s*(wires?|cables?)\b|\bcables?\b/, entry: { hsn: "8544", gstRate: 18, label: "Electrical wire / cable" } },
  { test: /\b(plywood|ply)\b/, entry: { hsn: "4412", gstRate: 18, label: "Plywood" } },
  { test: /\b(wash\s*basins?|ewc|water\s*closets?|commodes?|urinals?)\b/, entry: { hsn: "6910", gstRate: 18, label: "Ceramic sanitaryware" } },
];

/** The checked HSN and GST rate for a material's name, or null when it is not on the list. */
export function lookupTax(name: string): TaxEntry | null {
  const n = String(name || "").toLowerCase();
  for (const { test, entry } of LIST) {
    if (test.test(n)) return entry.hsn ? entry : null; // an empty entry means "not this, and not sure"
  }
  return null;
}
