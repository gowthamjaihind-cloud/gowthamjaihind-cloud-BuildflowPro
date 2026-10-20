import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import * as crypto from "crypto";
import { db } from "./db";
import { subscriptionPatch, planCacheKey, rzpPeriod, totalCycles, desiredQuantity, quantityChange, isQuantityBilled } from "./rzpSubscription";
import { isPlanId, planAmountPaise, planPatch, PlanId, OVERAGE_RATE, slotPurchasePatch, prorateUpgrade, addGst, GST_RATE_PCT } from "./plans";
import { captureError } from "./sentry";
import { CALLABLE_OPTS } from "./callable";

// Razorpay integration (TEST MODE until KYC is completed and live keys are set).
// Flow: the app creates an order (server-priced) -> Razorpay Checkout collects
// payment -> the webhook (and a client-side verify as backup) auto-activates the
// org's plan. Keys live in an Admin-only config doc, set via the operator panel.

const SUPER_ADMINS = ["gowtham.jaihind@gmail.com"];
function assertSuperAdmin(request: any) {
  const email = String(request.auth?.token?.email || "").toLowerCase();
  if (!request.auth || !SUPER_ADMINS.includes(email)) {
    throw new HttpsError("permission-denied", "Operator access required.");
  }
}

interface RzpConfig { keyId: string; keySecret: string; webhookSecret: string; }

async function getRazorpayConfig(): Promise<RzpConfig | null> {
  const snap = await db.doc("app_config/razorpay").get();
  const d: any = snap.exists ? snap.data() : null;
  if (!d?.keyId || !d?.keySecret) return null;
  return { keyId: d.keyId, keySecret: d.keySecret, webhookSecret: d.webhookSecret || "" };
}

// Create a Razorpay order via the REST API. Shared by plan and slot checkouts.
async function placeRazorpayOrder(
  cfg: RzpConfig,
  opts: { amount: number; receipt: string; notes: Record<string, string> },
): Promise<any> {
  const auth = Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: opts.amount, currency: "INR", receipt: opts.receipt, notes: opts.notes }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new HttpsError("internal", `Razorpay order failed: ${res.status} ${body.slice(0, 180)}`);
  }
  return res.json();
}

// ---- Operator config (super-admin) ----
/**
 * Seller-side GST configuration.
 *
 * The rate is deliberately gated on a GSTIN: charging GST without being
 * registered is not a rounding error, it is collecting tax you have no right
 * to. So an unset, blank or malformed GSTIN yields a 0% rate and checkout
 * charges the net price, which is the correct behaviour below the ₹20L
 * registration threshold. Set the GSTIN in the operator panel once registered
 * and every subsequent order picks up the rate with no redeploy.
 */
export interface TaxConfig { gstin: string; ratePct: number; }

export async function getTaxConfig(): Promise<TaxConfig> {
  const snap = await db.doc("app_config/tax").get();
  const d: any = snap.exists ? snap.data() : {};
  const gstin = String(d?.gstin || "").trim().toUpperCase();
  if (!gstin) return { gstin: "", ratePct: 0 };
  const configured = Number(d?.ratePct);
  return { gstin, ratePct: Number.isFinite(configured) && configured > 0 ? configured : GST_RATE_PCT };
}

/**
 * The GST rate checkout will actually apply, and nothing else.
 *
 * Pricing copy has to tell the truth in BOTH states: while no GSTIN is set the
 * customer pays the sticker, and the moment one is set they pay 18% more. A
 * hard-coded "exclusive of GST" line is wrong in the first case (it implies a
 * charge that never comes) and a silent 18% is worse in the second.
 *
 * Deliberately unauthenticated: the landing page quotes prices to visitors who
 * have not signed in, and a tax rate is public information -- it is printed on
 * every invoice. The GSTIN is NOT returned; only the number the copy needs.
 * App Check still applies through CALLABLE_OPTS.
 */
