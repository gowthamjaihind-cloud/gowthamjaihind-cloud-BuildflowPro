/**
 * The goods-receipt lines a scanned bill makes against its PO, and whether it
 * would receive more than is still outstanding. The same rules as the app's
 * Review & Post (src/services/invoiceReceiptService.ts), so a bill posted from
 * the bot and one posted in the app produce the same records. Pure.
 */

export interface ReceiptLine {
  poLineRef: string; materialId: string; name: string; orderedQty: number;
  receivedQty: number; acceptedQty: number; rejectedQty: number; unit: string; rate: number;
}

export function receiptFor(bill: any, po: any): { lines: ReceiptLine[]; over: string[]; notOnPo: string[] } {
  const poLines: any[] = po?.lineItems || [];
  const lines: ReceiptLine[] = (bill?.lineItems || [])
    .filter((l: any) => l.poLineRef)
    .map((l: any) => {
      const p = poLines.find((x) => x.itemId === l.poLineRef);
      return {
        poLineRef: String(l.poLineRef),
        materialId: String(l.materialId || p?.materialId || l.poLineRef),
        name: String(l.name || p?.name || "Item"),
        orderedQty: Number(p?.orderedQty) || 0,
        receivedQty: Number(l.qty) || 0,
        acceptedQty: Number(l.qty) || 0,
        rejectedQty: 0,
        unit: String(l.unit || p?.unit || ""),
        rate: Number(l.rate) || 0, // before tax: drives inventory valuation
      };
    });
  const over: string[] = [];
  for (const g of lines) {
    const p = poLines.find((x) => x.itemId === g.poLineRef);
    if (!p) continue;
    const remaining = (Number(p.orderedQty) || 0) - (Number(p.receivedQty) || 0);
    if (g.acceptedQty > remaining + 0.001) over.push(`${g.name}: ${g.acceptedQty} but only ${Math.max(0, remaining)} remain on ${po.poNumber}.`);
  }
  const notOnPo = (bill?.lineItems || []).filter((l: any) => !l.poLineRef).map((l: any) => String(l.name || "Item"));
  return { lines, over, notOnPo };
}
