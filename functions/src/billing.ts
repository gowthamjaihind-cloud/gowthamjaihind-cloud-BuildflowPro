import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { randomBytes } from "crypto";
import { db } from "./db";
import { sendInviteEmail, sendRenewalEmail, APP_URL } from "./email";
import { isPlanId, OVERAGE_RATE, PlanId, planPatch, PLANS, effectiveProjectCap } from "./plans";
import { nextLifecycleState, renewalNoticeDue, noticeSentPatch, DAY_MS } from "./subscription";
import { captureError } from "./sentry";
import { CALLABLE_OPTS } from "./callable";

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
export const provisionOrganization = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 60 }, async (request) => {
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
export const setEmailConfig = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
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

export const getEmailConfigStatus = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  assertSuperAdmin(request);
  const snap = await db.doc("app_config/email").get();
  const d: any = snap.exists ? snap.data() : {};
  return { configured: !!(d?.apiKey && d?.fromEmail), fromEmail: d?.fromEmail || "", fromName: d?.fromName || "" };
});

// Set/adjust an org's subscription. Super-admin only — this is the manual
// "mark as paid / extend / expire" control that stands in until an automated
// payment webhook (Razorpay) drives it.
export const setSubscription = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 60 }, async (request) => {
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
      // `plan` is deliberately NOT written here. It used to be set to "paid",
      // which is not a PlanId, so isPlanId() rejected it and scheduleDowngrade
      // refused the org with "This organization's plan can't be changed here" --
      // every hand-activated customer lost self-serve plan changes. Use
      // setOrgPlan to place an org on a plan; this only moves the subscription.
      patch = {
        subscriptionStatus: "active",
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
      // Same reason: "internal" is not a PlanId either.
      patch = { subscriptionStatus: "internal" };
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
export const setOrgPlan = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 60 }, async (request) => {
  assertSuperAdmin(request);
  const orgId = String(request.data?.orgId || "").trim();
  const plan = String(request.data?.plan || "");
  const months = Number(request.data?.months) || 1;
  if (!orgId) throw new HttpsError("invalid-argument", "orgId is required.");
  if (!isPlanId(plan)) throw new HttpsError("invalid-argument", "Unknown plan.");

  const orgRef = db.doc(`organizations/${orgId}`);
  const snap = await orgRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Organization not found.");

  // Downgrade safety guard: if the target plan's included cap is finite and the
  // org already has more projects than that, block by default so we don't strand
  // a customer's projects over-cap. An operator can override with force:true
  // (e.g. after the customer agrees to archive/remove the excess). The plan
  // change never deletes any project — this only gates the plan write.
  const targetCap = PLANS[plan as PlanId].includedProjects;
  const force = request.data?.force === true;
  if (typeof targetCap === "number" && !force) {
    const projectCount = (await orgRef.collection("projects").count().get()).data().count;
    if (projectCount > targetCap) {
      throw new HttpsError(
        "failed-precondition",
        `This org has ${projectCount} projects but the ${plan} plan includes ${targetCap}. ` +
          `Ask the customer to archive/remove ${projectCount - targetCap} first, or pass force to override.`,
      );
    }
  }

  const patch = planPatch(plan as PlanId, months);
  await orgRef.set(patch, { merge: true });
  return { orgId, plan, ...patch };
});

// Operator view of an org's live usage vs its plan — the "safety-cap" lens:
// spot an org running far past its included projects or AI quota. Super-admin only.
export const getOrgUsage = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 60 }, async (request) => {
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
  // Effective cap, so live project slots count and lapsed ones do not --
  // reporting d.includedProjects raw here would disagree with projectCapState.
  const included = effectiveProjectCap(d) ?? null;
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

// ---- The job that makes a paid period actually end --------------------------
//
// Before this, nothing compared currentPeriodEnd to the clock. `active` meant
// access forever, and the only thing that ever gated anyone was trial expiry.
// See functions/src/subscription.ts for the state machine and why it is
// forgiving; the rules there are pure and tested, this just applies them.

/** The Owner's email, for billing mail. Falls back to any Admin. */
async function billingContact(orgData: any): Promise<string | null> {
  const members: Record<string, string> = orgData?.members || {};
  const pick = (role: string) => Object.keys(members).find((uid) => members[uid] === role);
  const uid = pick("Owner") || pick("Admin");
  if (!uid) return null;
  const snap = await db.doc(`users/${uid}`).get();
  const email = snap.exists ? (snap.data() as any)?.email : null;
  return typeof email === "string" && email.includes("@") ? email : null;
}

export const runSubscriptionLifecycle = onSchedule(
  {
    schedule: "45 4 * * *", // after the 03:30 cleanup and 04:15 plan changes
    timeZone: "Asia/Kolkata",
    region: "asia-southeast1",
  },
  async () => {
    const now = Date.now();
    // Only these two statuses can move. Everything else -- grandfathered,
    // internal, free, trialing, canceled, expired -- is left alone, so this
    // query is also the safety boundary.
    const snap = await db
      .collection("organizations")
      .where("subscriptionStatus", "in", ["active", "past_due"])
      .get();

    let moved = 0;
    let notified = 0;
    for (const orgDoc of snap.docs) {
      const data: any = orgDoc.data();
      try {
        const move = nextLifecycleState(data, now);
        if (move) {
          const patch: any = { subscriptionStatus: move.to };
          if (move.to === "past_due") patch.graceEndsAt = move.graceEndsAt;
          await orgDoc.ref.set(patch, { merge: true });
          moved++;

          // The transition itself is the trigger, which is what keeps this to
          // one email: on the next run the status is past_due and
          // nextLifecycleState returns null until grace actually ends.
          if (move.to === "past_due") {
            const to = await billingContact(data);
            await sendRenewalEmail({
              to,
              companyName: data.companyName || "Your workspace",
              link: APP_URL,
              daysLeft: 0,
              graceDaysLeft: Math.max(0, Math.ceil((move.graceEndsAt - now) / DAY_MS)),
            });
          }
          continue;
        }

        // Still inside the paid period: warn before it ends.
        const due = renewalNoticeDue(data, now);
        if (due !== null) {
          const to = await billingContact(data);
          const sent = await sendRenewalEmail({
            to,
            companyName: data.companyName || "Your workspace",
            link: APP_URL,
            daysLeft: due,
          });
          // Only record a notice that actually went out, so a Resend outage
          // retries tomorrow instead of silently swallowing the warning.
          if (sent.sent) {
            await orgDoc.ref.set(noticeSentPatch(data, due), { merge: true });
            notified++;
          }
        }
      } catch (e) {
        // One bad org must not stop the rest of the run.
        captureError(e, { where: "runSubscriptionLifecycle", orgId: orgDoc.id });
      }
    }
    console.log(`runSubscriptionLifecycle: ${moved} moved, ${notified} notified, of ${snap.size} examined`);
  },
);
