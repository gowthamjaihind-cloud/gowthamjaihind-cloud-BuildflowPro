import { tokenMatch } from "../shared/lineMatch";

/**
 * A payment receipt (bank transfer advice, UPI / NEFT / RTGS / IMPS
 * screenshot, cheque) read from a photo: who paid whom decides what it is.
 *
 *   our company paid      -> a payment TO a vendor (the payee)
 *   our company was paid  -> a payment received FROM the client
 *   neither is us         -> a vendor payment if the payee is one of this
 *                            project's vendors, else we cannot tell
 *
 * Pure, so it is unit-tested.
 */

export interface ReadPayment {
  amount: number; date: string; payerName: string; payeeName: string;
  reference: string; mode: string;
}

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function sameParty(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  if (x.length < 3 || y.length < 3) return false;
  return x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x))) || tokenMatch(a, b);
}

export type Direction =
  | { kind: "vendor"; vendorId: string; vendorName: string }
  | { kind: "vendorUnknown"; payeeName: string }
  | { kind: "client" }
  | { kind: "unknown" };

export function paymentDirection(p: ReadPayment, companyName: string, vendors: { id: string; name: string }[]): Direction {
  const payeeIsUs = !!companyName && sameParty(p.payeeName, companyName);
  const payerIsUs = !!companyName && sameParty(p.payerName, companyName);
  if (payeeIsUs && !payerIsUs) return { kind: "client" };
  const v = vendors.find((x) => norm(x.name) === norm(p.payeeName)) || vendors.find((x) => sameParty(x.name, p.payeeName));
  if (v) return { kind: "vendor", vendorId: v.id, vendorName: v.name };
  if (payerIsUs) return { kind: "vendorUnknown", payeeName: p.payeeName };
  return { kind: "unknown" };
}

/** The app's payment methods, from what the receipt says. */
export function methodOf(mode: string): "UPI" | "Bank Transfer" | "Cheque" | "Cash" {
  const m = String(mode || "").toLowerCase();
  if (/upi|gpay|google\s*pay|phonepe|paytm|bhim/.test(m)) return "UPI";
  if (/cheque|check|chq/.test(m)) return "Cheque";
  if (/cash/.test(m)) return "Cash";
  return "Bank Transfer";
}

/** The read payment, cleaned; null when there is no amount. */
export function cleanPayment(raw: any, today: string): ReadPayment | null {
  // The first number in it: "Rs. 1,44,970.00" -> 144970.
  const num = String(raw?.amount ?? "").match(/\d[\d,]*(\.\d+)?/);
  const amount = num ? Math.round(Number(num[0].replace(/,/g, "")) * 100) / 100 : 0;
  if (!(amount > 0)) return null;
  const d = String(raw?.date || "");
  const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  return {
    amount,
    date: /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today ? d : today,
    payerName: clip(raw?.payerName, 100), payeeName: clip(raw?.payeeName, 100),
    reference: clip(raw?.reference, 60), mode: clip(raw?.mode, 30),
  };
}