export const getCheckoutTaxRate = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 15 }, async () => {
  const { ratePct } = await getTaxConfig();
  return { ratePct };
});

export const setTaxConfig = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  assertSuperAdmin(request);
  const gstin = String(request.data?.gstin || "").trim().toUpperCase();
  // Empty clears registration and takes the rate back to 0 -- the way to stop
  // charging GST if registration lapses.
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
    throw new HttpsError("invalid-argument", "That doesn't look like a valid 15-character GSTIN.");
  }
  const raw = request.data?.ratePct;
  const ratePct = raw === undefined || raw === null || raw === "" ? GST_RATE_PCT : Number(raw);
  if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) {
    throw new HttpsError("invalid-argument", "GST rate must be between 0 and 100.");
  }
  await db.doc("app_config/tax").set(
    { gstin, ratePct, updatedAt: new Date().toISOString(), updatedBy: request.auth!.uid },
    { merge: true },
  );
  return { ok: true, gstin, ratePct: gstin ? ratePct : 0 };
});

export const getTaxConfigStatus = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  assertSuperAdmin(request);
  const cfg = await getTaxConfig();
  return { configured: !!cfg.gstin, gstin: cfg.gstin, ratePct: cfg.ratePct };
});

export const setRazorpayConfig = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  assertSuperAdmin(request);
  const keyId = String(request.data?.keyId || "").trim();
  const keySecret = String(request.data?.keySecret || "").trim();
  const webhookSecret = String(request.data?.webhookSecret || "").trim();
  if (!keyId || !keySecret) throw new HttpsError("invalid-argument", "Key ID and Key Secret are required.");
  await db.doc("app_config/razorpay").set(
    { keyId, keySecret, webhookSecret, updatedAt: new Date().toISOString(), updatedBy: request.auth!.uid },
    { merge: true },
  );
  return { ok: true };
});

export const getRazorpayConfigStatus = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  assertSuperAdmin(request);
  const snap = await db.doc("app_config/razorpay").get();
  const d: any = snap.exists ? snap.data() : {};
  return {
    configured: !!(d?.keyId && d?.keySecret),
    keyId: d?.keyId || "",
    hasWebhookSecret: !!d?.webhookSecret,
    mode: String(d?.keyId || "").startsWith("rzp_live_") ? "live" : "test",
  };
});

// ---- Recurring billing: Razorpay Subscriptions ----
//
// One-off orders never charged a second time, so renewal cut a customer off
// without ever asking them for money. A subscription puts the charging on
// Razorpay's side; rzpSubscription.ts translates its webhooks back into org
// state. This covers the PLAN FEE only -- extra project slots are still bought
// one-off through createSlotOrder.

/** Create a Razorpay plan, or reuse the one already made for these terms. */
async function ensureRazorpayPlan(
  cfg: RzpConfig,
  plan: PlanId,
  period: "monthly" | "annual",
  tax: { gstin: string; ratePct: number },
): Promise<string> {
  const key = planCacheKey(plan, period, tax.ratePct);
  const ref = db.doc("app_config/razorpay_plans");
  const snap = await ref.get();
  const cached = (snap.exists ? (snap.data() as any) : {})?.[key];
  if (typeof cached === "string" && cached) return cached;

  const net = planAmountPaise(plan, period);
  if (!net) throw new HttpsError("failed-precondition", "That plan has no published price.");
  // The subscription charges ONE fixed amount, so tax has to be inside it.
  const charge = addGst(net, tax.ratePct);

  const auth = Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/plans", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      period: rzpPeriod(period),
      interval: 1,
      item: {
        name: `Sitetru ${plan} (${period})`,
        amount: charge.totalPaise,
        currency: "INR",
        description: tax.ratePct > 0 ? `Includes ${tax.ratePct}% GST` : "No GST applied",
      },
      notes: { plan, period, gstRatePct: String(tax.ratePct) },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new HttpsError("internal", `Razorpay plan failed: ${res.status} ${body.slice(0, 180)}`);
  }
  const created: any = await res.json();
  const planId = String(created?.id || "");
  if (!planId) throw new HttpsError("internal", "Razorpay returned a plan with no id.");
  // merge, not set: four plans share this document.
  await ref.set({ [key]: planId, [`${key}_amountPaise`]: charge.totalPaise }, { merge: true });
  return planId;
}

