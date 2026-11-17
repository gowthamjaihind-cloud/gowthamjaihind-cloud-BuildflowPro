/**
 * Facts for answering questions about a project ("how much cement is left?",
 * "which POs are pending?"), worked out from the data the same way the app's
 * screens do. The model only phrases them; it is given nothing else. Pure.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Stock on hand as the Inventory screen shows it: received minus consumed, never below 0. */
export function stockFacts(items: any[], onlyIds: string[] = []) {
  const pick = onlyIds.length ? items.filter((i) => onlyIds.includes(i.id)) : items;
  return pick.slice(0, 60).map((i) => {
    const onHand = Math.max(0, r2((Number(i.quantity) || 0) - (Number(i.consumed) || 0)));
    const min = Number(i.minThreshold) || 0;
    return { material: String(i.name || ""), onHand, unit: String(i.unit || ""), received: r2(Number(i.quantity) || 0), used: r2(Number(i.consumed) || 0), ...(min ? { low: onHand <= min, minimum: min } : {}) };
  });
}

/** Purchase orders still open (not Closed), newest first, with what is still to arrive. */
export function orderFacts(pos: any[]) {
  return pos
    .filter((p) => p && p.status !== "Closed")
    .sort((a, b) => String(b.orderDate || "").localeCompare(String(a.orderDate || "")))
    .slice(0, 20)
    .map((p) => ({
      po: String(p.poNumber || ""),
      vendor: String(p.vendorName || ""),
      status: String(p.status || ""),
      ordered: String(p.orderDate || ""),
      expected: String(p.expectedDeliveryDate || ""),
      total: r2(Number(p.totalAmount) || 0),
      pending: (Array.isArray(p.lineItems) ? p.lineItems : [])
        .map((l: any) => ({ item: String(l.name || ""), left: r2(Math.max(0, (Number(l.orderedQty) || 0) - (Number(l.receivedQty) || 0))), unit: String(l.unit || "") }))
        .filter((l: any) => l.left > 0),
    }));
}
