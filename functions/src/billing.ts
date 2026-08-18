import { onCall, HttpsError } from "firebase-functions/v2/https";
import { randomBytes } from "crypto";
import { db } from "./db";
import { sendInviteEmail, APP_URL } from "./email";
import { PLANS, isPlanId, OVERAGE_RATE, PlanId } from "./plans";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// App operators who may provision orgs and manage subscriptions. Keep in sync
// with the client-side check in the super-admin panel. (Later this can move to
// a custom claim or a config doc.)
const SUPER_ADMINS = ["gowtham.jaihind@gmail.com"];

const TRIAL_MS = 30 * 24 * 60 * 60 * 1000; // 30-day trial
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const genCode = () => randomBytes(6).toString("hex").toUpperCase();

function assertSuperAdmin(request: any) {
  const email = String(request.auth?.token?.email || "").toLowerCase();
  if (!request.auth || !SUPER_ADMINS.includes(email)) {
    throw new HttpsError("permission-denied", "Operator access required.");
  }
}

// Provision a brand-new customer organization on a 30-day trial and mint an
// Owner invite for its first user. Super-admin only.
export const provisionOrganization = onCall({ timeoutSeconds: 60 }, async (request) => {
  assertSuperAdmin(request);
  const companyName = String(request.data?.companyName || "").trim();
  const ownerEmail = String(request.data?.ownerEmail || "").trim().toLowerCase();
  if (!companyName) throw new HttpsError("invalid-argument", "Company name is required.");

  const orgRef = db.collection("organizations").doc();
  const orgId = orgRef.id;
  const now = Date.now();
  await orgRef.set({
    companyName,
    members: {}, // owner joins by accepting the invite below
    plan: "trial",
    subscriptionStatus: "trialing",
    trialEndsAt: now + TRIAL_MS,
    createdAt: new Date().toISOString(),
    createdBySuperAdmin: request.auth!.uid,
    provisioned: true,
  });

  // Owner invite (role Owner is allowed here — this is operator provisioning).
  const code = genCode();
  await db.doc(`org_invites/${code}`).set({
    code,
    orgId,
    orgName: companyName,
    email: ownerEmail || null,
    role: "Owner",
    invitedByUid: request.auth!.uid,
    createdAt: new Date().toISOString(),
    expiresAt: now + INVITE_TTL_MS,
    used: false,
  });

  // Mail the owner-invite link directly if an email was given (best-effort).
  const emailResult = await sendInviteEmail({
    to: ownerEmail || null,
    orgName: companyName,
    role: "Owner",
    link: `${APP_URL}/?invite=${code}`,
  });

  return {
    orgId,
    code,
    trialEndsAt: now + TRIAL_MS,
    emailed: emailResult.sent,
    emailError: emailResult.sent ? null : emailResult.error || null,
  };
});

// ---- Email (Resend) configuration: super-admin only ----
// Stored in an Admin-only Firestore doc so it can be set from the UI without a
// redeploy. getEmailConfigStatus never returns the API key.
export const setEmailConfig = onCall({ timeoutSeconds: 30 }, async (request) => {
  assertSuperAdmin(request);
  const apiKey = String(request.data?.apiKey || "").trim();
  const fromEmail = String(request.data?.fromEmail || "").trim();
  const fromName = String(request.data?.fromName || "Sitetru").trim();
  if (!apiKey || !fromEmail) throw new HttpsError("invalid-argument", "API key and from-email are required.");
  await db.doc("app_config/email").set(
    { apiKey, fromEmail, fromName, updatedAt: new Date().toISOString(), updatedBy: request.auth!.uid },
    { merge: true },
  );
  return { ok: true };
});

export const getEmailConfigStatus = onCall({ timeoutSeconds: 30 }, async (request) => {
  assertSuperAdmin(request);
  const snap = await db.doc("app_config/email").get();
  const d: any = snap.exists ? snap.data() : {};
  return { configured: !!(d?.apiKey && d?.fromEmail), fromEmail: d?.fromEmail || "", fromName: d?.fromName || "" };
});

