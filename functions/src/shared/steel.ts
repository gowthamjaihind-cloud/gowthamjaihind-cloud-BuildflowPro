/**
 * Steel bars ordered by count ("12mm 150 nos") turned into the weight they are
 * bought by. The AI only reads the size and the count; the weight is this
 * arithmetic, so it is never guessed:
 *
 *   kg per metre = d² / 162      (d in mm; the standard IS 1786 figure)
 *   weight       = nos × 12 m × d² / 162, rounded to the nearest 10 kg
 *
 * 12 m is the standard TMT bar length. Pure, so it is unit-tested.
 */

export const BAR_LENGTH_M = 12;
export const BAR_SIZES_MM = [6, 8, 10, 12, 16, 20, 25, 28, 32, 36, 40];
const ROUND_TO_KG = 10;

export const kgPerMetre = (d: number) => (d * d) / 162;

/** The bar size in a material's name ("TMT Bar 12mm Fe500" -> 12), else null. */
export function barDiameter(name: string): number | null {
  const m = String(name || "").toLowerCase().match(/(\d{1,2})\s*(mm|m\.m\.)/);
  const d = m ? Number(m[1]) : NaN;
  return BAR_SIZES_MM.includes(d) ? d : null;
}

/** A reinforcement bar with a known size: TMT, rebar, tor steel, Fe500, steel rod/bar. */
export function isRebar(name: string): boolean {
  const n = String(name || "").toLowerCase();
  if (/binding|wire|mesh|angle|channel|plate|sheet|pipe|tube/.test(n)) return false;
  return /\b(tmt|rebar|tor|fe\s?\d{3}d?|kambi)\b|steel\s*(rod|bar)|\b(rod|bar)s?\b/.test(n) && barDiameter(n) !== null;
}

/** "kg" or "t" when the material is stocked by weight, else null. */
export function weightUnit(unit: string): "kg" | "t" | null {
  const u = String(unit || "").toLowerCase().replace(/[^a-z]/g, "");
  if (["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"].includes(u)) return "kg";
  if (["mt", "t", "ton", "tons", "tonne", "tonnes", "metricton", "metrictonne"].includes(u)) return "t";
  return null;
}

/**
 * Bars to the material's own unit. null when the material is not a sized bar
 * stocked by weight (then the count is used as it is).
 */
export function barsToStockUnit(materialName: string, unit: string, nos: number): { qty: number; kg: number; working: string } | null {
  const d = barDiameter(materialName);
  const wu = weightUnit(unit);
  if (!isRebar(materialName) || d === null || !wu || !(nos > 0)) return null;
  const exact = nos * BAR_LENGTH_M * kgPerMetre(d);
  const kg = Math.max(ROUND_TO_KG, Math.round(exact / ROUND_TO_KG) * ROUND_TO_KG);
  const qty = wu === "kg" ? kg : kg / 1000;
  const perM = kgPerMetre(d).toFixed(3).replace(/0+$/, "");
  const working = `${d}mm: ${nos} nos × ${BAR_LENGTH_M} m × ${perM} kg/m = ${kg.toLocaleString("en-IN")} kg${wu === "t" ? ` (${qty} t)` : ""}`;
  return { qty, kg, working };
}
