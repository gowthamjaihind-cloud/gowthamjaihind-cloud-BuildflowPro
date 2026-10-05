import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../db";
import { aiQuotaFor } from "./quota";

export { aiQuotaFor };

const monthKey = () => new Date().toISOString().slice(0, 7); // YYYY-MM

// The org a signed-in user belongs to (their currentOrgId).
export async function orgIdForUser(uid: string): Promise<string | undefined> {
  const snap = await db.doc(`users/${uid}`).get();
  return snap.exists ? (snap.data() as any).currentOrgId : undefined;
}

export function isQuotaError(e: any): boolean {
  return e?.code === "resource-exhausted";
}

// Enforce + record one unit of AI usage for an org. Throws resource-exhausted
// (surfaced to callers) when the monthly quota is reached. No-op when there's
// no org (legacy) or the plan is unlimited. Uses a transaction so concurrent
// calls can't slip past the cap.
export async function chargeAiUsage(
  orgId: string | undefined,
  kind: string,
  count = 1,
): Promise<void> {
  if (!orgId) return;
  const orgRef = db.doc(`organizations/${orgId}`);
  const orgSnap = await orgRef.get();
  const orgData = orgSnap.exists ? orgSnap.data() : {};
  // The allowance scales with the projects being paid for, so the count has to
  // be read. A count() aggregation is one read regardless of how many projects
  // there are, and this sits in front of a Gemini call that takes seconds.
  const projectCount =
    orgData?.aiScansPerProject == null
      ? 1 // legacy per-org cap: the count does not enter into it
      : (await orgRef.collection("projects").count().get()).data().count;
  const quota = aiQuotaFor(orgData, projectCount);
  if (quota === null) return; // unlimited

  const month = monthKey();
  const usageRef = db.doc(`organizations/${orgId}/usage/${month}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(usageRef);
    const data: any = snap.exists ? snap.data() : {};
    const used = Number(data.aiCalls) || 0;
    if (used + count > quota) {
      throw new HttpsError(
        "resource-exhausted",
        `You've reached this month's AI limit (${quota} actions). Upgrade your plan or contact support to continue.`,
      );
    }
    const byKind = data.byKind || {};
    tx.set(
      usageRef,
      {
        aiCalls: used + count,
        byKind: { ...byKind, [kind]: (Number(byKind[kind]) || 0) + count },
        month,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  });
}