// Set/adjust an org's subscription. Super-admin only — this is the manual
// "mark as paid / extend / expire" control that stands in until an automated
// payment webhook (Razorpay) drives it.
export const setSubscription = onCall({ timeoutSeconds: 60 }, async (request) => {
  assertSuperAdmin(request);
  const orgId = String(request.data?.orgId || "").trim();
  const action = String(request.data?.action || ""); // activate | extend_trial | expire | internal
  const months = Number(request.data?.months) || 1;
  if (!orgId) throw new HttpsError("invalid-argument", "orgId is required.");

  const orgRef = db.doc(`organizations/${orgId}`);
  const snap = await orgRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Organization not found.");

  const now = Date.now();
  let patch: any;
  switch (action) {
    case "activate":
      patch = {
        subscriptionStatus: "active",
        plan: "paid",
        currentPeriodEnd: now + months * 30 * 24 * 60 * 60 * 1000,
      };
      break;
    case "extend_trial":
      patch = { subscriptionStatus: "trialing", trialEndsAt: now + TRIAL_MS };
      break;
    case "expire":
      patch = { subscriptionStatus: "expired" };
      break;
    case "internal":
      patch = { subscriptionStatus: "internal", plan: "internal" };
      break;
    default:
      throw new HttpsError("invalid-argument", "Unknown action.");
  }
  await orgRef.set(patch, { merge: true });
  return { orgId, ...patch };
});

// Place an org on a project-based plan (Free / Starter / Growth / Business /
// Enterprise). Sets the capacity fields the app enforces (includedProjects,
// aiQuota, userLimit, overageRate) and the matching subscription status.
// Super-admin only — the manual stand-in until automated checkout is wired.
export const setOrgPlan = onCall({ timeoutSeconds: 60 }, async (request) => {
  assertSuperAdmin(request);
  const orgId = String(request.data?.orgId || "").trim();
  const plan = String(request.data?.plan || "");
  const months = Number(request.data?.months) || 1;
  if (!orgId) throw new HttpsError("invalid-argument", "orgId is required.");
  if (!isPlanId(plan)) throw new HttpsError("invalid-argument", "Unknown plan.");

  const orgRef = db.doc(`organizations/${orgId}`);
  const snap = await orgRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Organization not found.");

  const def = PLANS[plan as PlanId];
  const patch: any = {
    plan,
    includedProjects: def.includedProjects,
    userLimit: def.userLimit,
    aiQuota: def.aiQuota,
    overageRate: OVERAGE_RATE,
  };
  if (plan === "free") {
    patch.subscriptionStatus = "free";
  } else {
    patch.subscriptionStatus = "active";
    patch.currentPeriodEnd = Date.now() + months * MONTH_MS;
  }
  await orgRef.set(patch, { merge: true });
  return { orgId, plan, ...patch };
});

// Operator view of an org's live usage vs its plan — the "safety-cap" lens:
// spot an org running far past its included projects or AI quota. Super-admin only.
export const getOrgUsage = onCall({ timeoutSeconds: 60 }, async (request) => {
  assertSuperAdmin(request);
  const orgId = String(request.data?.orgId || "").trim();
  if (!orgId) throw new HttpsError("invalid-argument", "orgId is required.");

  const orgRef = db.doc(`organizations/${orgId}`);
  const snap = await orgRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Organization not found.");
  const d: any = snap.data() || {};

  const month = new Date().toISOString().slice(0, 7);
  const usageSnap = await orgRef.collection("usage").doc(month).get();
  const aiUsed = usageSnap.exists ? Number((usageSnap.data() as any).aiCalls) || 0 : 0;

  const projectCount = (await orgRef.collection("projects").count().get()).data().count;
  const included = d.includedProjects ?? null;
  const overageProjects = included === null ? 0 : Math.max(0, projectCount - included);
  const overageRate = Number(d.overageRate) || OVERAGE_RATE;

  return {
    plan: d.plan || null,
    subscriptionStatus: d.subscriptionStatus || null,
    companyName: d.companyName || null,
    includedProjects: included,
    projectCount,
    overageProjects,
    overageCost: overageProjects * overageRate,
    aiUsed,
    aiQuota: d.aiQuota ?? null,
  };
});
