import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./db";
import { isPlanId, planPatch, PLANS, OVERAGE_RATE, PlanId } from "./plans";
import { sendWelcomeEmail, APP_URL } from "./email";

const TRIAL_MS = 30 * 24 * 60 * 60 * 1000;

// Self-serve org creation: a signed-in user makes their own organization and is
// dropped into it as Owner. Called from the onboarding screen.
//  • plan "free"                 → permanent Free tier (instant).
//  • paid plan + startTrial      → 30-day trial of that plan (no card).
//  • paid plan without startTrial → created on Free; the client then runs
//    Razorpay checkout to upgrade (the webhook activates the paid plan).
export const createOrganization = onCall({ timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const companyName = String(request.data?.companyName || "").trim();
  const plan = String(request.data?.plan || "free");
  const startTrial = request.data?.startTrial === true;
  if (!companyName) throw new HttpsError("invalid-argument", "Enter a company / workspace name.");
  if (!isPlanId(plan)) throw new HttpsError("invalid-argument", "Unknown plan.");

  const userSnap = await db.doc(`users/${uid}`).get();
  const userData: any = userSnap.exists ? userSnap.data() : {};

  const orgRef = db.collection("organizations").doc();
  const orgId = orgRef.id;

  const base: any = {
    companyName,
    members: { [uid]: "Owner" },
    createdAt: new Date().toISOString(),
    createdByUid: uid,
    selfServe: true,
  };

  // "Pay now" = a paid plan without the trial flag: the org is created but the
  // user is NOT linked to it yet, so no workspace access is granted until the
  // Razorpay payment succeeds (the payment activation links them). Free and
  // trial both grant access immediately.
  const isPayNow = plan !== "free" && plan !== "enterprise" && !startTrial;

  let state: any;
  if (plan !== "free" && plan !== "enterprise" && startTrial) {
    // 30-day trial of a paid plan — full plan capacity, time-limited.
    const def = PLANS[plan as PlanId];
    state = {
      plan,
      includedProjects: def.includedProjects,
      userLimit: def.userLimit,
      aiQuota: def.aiQuota,
      overageRate: OVERAGE_RATE,
      subscriptionStatus: "trialing",
      trialEndsAt: Date.now() + TRIAL_MS,
    };
  } else {
    // Free tier (also the placeholder state for a pay-now org until payment
    // activation overwrites it with the paid plan).
    state = planPatch("free", 0);
  }

  await orgRef.set({ ...base, ...state });

  if (!isPayNow) {
    // Grant access now (free / trial): link the user and welcome them.
    await db.doc(`users/${uid}`).set(
      { currentOrgId: orgId, orgIds: FieldValue.arrayUnion(orgId) },
      { merge: true },
    );
    const email = userData.email || (request.auth.token as any)?.email || null;
    await sendWelcomeEmail({
      to: email,
      name: userData.displayName || (request.auth.token as any)?.name || undefined,
      companyName,
      link: APP_URL,
    });
  }

  return {
    orgId,
    plan: state.plan || "free",
    subscriptionStatus: state.subscriptionStatus || "free",
    needsPayment: isPayNow,
  };
});
