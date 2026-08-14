import { onCall, HttpsError } from "firebase-functions/v2/https";
import { randomBytes } from "crypto";
import { db } from "./db";

// App operators who may provision orgs and manage subscriptions. Keep in sync
// with the client-side check in the super-admin panel. (Later this can move to
// a custom claim or a config doc.)
const SUPER_ADMINS = ["gowtham.jaihind@gmail.com"];

const TRIAL_MS = 7 * 24 * 60 * 60 * 1000; // 7-day trial
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const genCode = () => randomBytes(6).toString("hex").toUpperCase();

function assertSuperAdmin(request: any) {
  const email = String(request.auth?.token?.email || "").toLowerCase();
  if (!request.auth || !SUPER_ADMINS.includes(email)) {
    throw new HttpsError("permission-denied", "Operator access required.");
  }
}

// Provision a brand-new customer organization on a 7-day trial and mint an
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

  return { orgId, code, trialEndsAt: now + TRIAL_MS };
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
