import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { db } from "../db";
import { CALLABLE_OPTS } from "../callable";
import { geminiText } from "../ai/gemini";
import { aiQuotaFor } from "../ai/quota";
import { buildHelpPrompt, cleanHistory, type HelpContext } from "./knowledge";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

/** Questions per person per day. Help is free, so it is capped, not metered. */
export const HELP_DAILY_LIMIT = 40;
const HELP_MODELS = ["gemini-2.5-flash-lite", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-flash-latest"];

const istDay = (ms = Date.now()) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);
const fmt = (ms: unknown) => {
  const n = Number(ms);
  return n > 0 ? new Date(n).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : undefined;
};

/** This user's workspace, as far as answering their questions needs: no other customer's data, no secrets. */
async function workspaceFacts(uid: string, orgId: string): Promise<HelpContext> {
  const orgRef = db.doc(`organizations/${orgId}`);
  const [orgSnap, userSnap, projects, usage] = await Promise.all([
    orgRef.get(),
    db.doc(`users/${uid}`).get(),
    orgRef.collection("projects").select("name", "billingLocked").get(),
    orgRef.collection("usage").doc(new Date().toISOString().slice(0, 7)).get(),
  ]);
  const o: any = orgSnap.data() || {};
  const subs = Object.values(o.slotSubs || {}) as any[];
  return {
    role: (o.members || {})[uid],
    companyName: o.companyName,
    plan: o.plan,
    status: o.subscriptionStatus || "grandfathered (no billing)",
    trialEndsAt: o.subscriptionStatus === "trialing" ? fmt(o.trialEndsAt) : undefined,
    paidUntil: fmt(o.currentPeriodEnd),
    graceEndsAt: o.subscriptionStatus === "past_due" ? fmt(o.graceEndsAt) : undefined,
    cancelAtPeriodEnd: o.cancelAtPeriodEnd === true || undefined,
    pendingDowngrade: !o.cancelAtPeriodEnd && o.pendingPlanChange?.plan
      ? { plan: String(o.pendingPlanChange.plan), on: fmt(o.pendingPlanChange.effectiveAt) || "end of the paid period" }
      : null,
    includedProjects: o.includedProjects === undefined ? undefined : o.includedProjects,
    projectCount: projects.size,
    lockedProjects: projects.docs.filter((d) => (d.data() as any).billingLocked).map((d) => String((d.data() as any).name || "")).slice(0, 20),
    extraProjectSubs: subs.filter((x) => x?.status === "active").length || undefined,
    aiUsedThisMonth: Number((usage.data() as any)?.aiCalls) || 0,
    aiAllowance: aiQuotaFor(o, projects.size),
    telegramLinked: !!(userSnap.data() as any)?.telegramChatId,
  };
}

export const helpChat = onCall({ ...CALLABLE_OPTS, secrets: [GEMINI_API_KEY], timeoutSeconds: 60, maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const history = cleanHistory(request.data?.messages);
  if (!history.length || history[history.length - 1].role !== "user") {
    throw new HttpsError("invalid-argument", "Ask a question first.");
  }

  // The workspace the user is in, checked against its members list.
  const userSnap = await db.doc(`users/${uid}`).get();
  const orgId = String(request.data?.orgId || (userSnap.data() as any)?.currentOrgId || "");
  let context: HelpContext = {};
  if (orgId) {
    const org = await db.doc(`organizations/${orgId}`).get();
    if (org.exists && (org.data() as any)?.members?.[uid]) context = await workspaceFacts(uid, orgId);
  }

  // Daily cap per person.
  const capRef = db.doc(`help_usage/${uid}_${istDay()}`);
  const allowed = await db.runTransaction(async (tx) => {
    const n = Number((await tx.get(capRef)).data()?.count) || 0;
    if (n >= HELP_DAILY_LIMIT) return false;
    tx.set(capRef, { uid, count: n + 1, expireAt: new Date(Date.now() + 3 * 86400_000) }, { merge: true });
    return true;
  });
  if (!allowed) {
    throw new HttpsError("resource-exhausted", `You've reached today's limit of ${HELP_DAILY_LIMIT} questions. It resets at midnight, or email support for help now.`);
  }

  const body = {
    contents: [{ role: "user", parts: [{ text: buildHelpPrompt(context, history) }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
  };
  try {
    const { text } = await geminiText(body, GEMINI_API_KEY.value(), 45_000, {
      perAttemptMs: 20_000,
      models: HELP_MODELS,
      forModel: (model, b: any) =>
        model.startsWith("gemini-2.5") ? { ...b, generationConfig: { ...b.generationConfig, thinkingConfig: { thinkingBudget: 0 } } } : b,
    });
    const answer = String(text || "").trim().slice(0, 4000);
    if (!answer) throw new Error("empty answer");
    return { answer };
  } catch (e) {
    console.error("helpChat failed", (e as any)?.diag || e);
    throw new HttpsError("unavailable", "The help assistant is busy right now. Please try again in a minute.");
  }
});
