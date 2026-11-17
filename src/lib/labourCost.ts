/**
 * Labour cost, one set of rules for every screen that shows it.
 *
 *  - A rate card is a rate per head per Shift / Day / Hour; a daily log's
 *    labour line costs head count x rate (the wages).
 *  - A labour contractor may charge a margin on their bill (their profit, e.g.
 *    10%): `contractorMarginPct` on the contractor (suppliers/{id}). Cost is
 *    wages + margin. 0 when not set, so nothing changes until it is.
 *  - A rate card can instead be a LUMP SUM: just an amount (unit "Lumpsum",
 *    `rate` = the amount, `role` = what it is for, `date` = when it counts).
 *    It is counted once, never per head, and is never offered in daily logs.
 *    The contractor's margin applies to it too: the margin is on their bill.
 *
 * Pure, so it is unit-tested.
 */

export const LUMP_SUM_UNIT = "Lumpsum";

const paise = (n: number) => Math.round(n * 100) / 100;

interface Card { id?: string; vendorId?: string; rate?: number; unit?: string; role?: string; date?: string }
interface Contractor { id: string; contractorMarginPct?: number }

export const isLumpSum = (card: Card | undefined | null) => card?.unit === LUMP_SUM_UNIT;

/** The contractor's margin in percent (0-100). */
export function marginPctOf(vendorId: string | undefined, vendors: Contractor[] | undefined): number {
  const v = (vendors || []).find((x) => x.id === vendorId);
  const m = Number(v?.contractorMarginPct);
  return Number.isFinite(m) && m > 0 ? Math.min(m, 100) : 0;
}

/** Wages per head for one shift/day/hour; 0 for a lump sum (it is not per head). */
export const wageRate = (card: Card | undefined | null) => (card && !isLumpSum(card) ? Number(card.rate) || 0 : 0);

/** Cost of one daily-log labour line, margin included. */
export function labourLineCost(headcount: number, card: Card | undefined | null, vendors: Contractor[] | undefined): number {
  const wages = (Number(headcount) || 0) * wageRate(card);
  return paise(wages * (1 + marginPctOf(card?.vendorId, vendors) / 100));
}

/** Lump-sum rate cards, each with its cost (margin included). */
export function lumpSums(cards: Card[] | undefined, vendors: Contractor[] | undefined) {
  return (cards || []).filter(isLumpSum).map((c) => {
    const amount = Number(c.rate) || 0;
    return { id: String(c.id || ""), vendorId: String(c.vendorId || ""), description: String(c.role || "Lump sum"), date: String(c.date || ""), amount, cost: paise(amount * (1 + marginPctOf(c.vendorId, vendors) / 100)) };
  });
}

/** A contractor's bill: wages and lump sums, plus their margin. */
export function contractorBill(wages: number, lumpSum: number, marginPct: number) {
  const base = (Number(wages) || 0) + (Number(lumpSum) || 0);
  const margin = Math.round(base * (Number(marginPct) || 0)) / 100;
  return { wages: Number(wages) || 0, lumpSum: Number(lumpSum) || 0, marginPct: Number(marginPct) || 0, margin, total: Math.round((base + margin) * 100) / 100 };
}
