/**
 * Stock intake arithmetic for the goods-receipt trigger. Pure, so it is tested
 * without the Admin SDK.
 *
 * inventory.quantity is TOTAL INTAKE: opening stock plus everything accepted
 * on goods receipts. Consumption is tracked separately (inventory.consumed,
 * maintained by the daily-log trigger) and the app shows quantity - consumed.
 *
 * The trigger used to write quantity = sum of accepted receipts ONLY, so the
 * first goods receipt for an item erased its opening stock: 1,000 kg of steel
 * entered when the item was created became 300 kg after a 300 kg delivery. The
 * opening figure is now kept in its own field and always added back.
 */

export interface IntakeInput {
  /** inventory.openingQty, if this item has one recorded. */
  openingQty: unknown;
  /** inventory.quantity as currently stored. */
  currentQuantity: unknown;
  /** inventory.consumed as currently stored. */
  consumed: unknown;
  /** inventory.unitCost: the rate opening stock is valued at. */
  unitCost: unknown;
  /** Accepted qty across ALL receipts for this item, after this write. */
  acceptedQty: number;
  /** Accepted qty x PO rate across all receipts, after this write. */
  acceptedSpend: number;
  /** Accepted qty across all receipts BEFORE this write. */
  acceptedBefore: number;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Opening stock for an item.
 *
 * Recorded items return their recorded value. An item from before the field
 * existed has it inferred ONCE, and only when no receipt has touched it yet:
 * the app used to subtract each daily log's consumption from quantity in the
 * browser, so quantity + consumed is what was originally entered. If a receipt
 * already ran, the old trigger has overwritten quantity and the opening figure
 * is gone -- 0 is the honest answer, and Reconciliation can restore it.
 */
export function openingQtyFor(i: IntakeInput): number {
  if (typeof i.openingQty === "number" && Number.isFinite(i.openingQty)) return i.openingQty;
  if (i.acceptedBefore > 0) return 0;
  return Math.max(0, num(i.currentQuantity) + num(i.consumed));
}

/** Total intake and its weighted average cost. */
export function intake(i: IntakeInput): { openingQty: number; quantity: number; avgUnitCost: number } {
  const openingQty = openingQtyFor(i);
  const quantity = openingQty + i.acceptedQty;
  const value = Math.max(0, openingQty) * num(i.unitCost) + i.acceptedSpend;
  const basis = Math.max(0, openingQty) + i.acceptedQty;
  return { openingQty, quantity, avgUnitCost: basis > 0 ? value / basis : num(i.unitCost) };
}
