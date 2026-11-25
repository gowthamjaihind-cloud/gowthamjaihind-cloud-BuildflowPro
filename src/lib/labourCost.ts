/**
 * Labour cost, one set of rules for every screen that shows it.
 *
 *  - A rate card is a rate per head per Shift / Day / Hour; a daily log's
 *    labour line costs head count x rate (the wages).
 *  - A labour contractor may charge a margin on their bill (their profit, e.g.
 *    10%): `contractorMarginPct` on the contractor (suppliers/{id}). Cost is
 *    wages + margin. 0 when not set, so nothing changes until it is.
 *  - A rate card can instead be a LUMP SUM (unit "Lumpsum"), never per head.
 *    Two kinds:
 *      - VARIABLE (`variable: true`, every lump sum created now): the card only
 *        names the work and the contractor. Each daily log that uses it says
 *        how much that day's work cost (`amount` on the labour line), because
 *        a contractor's lump sums vary job to job. The card itself costs
 *        nothing.
 *      - FIXED (older cards, no `variable`): `rate` = the amount, `date` =
 *        when it counts. Counted once, on its own, and not offered in daily
 *        logs, so a figure already recorded does not change.
 *    The contractor's margin applies to both: the margin is on their bill.
 *
 * Pure, so it is unit-tested.
 */

export const LUMP_SUM_UNIT = "Lumpsum";

const paise = (n: number) => Math.round(n * 100) / 100;

interface Card { id?: string; vendorId?: string; rate?: number; unit?: string; role?: string; date?: string; variable?: boolean }
interface Contractor { id: string; contractorMarginPct?: number }

export const isLumpSum = (card: Card | undefined | null) => card?.unit === LUMP_SUM_UNIT;
/** A lump sum whose amount is entered in each daily log. */
export const isVariableLumpSum = (card: Card | undefined | null) => isLumpSum(card) && card?.variable === true;
/** Rate cards a daily log can use: per-head cards and variable lump sums. */
export const usableInDailyLog = (card: Card | undefined | null) => !!card && (!isLumpSum(card) || isVariableLumpSum(card));

/** The contractor's margin in percent (0-100). */
export function marginPctOf(vendorId: string | undefined, vendors: Contractor[] | undefined): number {
  const v = (vendors || []).find((x) => x.id === vendorId);
  const m = Number(v?.contractorMarginPct);
  return Number.isFinite(m) && m > 0 ? Math.min(m, 100) : 0;
}

/** Wages per head for one shift/day/hour; 0 for a lump sum (it is not per head). */
export const wageRate = (card: Card | undefined | null) => (card && !isLumpSum(card) ? Number(card.rate) || 0 : 0);

/**
 * Wages of one daily-log labour line, before margin: head count x rate, or,
 * for a variable lump sum, the amount entered on the line.
 */
export function labourLineWages(headcount: number, card: Card | undefined | null, amount?: number): number {
  if (isVariableLumpSum(card)) return Math.max(0, Number(amount) || 0);
  return (Number(headcount) || 0) * wageRate(card);
}

/** Cost of one daily-log labour line, margin included. */
export function labourLineCost(headcount: number, card: Card | undefined | null, vendors: Contractor[] | undefined, amount?: number): number {
  const wages = labourLineWages(headcount, card, amount);
  return paise(wages * (1 + marginPctOf(card?.vendorId, vendors) / 100));
}

/** Fixed lump-sum rate cards, each with its cost (margin included). Variable ones cost through daily logs. */
export function lumpSums(cards: Card[] | undefined, vendors: Contractor[] | undefined) {
  return (cards || []).filter((c) => isLumpSum(c) && !isVariableLumpSum(c)).map((c) => {
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
