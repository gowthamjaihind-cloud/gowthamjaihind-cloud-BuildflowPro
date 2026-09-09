import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { db, FIRESTORE_DATABASE_ID } from "./db";
import { candidateOrgIds, verifyOrgIds, claimsChanged } from "./claimsPolicy";
import { CALLABLE_OPTS } from "./callable";

/**
 * Org membership, minted into the ID token as a custom claim.
 *
 * Why this has to exist: Cloud Storage rules cannot read Firestore. Every
 * other tenancy check in this product reads `organizations/{orgId}.members`,
 * but storage.rules has no way to, so until now it could only ask "is this
 * caller signed in at all" — meaning any signed-in user could read another
 * organisation's drawings, invoices and site photos if they knew the path.
 * A claim is the only thing that travels into a Storage rule.
 *
 * SECURITY, and the thing that makes this subtle: the claim is built from
 * `organizations/{orgId}.members[uid]`, never from `users/{uid}.orgIds`.
 * That mirror looks like the convenient source, but firestore.rules allows
 * `update` on a user's own document, so `orgIds` is attacker-controlled. A
 * user could append someone else's orgId to their own profile, ask for a
 * claim sync, and be handed read access to that tenant's files — building the
 * exact hole this is meant to close. The mirror is used only to decide which
 * orgs to *check*; membership is then confirmed against the org itself.
 */

export interface OrgClaims {
  orgIds: string[];
}

/** Read the mirror for candidates, then confirm each against the org. */
async function verifiedOrgIds(uid: string): Promise<string[]> {
  const userSnap = await db.doc(`users/${uid}`).get();
  const data = (userSnap.exists ? userSnap.data() : {}) as Record<string, unknown>;
  const candidates = candidateOrgIds(data.orgIds, data.currentOrgId);

  const roles = await Promise.all(
    candidates.map(async (orgId) => {
      const org = await db.doc(`organizations/${orgId}`).get();
      return (org.exists ? (org.data() as any)?.members?.[uid] : undefined) as unknown;
    }),
  );
  const roleOf = new Map(candidates.map((id, i) => [id, roles[i]]));
  return verifyOrgIds(candidates, (id) => roleOf.get(id));
}

/**
 * Bring a user's claims in line with their real membership.
 *
 * Returns whether anything changed, because a claim only reaches the client
 * after its ID token is refreshed — the caller needs to know to force one.
 * Safe to call on every sign-in: when nothing has changed it writes nothing.
 */
export async function syncOrgClaims(
  uid: string,
): Promise<{ orgIds: string[]; changed: boolean }> {
  const orgIds = await verifiedOrgIds(uid);
  const user = await getAuth().getUser(uid);
  const existing = (user.customClaims ?? {}) as Partial<OrgClaims>;

  if (!claimsChanged(existing.orgIds, orgIds)) return { orgIds, changed: false };

  // Merge rather than replace: other claims may be set elsewhere later, and
  // setCustomUserClaims overwrites the whole object.
  await getAuth().setCustomUserClaims(uid, { ...existing, orgIds });
  return { orgIds, changed: true };
}

/** Never let a claim sync fail the operation that triggered it. */
export async function syncOrgClaimsQuietly(uid: string): Promise<void> {
  try {
    await syncOrgClaims(uid);
  } catch (e) {
    console.error(`claim sync failed for ${uid}`, e);
  }
}

/**
 * Called by the client on sign-in. This is what backfills every account that
 * predates claims — there is no migration script, because a user who never
 * signs in again does not need one, and one who does gets it on arrival.
 */
export const syncMyClaims = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const { orgIds, changed } = await syncOrgClaims(request.auth.uid);
  return { orgIds, changed };
});

/**
 * Propagate membership changes without waiting for the affected user to
 * appear. An Admin can edit the members map straight from the client
 * (firestore.rules: `isMemberOfThisOrg() && isAdminOrManager()`), so removal
 * would otherwise leave the removed user's claim — and their access to that
 * tenant's files — valid until their token next refreshed, up to an hour.
 *
 * NOTE the explicit `database`. This project stores its data in a NAMED
 * Firestore database, and a v2 trigger with no `database` option binds to
 * "(default)" instead, where it would never fire. The triggers in dailyLogs
 * and telegram omit it and are worth checking for the same reason.
 */
export const onOrgMembersChanged = onDocumentWritten(
  {
    document: "organizations/{orgId}",
    database: FIRESTORE_DATABASE_ID,
  },
  async (event) => {
    const before = (event.data?.before?.data() as any)?.members ?? {};
    const after = (event.data?.after?.data() as any)?.members ?? {};
    const touched = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changed = [...touched].filter((uid) => before[uid] !== after[uid]);
    if (!changed.length) return;
    // Sequential and capped: this fires on every org settings edit, and a
    // membership change touches one or two users, not the whole tenant.
    for (const uid of changed.slice(0, 25)) {
      await syncOrgClaimsQuietly(uid);
    }
  },
);
