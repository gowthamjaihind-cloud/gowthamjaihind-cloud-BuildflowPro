/**
 * The decision half of org claim minting, kept free of any import so it can
 * be tested without the Admin SDK.
 *
 * The security property worth pinning: an org that appears only in the user's
 * own `users/{uid}.orgIds` mirror — which firestore.rules lets that user write
 * — must never reach the claim. Only membership recorded on the organisation
 * itself counts. Get this wrong and a user can hand themselves read access to
 * another tenant's drawings, invoices and site photos, which is precisely the
 * hole the claim exists to close.
 */

/** Candidate org ids from the client-writable mirror. Untrusted. */
export function candidateOrgIds(
  mirror: unknown,
  currentOrgId: unknown,
  max = 50,
): string[] {
  const list = Array.isArray(mirror) ? mirror : [];
  return Array.from(
    new Set(
      [...list, currentOrgId].filter(
        (x): x is string => typeof x === "string" && x.length > 0,
      ),
    ),
  ).slice(0, max);
}

/**
 * Keep only the candidates the organisation itself vouches for.
 * `memberRole` is whatever `organizations/{orgId}.members[uid]` held: any
 * truthy role means membership, and the role itself is enforced elsewhere.
 */
export function verifyOrgIds(
  candidates: string[],
  memberRole: (orgId: string) => unknown,
): string[] {
  return candidates.filter((orgId) => Boolean(memberRole(orgId))).sort();
}

/** Claims only reach a client on token refresh, so callers need to know. */
export function claimsChanged(before: unknown, after: string[]): boolean {
  const prev = Array.isArray(before)
    ? [...before].filter((x): x is string => typeof x === "string").sort()
    : [];
  return prev.length !== after.length || prev.some((x, i) => x !== after[i]);
}
