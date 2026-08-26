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
export const moneyCompact = (n: unknown): string =>
  round2(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** Quantity for display: up to 3 decimals, no trailing zeros forced. */
export const qty = (n: unknown): string =>
  round3(n).toLocaleString("en-IN", { maximumFractionDigits: 3 });
