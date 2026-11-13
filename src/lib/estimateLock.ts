/**
 * What may still change on an estimate once the client has approved it.
 *
 * An approved estimate is the agreed contract. It used to stay fully editable:
 * changing one rate moved the total from 4,61,380 to 3,84,681 while the status
 * still read "Approved", so the document no longer matched what was agreed and
 * nothing recorded that it had moved. After approval the base contract is
 * frozen; scope changes go in as CHANGE ORDER lines, which the summary already
 * totals separately.
 */
export const APPROVED = "Approved";

export const LOCKED_MESSAGE =
  "This estimate is approved, so its base contract is locked. Add a change order line for any change in scope.";

export const isApproved = (estimate: { status?: string } | null | undefined) => estimate?.status === APPROVED;

/** May this line be edited or removed? Base-contract lines of an approved estimate may not. */
export function canEditLine(estimate: { status?: string } | null | undefined, line: { isChangeOrder?: boolean } | undefined): boolean {
  if (!isApproved(estimate)) return true;
  return Boolean(line?.isChangeOrder);
}

/** May the tax rate change? It moves the agreed total, so not after approval. */
export const canEditTax = (estimate: { status?: string } | null | undefined) => !isApproved(estimate);
