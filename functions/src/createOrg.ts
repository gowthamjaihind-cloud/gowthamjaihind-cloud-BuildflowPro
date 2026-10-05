import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./db";
import { isPlanId, PLANS, OVERAGE_RATE, PlanId } from "./plans";
import { sendWelcomeEmail, APP_URL } from "./email";
import { syncOrgClaimsQuietly } from "./claims";
import { CALLABLE_OPTS } from "./callable";

const TRIAL_MS = 14 * 24 * 60 * 60 * 1000;
// The entry point. There is no permanent free tier any more -- the catalog is
// Starter, Business, Enterprise -- so "start free" means this 14-day Starter
// trial, no card. A customer who wants out afterwards simply stops paying: the
// subscription lifecycle takes them through past_due, a grace week with
// notices, then expired, and nothing is ever deleted.
const TRIAL_PLAN = "starter";

// Self-serve org creation: a signed-in user makes their own organization and is
// dropped into it as Owner. Called from the onboarding screen.
//  • startTrial            → 14-day Starter trial, access immediately, no card.
//  • otherwise (pay now)   → the org is created UNLINKED and the client runs
//    Razorpay checkout; the webhook activates the plan and links the user.
export const createOrganization = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const companyName = String(request.data?.companyName || "").trim();
  const plan = String(request.data?.plan || TRIAL_PLAN);
  const startTrial = request.data?.startTrial === true;
  if (!companyName) throw new HttpsError("invalid-argument", "Enter a company / workspace name.");
  if (!isPlanId(plan)) throw new HttpsError("invalid-argument", "Unknown plan.");
  // Trials are offered on the entry-level plan only. A trial requested for any
  // other plan is rejected (the higher plans are pay-now; upgrade after trial).
  if (startTrial && plan !== TRIAL_PLAN) {
    throw new HttpsError("invalid-argument", `Free trials are available on the ${TRIAL_PLAN} plan only.`);
  }

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
  const isPayNow = plan !== "enterprise" && !startTrial;

  let state: any;
  if (plan !== "enterprise" && startTrial) {
    // 14-day trial of the entry plan — full plan capacity, time-limited.
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
    // Placeholder for a pay-now org until payment activation overwrites it with
    // the real plan. It is deliberately capped at nothing and marked "free" as a
    // STATUS (which is not a plan, and still exists for legacy orgs): the org is
    // unlinked until payment lands, so nobody should reach it either way.
    state = {
      plan,
      includedProjects: 0,
      userLimit: PLANS[plan as PlanId].userLimit,
      aiQuota: 0,
      overageRate: OVERAGE_RATE,
      subscriptionStatus: "free",
    };
  }

  // A pay-now org is unlinked (no access) until payment lands. Mark it so the
  // scheduled sweeper can delete it if the payment is never completed, and
  // record which plan the buyer intended so support can see the abandoned
  // checkout. Payment activation clears pendingPayment.
  if (isPayNow) {
    base.pendingPayment = true;
    base.pendingPlan = plan;
  }

  await orgRef.set({ ...base, ...state });

  if (!isPayNow) {
    // Grant access now (free / trial): link the user and welcome them.
    // role: "Owner" mirrors the org members map onto the user profile — the
    // security rules read the profile role, so without this a self-serve Owner
    // couldn't create projects (and Owner-only UI would stay hidden).
    await db.doc(`users/${uid}`).set(
      { currentOrgId: orgId, orgIds: FieldValue.arrayUnion(orgId), role: "Owner" },
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

  // Mint membership into the token now rather than waiting for the members
  // trigger, so the client can refresh once and upload straight away.
  await syncOrgClaimsQuietly(uid);

  return {
    orgId,
    plan: state.plan || TRIAL_PLAN,
    subscriptionStatus: state.subscriptionStatus || "free",
    needsPayment: isPayNow,
  };
});
