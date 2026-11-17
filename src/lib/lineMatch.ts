/**
 * Linking a scanned bill's lines to a purchase order's lines.
 *
 * The server matches lines when it reads the bill, but only against the PO it
 * picked itself. When the bill came back "Unlinked" and the user chose the PO
 * by hand, the lines were left pointing at nothing, posting failed with "No
 * invoice lines matched the PO", and the goods receipt was never created.
 * `relinkToPo` re-runs the match against the chosen PO.
 *
 * `tokenMatch` is the server's fuzzy matcher (functions/src/ai/invoiceReader.ts):
 * shared words, with sizes such as 8mm / fe500 / m20 required to agree.
 */

// "12 mm" and "12mm" are the same size: join a number to its unit first.
const tokenize = (s: string): string[] =>
  String(s || "")
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*(mm|kg|mt|cm|m|sqft|cft)\b/g, "$1$2")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
const isSpecToken = (t: string) => /\d/.test(t);

export function tokenMatch(a: string, b: string): boolean {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size || !B.size) return false;
  const shared = [...A].filter((t) => B.has(t));
  if (shared.length === 0) return false;
  const specsA = [...A].filter(isSpecToken);
  const specsB = [...B].filter(isSpecToken);
  if (specsA.length && specsB.length && !specsA.some((t) => B.has(t))) return false;
  return shared.length / Math.min(A.size, B.size) >= 0.5 || shared.some(isSpecToken);
}

interface BillLine { name: string; unit?: string; poLineRef?: string; materialId?: string }
interface PoLine { itemId: string; name: string; unit?: string; materialId?: string }

/** Link one bill line to a PO line (or unlink it with null). */
export function linkLine<L extends BillLine>(line: L, poLine: PoLine | null): L {
  if (!poLine) return { ...line, poLineRef: undefined, materialId: undefined };
  return { ...line, poLineRef: poLine.itemId, materialId: poLine.materialId || poLine.itemId, unit: line.unit || poLine.unit || "" };
}

/** Re-match every line against the chosen PO; each PO line is used at most once. */
export function relinkToPo<L extends BillLine>(lines: L[], poLines: PoLine[]): L[] {
  const used = new Set<string>();
  // Keep links that are already to this PO's lines.
  const kept = lines.map((l) => {
    const p = poLines.find((x) => x.itemId === l.poLineRef);
    if (p) used.add(p.itemId);
    return p || null;
  });
  return lines.map((l, i) => {
    if (kept[i]) return linkLine(l, kept[i]);
    const p = poLines.find((x) => !used.has(x.itemId) && tokenMatch(x.name, l.name));
    if (p) used.add(p.itemId);
    return linkLine(l, p || null);
  });
}
