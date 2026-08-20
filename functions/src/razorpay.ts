import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import * as crypto from "crypto";
import { db } from "./db";
import { isPlanId, planAmountPaise, planPatch, PlanId } from "./plans";

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

// ---- Operator config (super-admin) ----
export const setRazorpayConfig = onCall({ timeoutSeconds: 30 }, async (request) => {
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

export const getRazorpayConfigStatus = onCall({ timeoutSeconds: 30 }, async (request) => {
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

// ---- Checkout: create a server-priced order ----
export const createRazorpayOrder = onCall({ timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const plan = String(request.data?.plan || "");
  const period = request.data?.period === "annual" ? "annual" : "monthly";
  if (!isPlanId(plan) || plan === "free" || plan === "enterprise") {
    throw new HttpsError("invalid-argument", "Choose a paid plan (Starter, Growth or Business).");
  }
  const amount = planAmountPaise(plan as PlanId, period);
  if (!amount) throw new HttpsError("invalid-argument", "That plan can't be purchased online.");

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

  const cfg = await getRazorpayConfig();
  if (!cfg) throw new HttpsError("failed-precondition", "Payments aren't configured yet.");

  const auth = Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount,
      currency: "INR",
      receipt: `org_${orgId}_${Date.now()}`.slice(0, 40),
      notes: { orgId, plan, period, uid },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new HttpsError("internal", `Razorpay order failed: ${res.status} ${body.slice(0, 180)}`);
  }
  const order: any = await res.json();

  await db.doc(`razorpay_orders/${order.id}`).set({
    orderId: order.id,
    orgId,
    plan,
    period,
    uid,
    amount,
    status: "created",
    createdAt: new Date().toISOString(),
  });

  return { orderId: order.id, amount, currency: "INR", keyId: cfg.keyId };
});

// Apply the plan an order paid for. Idempotent (a repeat is a no-op).
async function activateOrgFromOrder(orderId: string): Promise<boolean> {
  const orderRef = db.doc(`razorpay_orders/${orderId}`);
  const snap = await orderRef.get();
  if (!snap.exists) return false;
  const o: any = snap.data();
  if (o.status === "paid") return true;
  const months = o.period === "annual" ? 12 : 1;
  // Clear the pay-now sweep markers so the abandoned-checkout cleanup leaves
  // this (now-paid) org alone.
  await db.doc(`organizations/${o.orgId}`).set(
    { ...planPatch(o.plan as PlanId, months), pendingPayment: FieldValue.delete(), pendingPlan: FieldValue.delete() },
    { merge: true },
  );
  // Link the buyer into the org — a self-serve pay-now org is created unlinked
  // (no access) until payment lands, so this is what grants them access.
  if (o.uid) {
    await db.doc(`users/${o.uid}`).set(
      { currentOrgId: o.orgId, orgIds: FieldValue.arrayUnion(o.orgId) },
      { merge: true },
    );
  }
  await orderRef.set({ status: "paid", paidAt: new Date().toISOString() }, { merge: true });
  return true;
}

// ---- Client-side verify (backup to the webhook) ----
export const verifyRazorpayPayment = onCall({ timeoutSeconds: 30 }, async (request) => {
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
    if (event?.event === "payment.captured" || event?.event === "order.paid") {
      const orderId =
        event?.payload?.payment?.entity?.order_id || event?.payload?.order?.entity?.id;
      if (orderId) await activateOrgFromOrder(String(orderId));
    }
    res.status(200).send("ok");
  } catch (e) {
    res.status(500).send("error");
  }
});
