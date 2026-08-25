import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./db";
import { isPlanId, PlanId, planPatch } from "./plans";
import { captureError } from "./sentry";

// Self-serve plan changes for an org's Owner/Admin.
//
// Upgrades are immediate and go through paid checkout (see razorpay.ts).
// Downgrades take effect at the END of the current paid cycle: the org keeps
// its current (higher) plan and capacity until then, so the customer gets what
// they already paid for, with no refund. A downgrade is stored as
// `pendingPlanChange` and applied by the daily applyScheduledPlanChanges job.

// Tier order (low → high). Free is lowest; enterprise is not self-serve.
const PLAN_ORDER: PlanId[] = ["free", "starter", "growth", "business", "enterprise"];
// Plans a customer can switch between without talking to us.
const SELF_SERVE: PlanId[] = ["free", "starter", "growth", "business"];
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

async function resolveOrgId(request: any): Promise<string> {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const explicit = String(request.data?.orgId || "").trim();
  if (explicit) return explicit;
  const userSnap = await db.doc(`users/${uid}`).get();
  const orgId = userSnap.exists ? (userSnap.data() as any).currentOrgId : "";
  if (!orgId) throw new HttpsError("failed-precondition", "You're not part of an organization.");
  return orgId;
}

async function assertOrgManager(request: any, orgId: string) {
  const snap = await db.doc(`organizations/${orgId}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Organization not found.");
  const members = (snap.data() as any)?.members || {};
  if (!["Owner", "Admin"].includes(members[request.auth!.uid])) {
    throw new HttpsError("permission-denied", "Only an Owner or Admin can change the plan.");
  }
  return snap;
}

// Schedule a downgrade to a lower plan, effective at the end of the paid cycle.
export const scheduleDowngrade = onCall({ timeoutSeconds: 30 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const target = String(request.data?.targetPlan || "");
  if (!isPlanId(target) || !SELF_SERVE.includes(target as PlanId)) {
    throw new HttpsError("invalid-argument", "Choose Free, Starter, Growth or Business.");
  }
  const orgId = await resolveOrgId(request);
  const orgSnap = await assertOrgManager(request, orgId);
  const org: any = orgSnap.data();

  const current = org.plan;
  if (!isPlanId(current) || !SELF_SERVE.includes(current as PlanId)) {
    throw new HttpsError("failed-precondition", "This organization's plan can't be changed here.");
  }
  const curIdx = PLAN_ORDER.indexOf(current as PlanId);
  const tgtIdx = PLAN_ORDER.indexOf(target as PlanId);
  if (tgtIdx >= curIdx) {
    throw new HttpsError("failed-precondition", "That isn't a downgrade — upgrades go through checkout.");
  }

  // Take effect at the end of the period the customer already paid for; fall
  // back to ~30 days out if no period end was recorded.
  const effectiveAt = Number(org.currentPeriodEnd) || Date.now() + MONTH_MS;

  await db.doc(`organizations/${orgId}`).set(
    { pendingPlanChange: { plan: target, effectiveAt, scheduledAt: Date.now(), scheduledBy: uid } },
    { merge: true },
  );
  return { scheduled: true, targetPlan: target, effectiveAt };
});

// Cancel a scheduled downgrade — the org keeps its current plan.
export const cancelScheduledPlanChange = onCall({ timeoutSeconds: 30 }, async (request) => {
  const orgId = await resolveOrgId(request);
  await assertOrgManager(request, orgId);
  await db.doc(`organizations/${orgId}`).set(
    { pendingPlanChange: FieldValue.delete() },
    { merge: true },
  );
  return { canceled: true };
});

// Apply scheduled downgrades whose effective date has passed. Runs daily.
export const applyScheduledPlanChanges = onSchedule(
  { schedule: "15 4 * * *", timeZone: "Asia/Kolkata", region: "asia-southeast1" },
  async () => {
    const now = Date.now();
    const snap = await db
      .collection("organizations")
      .where("pendingPlanChange.effectiveAt", "<=", now)
      .get();

    let applied = 0;
    for (const orgDoc of snap.docs) {
      const change = (orgDoc.data() as any).pendingPlanChange;
      const target = change?.plan;
      if (!isPlanId(target)) {
        // Malformed — clear so it doesn't loop forever.
        await orgDoc.ref.set({ pendingPlanChange: FieldValue.delete() }, { merge: true }).catch(() => {});
        continue;
      }
      try {
        // Applying planPatch resets capacity to the target plan; no project is
        // ever deleted — an org over the new cap simply pays per-project overage.
        await orgDoc.ref.set(
          { ...planPatch(target as PlanId, 1), pendingPlanChange: FieldValue.delete() },
          { merge: true },
        );
        applied++;
      } catch (e) {
        captureError(e, { where: "applyScheduledPlanChanges", orgId: orgDoc.id });
      }
    }
    console.log(`applyScheduledPlanChanges: applied ${applied} of ${snap.size} due`);
  },
);