/**
 * Start a recurring subscription for the org's plan fee.
 *
 * The client opens Razorpay checkout with the returned subscription id; the
 * mandate is authorised there and every later charge happens without us.
 */
export const createSubscription = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const plan = String(request.data?.plan || "");
  const period = request.data?.period === "annual" ? "annual" : "monthly";
  if (!isPlanId(plan) || !planAmountPaise(plan as PlanId, period)) {
    throw new HttpsError("invalid-argument", "Choose a plan that can be subscribed to.");
  }

  const userSnap = await db.doc(`users/${uid}`).get();
  const orgId = String(request.data?.orgId || "").trim() ||
    (userSnap.exists ? (userSnap.data() as any).currentOrgId : undefined);
  if (!orgId) throw new HttpsError("failed-precondition", "You're not part of an organization.");
  const orgRef = db.doc(`organizations/${orgId}`);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) throw new HttpsError("not-found", "Organization not found.");
  const org: any = orgSnap.data();
  if (!["Owner", "Admin"].includes((org.members || {})[uid])) {
    throw new HttpsError("permission-denied", "Only an Owner or Admin can start a subscription.");
  }
  // Two live mandates would charge the customer twice a month, and the second
  // would look exactly like the first on their statement.
  if (org.razorpaySubscriptionId && org.subscriptionStatus === "active") {
    throw new HttpsError("failed-precondition", "This workspace already has an active subscription.");
  }

  const cfg = await getRazorpayConfig();
  if (!cfg) throw new HttpsError("failed-precondition", "Payments aren't configured yet.");
  const tax = await getTaxConfig();
  const planId = await ensureRazorpayPlan(cfg, plan as PlanId, period, tax);

  // Starter is billed per project, so the mandate starts at what they actually
  // have. Opening it at 1 and correcting afterwards would authorise the
  // customer for ₹99 and then immediately raise it, which is both a worse
  // consent story and an extra charge on their statement.
  const quantity = desiredQuantity(
    plan,
    isQuantityBilled(plan)
      ? (await db.collection("projects").where("orgId", "==", orgId).count().get()).data().count
      : 1,
  );

  const auth = Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      plan_id: planId,
      total_count: totalCycles(period),
      quantity,
      customer_notify: 1,
      notes: { orgId, plan, period, uid },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new HttpsError("internal", `Razorpay subscription failed: ${res.status} ${body.slice(0, 180)}`);
  }
  const sub: any = await res.json();
  const subId = String(sub?.id || "");
  if (!subId) throw new HttpsError("internal", "Razorpay returned a subscription with no id.");

  // Recorded BEFORE the customer authorises, so a webhook that arrives before
  // this call returns still finds the org it belongs to.
  await db.doc(`razorpay_subscriptions/${subId}`).set({
    subscriptionId: subId,
    orgId,
    plan,
    period,
    uid,
    planId,
    quantity,
    taxRatePct: tax.ratePct,
    status: "created",
    createdAt: new Date().toISOString(),
  });

  return {
    subscriptionId: subId,
    shortUrl: sub?.short_url || null,
    keyId: cfg.keyId,
    plan,
    period,
  };
});

/**
 * Put the subscription's quantity in step with how many projects the org has.
 *
 * Idempotent and safe to call after any project is created or deleted: when
 * nothing needs to move it makes no API call at all. The CALLER is responsible
 * for having told the customer what it will cost -- this does not ask, it
 * bills, so the confirmation belongs upstream of it.
 */
