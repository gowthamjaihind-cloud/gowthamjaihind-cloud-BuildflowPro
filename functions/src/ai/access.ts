import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../db";
import { AI_MAX_INSTANCES, isMember } from "./accessPolicy";

export { AI_MAX_INSTANCES };

/**
 * Who may spend AI on an organisation's behalf.
 *
 * Every AI callable is metered against an org's monthly quota, and the meter
 * is a no-op without an org -- that is the legacy path. So an AI callable that
 * let the CALLER choose the org, or let them have none, had no limit at all:
 * a fresh free signup could omit orgId and run Gemini without end, at our cost,
 * or pass someone else's orgId and read that tenant's vendors and purchase
 * orders while charging their quota.
 *
 * Membership is read from organizations/{orgId}.members, the same map
 * firestore.rules trusts -- never from the user's own profile, which they
 * write.
 */

/** Throws unless `uid` is a member of `orgId`. Returns the orgId, checked. */
export async function requireOrgMember(uid: string, orgId: unknown): Promise<string> {
  if (typeof orgId !== "string" || !orgId) {
    throw new HttpsError("failed-precondition", "Open a company first -- AI features run against your company's plan.");
  }
  const snap = await db.doc(`organizations/${orgId}`).get();
  if (!snap.exists || !isMember(snap.data()?.members, uid)) {
    throw new HttpsError("permission-denied", "You are not a member of this company.");
  }
  return orgId;
}

/*
 * AI_MAX_INSTANCES: Cloud Run scales an unconfigured function to the project's
 * regional limit; behind a paid model that turns a script hammering one
 * endpoint into a bill. Ten instances is far beyond this product's real AI
 * traffic -- a scan takes a few seconds -- and requests past it queue, then
 * fail fast, instead of scaling the spend.
 */
