import { useEffect, useState } from "react";
import { callGetCheckoutTaxRate } from "../services/firebaseFunctions";

/**
 * The GST rate checkout will actually charge, for pricing copy.
 *
 * Every surface that quotes a price needs this, so the call is made ONCE per
 * page load and shared: four or five components each firing their own callable
 * on mount is a measurable cost on a plan whose whole point is a small bill.
 *
 * Returns 0 until the answer arrives, and 0 if the call fails. That is the
 * safe default in both directions: copy that promises no tax while the server
 * charges none is correct, and a network blip must never invent a surcharge in
 * the customer's head. The line simply appears once the rate is known.
 */
let cached: Promise<number> | null = null;

function fetchRate(): Promise<number> {
  if (!cached) {
    cached = callGetCheckoutTaxRate()
      .then((r) => (Number.isFinite(r?.ratePct) && r.ratePct > 0 ? r.ratePct : 0))
      .catch(() => 0);
  }
  return cached;
}

/** Test seam: forget the cached answer. */
export function resetTaxRateCache() {
  cached = null;
}

export function useTaxRate(): number {
  const [rate, setRate] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchRate().then((r) => { if (alive) setRate(r); });
    return () => { alive = false; };
  }, []);
  return rate;
}

/**
 * The one sentence every pricing surface appends, or "" when no tax is charged.
 * Keeping the wording in one place is what stops the five call sites drifting
 * apart again.
 */
export function gstNote(ratePct: number): string {
  // `> 0` alone is not enough: Infinity passes it and renders "Infinity%", and
  // a string "18" passes it too. Anything that is not a finite positive number
  // means no tax is being charged, so the line must not appear at all.
  const rate = Number(ratePct);
  if (typeof ratePct !== "number" || !Number.isFinite(rate) || rate <= 0) return "";
  return ` Prices exclusive of GST — ${rate}% is added at checkout.`;
}