export const syncSubscriptionQuantity = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const userSnap = await db.doc(`users/${uid}`).get();
  const orgId = String(request.data?.orgId || "").trim() ||
    (userSnap.exists ? (userSnap.data() as any).currentOrgId : undefined);
  if (!orgId) throw new HttpsError("failed-precondition", "You're not part of an organization.");

  const orgRef = db.doc(`organizations/${orgId}`);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) throw new HttpsError("not-found", "Organization not found.");
  const org: any = orgSnap.data();
  if (!["Owner", "Admin"].includes((org.members || {})[uid])) {
    throw new HttpsError("permission-denied", "Only an Owner or Admin can change billed capacity.");
  }

  const subId = String(org.razorpaySubscriptionId || "");
  if (!subId || !isQuantityBilled(String(org.plan || ""))) {
    // Business and anything not on a live mandate bill by other means; saying
    // "ok" here keeps the caller simple, since it fires after every project
    // change regardless of plan.
    return { changed: false, reason: "not a quantity-billed subscription" };
  }

  // Count the org's projects server-side. count() is a single read whatever the
  // number, and trusting a client-supplied figure here would let anyone set
  // their own bill.
  const agg = await db.collection("projects").where("orgId", "==", orgId).count().get();
  const projectCount = agg.data().count;
  const want = desiredQuantity(String(org.plan), projectCount);
  const change = quantityChange(org.billedQuantity, want);
  if (change.kind === "none") return { changed: false, quantity: want };

  const cfg = await getRazorpayConfig();
  if (!cfg) throw new HttpsError("failed-precondition", "Payments aren't configured yet.");
  const auth = Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(subId)}`, {
    method: "PATCH",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ quantity: change.quantity, schedule_change_at: change.scheduleAt }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new HttpsError("internal", `Razorpay quantity update failed: ${res.status} ${body.slice(0, 180)}`);
  }

  // An increase is live immediately, so the cap moves with it. A decrease only
  // applies at cycle end, so capacity must NOT drop now -- the customer has
  // paid through the period and keeps what they paid for.
  const patch: any = { billedQuantity: change.quantity, billedQuantityAt: Date.now() };
  if (change.kind === "increase") patch.includedProjects = change.quantity;
  await orgRef.set(patch, { merge: true });

  return { changed: true, quantity: change.quantity, effective: change.scheduleAt };
});

/**
 * Stop a live mandate at Razorpay, at the end of the cycle already paid for.
 *
 * Returns false rather than throwing so the caller can decide: cancelSubscription
 * refuses to record a local cancellation it could not actually enforce.
 */
export async function cancelRazorpaySubscription(subscriptionId: string): Promise<boolean> {
  const cfg = await getRazorpayConfig();
  if (!cfg) return false;
  const auth = Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64");
  try {
    const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cancel_at_cycle_end: 1 }),
    });
    if (res.ok) return true;
    // Already cancelled or already finished is success for our purposes: the
    // mandate will not charge again, which is all the caller needs.
    const body = await res.text().catch(() => "");
    return /already cancelled|not in a valid state|completed/i.test(body);
  } catch {
    return false;
  }
}

// ---- Checkout: create a server-priced order ----
export const createRazorpayOrder = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const plan = String(request.data?.plan || "");
  const period = request.data?.period === "annual" ? "annual" : "monthly";
  if (!isPlanId(plan) || plan === "enterprise") {
    throw new HttpsError("invalid-argument", "Choose a paid plan (Starter or Business).");
  }
  const listPaise = planAmountPaise(plan as PlanId, period);
  if (!listPaise) throw new HttpsError("invalid-argument", "That plan can't be purchased online.");

  // An explicit orgId supports the signup pay-now flow, where the just-created
  // org isn't linked as the user's currentOrgId yet. Falls back to currentOrgId.
  const explicitOrgId = String(request.data?.orgId || "").trim();
  const userSnap = await db.doc(`users/${uid}`).get();
  const orgId = explicitOrgId || (userSnap.exists ? (userSnap.data() as any).currentOrgId : undefined);
  if (!orgId) throw new HttpsError("failed-precondition", "You're not part of an organization.");
  const orgSnap = await db.doc(`organizations/${orgId}`).get();
  if (!orgSnap.exists) throw new HttpsError("not-found", "Organization not found.");
  const members = (orgSnap.data() as any)?.members || {};
  if (!["Owner", "Admin"].includes(members[uid])) {
    throw new HttpsError("permission-denied", "Only an Owner or Admin can purchase a plan.");
  }

  // Credit the unused part of a period already paid for, so upgrading
  // part-way through a cycle does not charge twice for the same days. Priced
  // here on the server: the client never supplies an amount.
  const quote = prorateUpgrade(orgSnap.data(), plan as PlanId, period);
  // Catalog prices are net of GST, so tax is added on top of the PRORATED
  // figure -- taxing the sticker would charge GST on days the customer is
  // being credited for.
  const tax = await getTaxConfig();
  const charge = addGst(quote.amountPaise, tax.ratePct);
  const amount = charge.totalPaise;

  const cfg = await getRazorpayConfig();
  if (!cfg) throw new HttpsError("failed-precondition", "Payments aren't configured yet.");

  const order = await placeRazorpayOrder(cfg, {
    amount,
    receipt: `org_${orgId}_${Date.now()}`.slice(0, 40),
    notes: { orgId, plan, period, uid },
  });

  await db.doc(`razorpay_orders/${order.id}`).set({
    orderId: order.id,
    kind: "plan",
    orgId,
    plan,
    period,
    uid,
    amount,
    netAmount: charge.netPaise,
    taxAmount: charge.taxPaise,
    taxRatePct: charge.ratePct,
    gstin: tax.gstin,
    listAmount: quote.fullPaise,
    creditApplied: quote.creditPaise,
    status: "created",
    createdAt: new Date().toISOString(),
  });

  // listAmount and credit go back so the client can show why the price differs
  // from the sticker. Charging less than list never needs an apology, so the
  // amount is correct whether or not that copy exists yet.
  return {
    orderId: order.id,
    amount,
    net: charge.netPaise,
    tax: charge.taxPaise,
    taxRatePct: charge.ratePct,
    listAmount: quote.fullPaise,
    credit: quote.creditPaise,
    creditDays: quote.creditDays,
    currency: "INR",
    keyId: cfg.keyId,
  };
});

// ---- Checkout: buy extra project slots (₹99/project overage) ----
// An Owner/Admin on a paid plan buys N additional project slots for the current
// cycle. Server-priced at the overage rate; payment raises includedProjects.
export const createSlotOrder = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const quantity = Math.floor(Number(request.data?.quantity) || 0);
  if (quantity < 1 || quantity > 50) {
    throw new HttpsError("invalid-argument", "Choose between 1 and 50 extra projects.");
  }

  const userSnap = await db.doc(`users/${uid}`).get();
  const orgId = String(request.data?.orgId || "").trim() ||
    (userSnap.exists ? (userSnap.data() as any).currentOrgId : undefined);
  if (!orgId) throw new HttpsError("failed-precondition", "You're not part of an organization.");
  const orgSnap = await db.doc(`organizations/${orgId}`).get();
  if (!orgSnap.exists) throw new HttpsError("not-found", "Organization not found.");
  const org: any = orgSnap.data();
  if (!["Owner", "Admin"].includes((org.members || {})[uid])) {
    throw new HttpsError("permission-denied", "Only an Owner or Admin can buy project slots.");
  }
  // Slots are an overage add-on for paid plans only. Free/enterprise/unlimited
  // orgs have no per-project overage to buy.
  // A null cap means Enterprise or an org never placed on a plan: unlimited
  // already, so there is no per-project overage to sell.
  if (org.includedProjects == null) {
    throw new HttpsError("failed-precondition", "Project slots apply to Starter and Business plans only.");
  }

  const rate = Number(org.overageRate) || OVERAGE_RATE;
  const tax = await getTaxConfig();
  const charge = addGst(quantity * rate * 100, tax.ratePct); // net paise -> +GST
  const amount = charge.totalPaise;

  const cfg = await getRazorpayConfig();
  if (!cfg) throw new HttpsError("failed-precondition", "Payments aren't configured yet.");

  const order = await placeRazorpayOrder(cfg, {
    amount,
    receipt: `slots_${orgId}_${Date.now()}`.slice(0, 40),
    notes: { orgId, kind: "slots", quantity: String(quantity), uid },
  });

  await db.doc(`razorpay_orders/${order.id}`).set({
    orderId: order.id,
    kind: "slots",
    orgId,
    quantity,
    uid,
    amount,
    netAmount: charge.netPaise,
    taxAmount: charge.taxPaise,
    taxRatePct: charge.ratePct,
    gstin: tax.gstin,
    status: "created",
    createdAt: new Date().toISOString(),
  });

  return {
    orderId: order.id,
    amount,
    net: charge.netPaise,
    tax: charge.taxPaise,
    taxRatePct: charge.ratePct,
    currency: "INR",
    keyId: cfg.keyId,
  };
});

// Apply the plan an order paid for. Idempotent (a repeat is a no-op).
async function activateOrgFromOrder(orderId: string): Promise<boolean> {
  const orderRef = db.doc(`razorpay_orders/${orderId}`);
  const snap = await orderRef.get();
  if (!snap.exists) return false;
  const o: any = snap.data();
  if (o.status === "paid") return true;

  if (o.kind === "slots") {
    // Extra project slots for ONE 30-day window. This used to do
    // `includedProjects: increment(qty)`, which nothing ever reversed -- so a
    // single ₹99 payment raised the cap permanently and the slot was sold
    // monthly but granted forever. slotPurchasePatch keeps the slots in their
    // own fields with an expiry, and leaves includedProjects to mean the plan's
    // own cap.
    //
    // Read and write in a transaction: topping up a live window has to see the
    // current count, and two slot payments landing together would otherwise
    // lose one of them.
    const qty = Math.max(0, Math.floor(Number(o.quantity) || 0));
    if (qty > 0) {
      const orgRef = db.doc(`organizations/${o.orgId}`);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(orgRef);
        tx.set(orgRef, slotPurchasePatch(snap.data(), qty), { merge: true });
      });
    }
    await orderRef.set({ status: "paid", paidAt: new Date().toISOString() }, { merge: true });
    return true;
  }

  const months = o.period === "annual" ? 12 : 1;
  // Clear the pay-now sweep markers so the abandoned-checkout cleanup leaves
  // this (now-paid) org alone.
  await db.doc(`organizations/${o.orgId}`).set(
    {
      ...planPatch(o.plan as PlanId, months),
      pendingPayment: FieldValue.delete(),
      pendingPlan: FieldValue.delete(),
      // Paying for a plan supersedes any scheduled end-of-cycle downgrade.
      pendingPlanChange: FieldValue.delete(),
    },
    { merge: true },
  );
  // Link the buyer into the org — a self-serve pay-now org is created unlinked
  // (no access) until payment lands, so this is what grants them access.
  // role: "Owner" mirrors the org members map onto the user profile so the
  // security rules (which read the profile role) let them create projects.
  if (o.uid) {
    await db.doc(`users/${o.uid}`).set(
      { currentOrgId: o.orgId, orgIds: FieldValue.arrayUnion(o.orgId), role: "Owner" },
      { merge: true },
    );
  }
  await orderRef.set({ status: "paid", paidAt: new Date().toISOString() }, { merge: true });
  return true;
}

// ---- Client-side verify (backup to the webhook) ----
export const verifyRazorpayPayment = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const orderId = String(request.data?.razorpay_order_id || "");
  const paymentId = String(request.data?.razorpay_payment_id || "");
  const signature = String(request.data?.razorpay_signature || "");
  if (!orderId || !paymentId || !signature) throw new HttpsError("invalid-argument", "Missing payment fields.");

  const cfg = await getRazorpayConfig();
  if (!cfg) throw new HttpsError("failed-precondition", "Payments aren't configured.");

  const expected = crypto
    .createHmac("sha256", cfg.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  if (expected !== signature) {
    throw new HttpsError("permission-denied", "Payment signature check failed.");
  }

  const ok = await activateOrgFromOrder(orderId);
  if (!ok) throw new HttpsError("not-found", "Order not found.");
  return { ok: true };
});

// ---- Webhook: the authoritative auto-activation ----
export const razorpayWebhook = onRequest({ region: "asia-southeast1" }, async (req, res) => {
  try {
    const cfg = await getRazorpayConfig();
    if (!cfg?.webhookSecret) {
      res.status(503).send("webhook not configured");
      return;
    }
    const signature = req.header("x-razorpay-signature") || "";
    const expected = crypto
      .createHmac("sha256", cfg.webhookSecret)
      .update((req as any).rawBody)
      .digest("hex");
    if (expected !== signature) {
      res.status(400).send("bad signature");
      return;
    }
    const event: any = req.body;
    // Subscription events are how a RECURRING charge reaches us. Razorpay owns
    // when a charge happens and whether it worked; rzpSubscription.ts maps that
    // onto this app's statuses, and anything it does not recognise is ignored
    // rather than guessed at.
    const name = String(event?.event || "");
    if (name.startsWith("subscription.")) {
      const entity = event?.payload?.subscription?.entity;
      const subId = String(entity?.id || "");
      const patch = subscriptionPatch(name, entity);
      // A decrease scheduled for cycle end arrives as the next charge. Taking
      // quantity from the entity here is what finally lowers capacity, so a
      // customer who removed a project stops paying for it from the cycle they
      // were told it would stop.
      const qty = Math.floor(Number(entity?.quantity) || 0);
      if (subId && patch) {
        const subRef = db.doc(`razorpay_subscriptions/${subId}`);
        const subSnap = await subRef.get();
        // notes is the fallback: a webhook can beat createSubscription's write.
        const orgId =
          (subSnap.exists ? (subSnap.data() as any)?.orgId : "") ||
          String(entity?.notes?.orgId || "");
        if (orgId) {
          const { reason, ...fields } = patch;
          const subDoc = subSnap.exists ? (subSnap.data() as any) : {};
          const quantityFields =
            qty > 0 && isQuantityBilled(String(subDoc?.plan || ""))
              ? { billedQuantity: qty, includedProjects: qty }
              : {};
          await db.doc(`organizations/${orgId}`).set(
            {
              ...fields,
              ...quantityFields,
              // A charge that lands clears any pending cancellation: the
              // customer paid, so they plainly did not mean to leave.
              ...(fields.subscriptionStatus === "active"
                ? { cancelAtPeriodEnd: FieldValue.delete() }
                : {}),
            },
            { merge: true },
          );
          await subRef.set(
            { subscriptionId: subId, orgId, status: entity?.status || null, lastEvent: name, lastReason: reason, updatedAt: new Date().toISOString() },
            { merge: true },
          );
        }
      }
      res.status(200).send("ok");
      return;
    }

    if (event?.event === "payment.captured" || event?.event === "order.paid") {
      const orderId =
        event?.payload?.payment?.entity?.order_id || event?.payload?.order?.entity?.id;
      if (orderId) await activateOrgFromOrder(String(orderId));
    }
    res.status(200).send("ok");
  } catch (e) {
    // A webhook failure means a paid customer may not get activated — track it.
    captureError(e, { where: "razorpayWebhook" });
    res.status(500).send("error");
  }
});
