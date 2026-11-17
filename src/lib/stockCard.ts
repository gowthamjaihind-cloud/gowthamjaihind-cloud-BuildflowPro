/**
 * The stock card of one material: every receipt into stock and every use out
 * of it, oldest first, with a running balance, and the receipts that look like
 * the same delivery entered twice.
 *
 *   in   goods receipts (goodsReceiptNotes lines whose poLineRef is this
 *        inventory item), made by hand or by posting a scanned bill
 *   in   opening / manual stock: what the item's quantity holds beyond its
 *        receipts (typed in Inventory, or from before receipts were recorded)
 *   out  materials used in daily logs (the same figure as "consumed")
 *
 * A receipt is flagged as a possible double entry when another one from the
 * same vendor has the same challan / invoice number, or the same quantity
 * within 3 days. Flagged, not removed: two genuine deliveries can look alike.
 * Pure, so it is unit-tested.
 */

export interface Movement {
  id: string;
  date: string;          // YYYY-MM-DD ("" when unknown)
  kind: "in" | "out" | "opening";
  qty: number;
  rate?: number;
  party: string;         // vendor (in), task (out)
  ref: string;           // GRN · PO · challan/invoice (in)
  by: string;
  via?: string;          // "Bill", "Telegram" … how the receipt was made
  grnId?: string;
  balance: number;
  duplicateOf?: string;  // the other receipt's GRN number
}

const day = (v: any): string => {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toISOString().slice(0, 10);
  return "";
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const daysApart = (a: string, b: string) => (a && b ? Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000 : Infinity);
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function stockCard(
  item: { id: string; quantity?: number; consumed?: number; createdAt?: any },
  grns: any[],
  dailyLogs: any[],
  taskName: (taskId: string) => string = () => "",
) {
  const ins: Movement[] = [];
  for (const g of grns || []) {
    for (const [k, l] of (g.lineItems || []).entries()) {
      if (l.poLineRef !== item.id) continue;
      const qty = Number(l.acceptedQty ?? l.receivedQty) || 0;
      if (!qty) continue;
      ins.push({
        id: `${g.id}-${k}`, date: day(g.receiptDate) || day(g.createdAt), kind: "in", qty, rate: Number(l.rate) || undefined,
        party: String(g.vendorName || ""),
        ref: [g.grnNumber, g.poNumber, g.challanNumber ? `Challan/Inv ${g.challanNumber}` : ""].filter(Boolean).join(" · "),
        by: String(g.createdByName || ""), via: g.billId ? (g.createdVia === "telegram" ? "Bill via bot" : "Bill") : "Goods receipt",
        grnId: g.id, balance: 0,
      });
    }
  }

  // Possible double entries among receipts.
  for (let i = 0; i < ins.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = ins[i], b = ins[j];
      if (a.grnId === b.grnId || norm(a.party) !== norm(b.party)) continue;
      const ga = grns.find((g) => g.id === a.grnId), gb = grns.find((g) => g.id === b.grnId);
      const sameChallan = !!norm(ga?.challanNumber) && norm(ga?.challanNumber) === norm(gb?.challanNumber);
      const sameQtySoon = Math.abs(a.qty - b.qty) < 0.001 && daysApart(a.date, b.date) <= 3;
      if (sameChallan || sameQtySoon) {
        a.duplicateOf = String(gb?.grnNumber || "another receipt");
        b.duplicateOf = b.duplicateOf || String(ga?.grnNumber || "another receipt");
      }
    }
  }

  const outs: Movement[] = [];
  for (const log of dailyLogs || []) {
    for (const [k, m] of (log.materials || []).entries()) {
      if (m.materialId !== item.id) continue;
      const qty = Number(m.quantity) || 0;
      if (!qty) continue;
      outs.push({ id: `${log.id}-${k}`, date: day(log.workDate) || day(log.createdAt), kind: "out", qty, party: taskName(log.taskId) || "", ref: "Daily log", by: String(log.createdByName || ""), balance: 0 });
    }
  }

  // "consumed" beyond what the daily logs itemise (entered in Inventory, or
  // from logs since removed): one line, so the balance ends at the real stock.
  const fromLogs = r3(outs.reduce((a, m) => a + m.qty, 0));
  const unitemised = r3((Number(item.consumed) || 0) - fromLogs);
  if (unitemised > 0.0005) outs.push({ id: "unitemised", date: "", kind: "out", qty: unitemised, party: "Used, not from a daily log", ref: "Consumption entered in Inventory", by: "", balance: 0 });

  const received = r3(ins.reduce((a, m) => a + m.qty, 0));
  const opening = r3((Number(item.quantity) || 0) - received);
  const rows: Movement[] = [];
  if (opening > 0.0005) rows.push({ id: "opening", date: "", kind: "opening", qty: opening, party: "", ref: "Opening stock / entered in Inventory", by: "", balance: 0 });
  rows.push(...[...ins, ...outs].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || (a.kind === "in" ? -1 : 1)));
  let bal = 0;
  for (const r of rows) {
    bal = r3(bal + (r.kind === "out" ? -r.qty : r.qty));
    r.balance = bal;
  }
  const used = r3(outs.reduce((a, m) => a + m.qty, 0));
  return {
    rows,
    received,
    opening: Math.max(0, opening),
    used,
    inStock: r3((Number(item.quantity) || 0) - (Number(item.consumed) || 0)),
    duplicates: ins.filter((m) => m.duplicateOf).length,
    // Receipts add up to more than the item's quantity: a receipt was undone or the quantity edited.
    mismatch: opening < -0.0005 ? r3(-opening) : 0,
  };
}
