import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import * as crypto from "crypto";
import { db } from "../db";
import { CALLABLE_OPTS, REGION } from "../callable";
import { buildClientView, type ShareSections } from "./build";

/**
 * Shareable client dashboards.
 *
 * A link is a long random token (client_shares/{token}) pointing at one
 * project. Anyone with the link sees that project's client view; nobody can
 * list links, guess one, or reach the project's data through it: the page
 * never touches Firestore. It asks clientShareView, which builds the view on
 * the server from an allow-list (build.ts) and returns only that.
 *
 * Links are made, changed and switched off by an Owner, Admin or Project
 * Manager through the callables below; client_shares has no client access in
 * firestore.rules (default deny).
 */

const MANAGERS = ["Owner", "Admin", "Project Manager"];
const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

const todayIndia = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

function cleanSections(v: any, fallback?: ShareSections): ShareSections {
  const f = fallback || { progress: true, photos: true, updates: true, payments: false };
  const b = (k: keyof ShareSections) => (typeof v?.[k] === "boolean" ? v[k] : f[k]);
  return { progress: b("progress"), photos: b("photos"), updates: b("updates"), payments: b("payments") };
}

async function requireManager(uid: string, orgIdIn: unknown): Promise<string> {
  const userSnap = await db.doc(`users/${uid}`).get();
  const orgId = String(orgIdIn || "").trim() || String((userSnap.data() as any)?.currentOrgId || "");
  if (!orgId) throw new HttpsError("failed-precondition", "You're not part of an organization.");
  const org = await db.doc(`organizations/${orgId}`).get();
  const role = ((org.data() as any)?.members || {})[uid];
  if (!org.exists || !MANAGERS.includes(role)) {
    throw new HttpsError("permission-denied", "Only an Owner, Admin or Project Manager can share a project with a client.");
  }
  return orgId;
}

const shareOut = (id: string, d: any) => ({
  token: id,
  label: d.label || "",
  sections: cleanSections(d.sections),
  showHeadcount: d.showHeadcount === true,
  revoked: d.revoked === true,
  createdAt: d.createdAt || null,
  lastViewedAt: d.lastViewedAt || null,
  views: Number(d.views) || 0,
});

export const createClientShare = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const orgId = await requireManager(request.auth.uid, request.data?.orgId);
  const projectId = String(request.data?.projectId || "").trim();
  if (!projectId || !(await db.doc(`organizations/${orgId}/projects/${projectId}`).get()).exists) {
    throw new HttpsError("not-found", "That project was not found.");
  }
  const token = crypto.randomBytes(24).toString("base64url");
  const doc = {
    orgId,
    projectId,
    label: String(request.data?.label || "").trim().slice(0, 60),
    sections: cleanSections(request.data?.sections),
    showHeadcount: request.data?.showHeadcount === true,
    revoked: false,
    createdAt: new Date().toISOString(),
    createdBy: request.auth.uid,
    views: 0,
  };
  await db.doc(`client_shares/${token}`).set(doc);
  return shareOut(token, doc);
});

export const listClientShares = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const orgId = await requireManager(request.auth.uid, request.data?.orgId);
  const projectId = String(request.data?.projectId || "").trim();
  const snap = await db.collection("client_shares").where("orgId", "==", orgId).where("projectId", "==", projectId).get();
  return snap.docs.map((d) => shareOut(d.id, d.data())).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
});

export const updateClientShare = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const token = String(request.data?.token || "");
  if (!TOKEN_RE.test(token)) throw new HttpsError("invalid-argument", "Unknown link.");
  const ref = db.doc(`client_shares/${token}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Unknown link.");
  const cur: any = snap.data();
  await requireManager(request.auth.uid, cur.orgId);
  const patch: any = { updatedAt: new Date().toISOString(), updatedBy: request.auth.uid };
  if (request.data?.sections) patch.sections = cleanSections(request.data.sections, cleanSections(cur.sections));
  if (typeof request.data?.showHeadcount === "boolean") patch.showHeadcount = request.data.showHeadcount;
  if (typeof request.data?.label === "string") patch.label = request.data.label.trim().slice(0, 60);
  // Switching a link off is permanent: a new link is made instead, so a link
  // that was once passed on can never quietly come back to life.
  if (request.data?.revoked === true) patch.revoked = true;
  await ref.set(patch, { merge: true });
  view_cache.delete(token);
  return shareOut(token, { ...cur, ...patch });
});

// A client page refreshes itself every minute; building the view reads every
// task and log of the project, so the answer is kept for a minute per link.
// A link switched off can therefore stay visible for up to that minute on
// another server instance.
const view_cache = new Map<string, { at: number; body: string }>();
const CACHE_MS = 60_000;

/** Public: the client view for one link. No sign-in; the token is the key. */
export const clientShareView = onRequest({ region: REGION, cors: true, maxInstances: 10, timeoutSeconds: 30 }, async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.set("X-Robots-Tag", "noindex, nofollow");
  const token = String(req.query.t || "");
  const gone = () => res.status(404).json({ error: "This link is not active. Please ask your builder for a new one." });
  if (!TOKEN_RE.test(token)) return void gone();

  const hit = view_cache.get(token);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    res.type("application/json").send(hit.body);
    return;
  }
  try {
    const ref = db.doc(`client_shares/${token}`);
    const snap = await ref.get();
    const share: any = snap.data();
    if (!snap.exists || share?.revoked) return void gone();
    const base = `organizations/${share.orgId}/projects/${share.projectId}`;
    const [projectSnap, orgSnap, profileSnap, tasks, logs, estimates, payments] = await Promise.all([
      db.doc(base).get(),
      db.doc(`organizations/${share.orgId}`).get(),
      db.doc(`organizations/${share.orgId}/profile/company`).get(),
      db.collection(`${base}/tasks`).select("name", "parentId", "type", "startDate", "endDate", "progress", "duration", "status").get(),
      db.collection(`${base}/dailyLogs`).select("taskId", "workDate", "createdAt", "progressPercent", "labour", "photoUrls").limit(3000).get(),
      db.collection(`${base}/estimates`).select("status", "totalAmount").get(),
      db.collection(`${base}/client_payments`).select("date", "amount").get(),
    ]);
    if (!projectSnap.exists) return void gone();
    const profile: any = profileSnap.data() || {};
    const view = buildClientView({
      sections: cleanSections(share.sections),
      showHeadcount: share.showHeadcount === true,
      today: todayIndia(),
      company: { name: (orgSnap.data() as any)?.companyName, logo: profile.logo, phone: profile.phone, email: profile.email },
      project: projectSnap.data(),
      tasks: tasks.docs.map((d) => ({ id: d.id, ...d.data() })),
      logs: logs.docs.map((d) => d.data()),
      estimates: estimates.docs.map((d) => d.data()),
      payments: payments.docs.map((d) => d.data()),
    });
    const body = JSON.stringify(view);
    view_cache.set(token, { at: Date.now(), body });
    if (view_cache.size > 500) view_cache.delete(view_cache.keys().next().value as string);
    res.type("application/json").send(body);
    // Count visits, at most once per 10 minutes per link so a page left open
    // does not write every minute.
    if (!share.lastViewedAt || Date.now() - Date.parse(share.lastViewedAt) > 10 * 60_000) {
      await ref.set({ lastViewedAt: new Date().toISOString(), views: FieldValue.increment(1) }, { merge: true }).catch(() => {});
    }
  } catch (e) {
    console.error("clientShareView failed", e);
    res.status(500).json({ error: "The dashboard could not be loaded just now. Please try again in a minute." });
  }
});
