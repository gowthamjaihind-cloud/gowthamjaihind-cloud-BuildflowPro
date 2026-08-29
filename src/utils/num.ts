// Number helpers for money, rates and quantities.
//
// Averages and weighted costs are computed by dividing a total by a quantity,
// which produces values like 64.2936862546795. Stored and shown raw, those
// leak float noise into the UI and into records that customers read as money.
// Round where the value is produced, and format where it is displayed.

/** Round a money or rate value to 2 decimals. */
export const round2 = (n: unknown): number => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
};

/** Round a quantity to 3 decimals — enough for MT/Cum without float noise. */
export const round3 = (n: unknown): number => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 1000) / 1000;
};

/**
 * Money for display: grouped, always 2 decimals. Use for rates and amounts a
 * customer reads as currency.
 */
export const money = (n: unknown): string =>
  round2(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Money for display without forced decimals — whole rupees stay clean, and
 * anything with paise shows exactly two. Use for totals in dense tables.
 */
export const moneyCompact = (n: unknown): string => {
  const v = round2(n);
  // Whole rupees stay clean, but a value with paise shows BOTH decimals:
  // "3,36,33,362.2" is not a money string, and a lone decimal reads as a
  // different number.
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: v % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
};

/** Quantity for display: up to 3 decimals, no trailing zeros forced. */
export const qty = (n: unknown): string =>
  round3(n).toLocaleString("en-IN", { maximumFractionDigits: 3 });

/**
 * Short money for tight spaces: lakh / crore notation, the way the figure is
 * actually said. A grouped rupee value like ₹53,95,183 is ten characters and
 * does not fit a summary tile.
 */
export const moneyShort = (n: unknown): string => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}${round2(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}${round2(abs / 1e5)}L`;
  // Below a lakh there is no spoken short form -- "1.23K" is not how the
  // amount is said -- so fall back to grouped rupees.
  return moneyCompact(v);
};
