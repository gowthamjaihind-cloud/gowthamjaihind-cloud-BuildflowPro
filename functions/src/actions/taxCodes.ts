import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { CALLABLE_OPTS } from "../callable";
import { db } from "../db";
import { geminiText } from "../ai/gemini";
import { chargeAiUsage, refundAiUsage } from "../ai/usage";
import { parseModelJson } from "../bot/aiLog";
import { lookupTax } from "../shared/hsnTable";
import { MANAGER_ROLES } from "./permissions";

/**
 * Settings > Master data > "Check HSN & GST".
 *
 *   taxCodeSuggestions -> for materials with no HSN (or a rate the checked
 *                         list disagrees with): Sitetru's checked list first,
 *                         an AI suggestion (one AI use for the whole batch)
 *                         for the rest, marked so the person checks it
 *   applyTaxCodes      -> writes what the person ticked to the master AND to
 *                         every project's copy of that material, so purchase
 *                         orders pick it up
 *
 * Owner, Admin, Project Manager and Project Director only.
 */

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const GST = [0, 0.25, 3, 5, 12, 18, 28, 40];
const noThinking = (model: string, b: any) =>
  model.startsWith("gemini-2.5") ? { ...b, generationConfig: { ...b.generationConfig, thinkingConfig: { thinkingBudget: 0 } } } : b;

async function requireManager(uid: string | undefined, orgId: string) {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!orgId) throw new HttpsError("invalid-argument", "No workspace.");
  const [u, o] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`organizations/${orgId}`).get()]);
  const memberRole = (o.data()?.members || {})[uid];
  const role = String(u.data()?.role || memberRole || "");
  if (!memberRole || !MANAGER_ROLES.includes(role)) {
    throw new HttpsError("permission-denied", "Only an Owner, Admin, Project Manager or Project Director can change HSN and GST.");
  }
}

export const taxCodeSuggestions = onCall({ ...CALLABLE_OPTS, secrets: [GEMINI_API_KEY], timeoutSeconds: 90 }, async (request) => {
  const orgId = String(request.data?.orgId || "");
  await requireManager(request.auth?.uid, orgId);
  const names: string[] = (Array.isArray(request.data?.names) ? request.data.names : [])
    .map((n: unknown) => String(n ?? "").replace(/\s+/g, " ").trim().slice(0, 80)).filter(Boolean).slice(0, 60);
  const out: Record<string, { hsn: string; gstRate: number; source: "list" | "ai" }> = {};
  const ask: string[] = [];
  for (const n of names) {
    const l = lookupTax(n);
    if (l) out[n] = { hsn: l.hsn, gstRate: l.gstRate, source: "list" };
    else ask.push(n);
  }
  if (ask.length) {
    await chargeAiUsage(orgId, "command");
    try {
      const prompt = `For each building/construction material below, give its Indian GST HSN code (4 to 8 digits) and the GST rate that applies today (after the September 2025 GST rate changes). If you are not reasonably sure, give "" and null for it.
Answer JSON only: {"items":[{"name":"<as given>","hsn":"","gstRate":null}]}

MATERIALS:
${ask.map((n) => `- ${n}`).join("\n")}`;
      const { text } = await geminiText(
        { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 4096 } },
        GEMINI_API_KEY.value(), 70_000, { perAttemptMs: 30_000, models: ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"], forModel: noThinking },
      );
      for (const it of parseModelJson(text)?.items || []) {
        const name = ask.find((n) => n === String(it?.name ?? "").trim());
        const hsn = String(it?.hsn ?? "").replace(/\D/g, "");
        const gst = Number(it?.gstRate);
        if (name && [4, 6, 8].includes(hsn.length) && GST.includes(gst)) out[name] = { hsn, gstRate: gst, source: "ai" };
      }
    } catch (e) {
      await refundAiUsage(orgId, "command");
      console.error("taxCodeSuggestions AI failed", (e as any)?.diag || e);
      // The checked-list answers still come back.
    }
  }
  return { suggestions: names.filter((n) => out[n]).map((n) => ({ name: n, ...out[n] })) };
});

export const applyTaxCodes = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 120 }, async (request) => {
  const orgId = String(request.data?.orgId || "");
  await requireManager(request.auth?.uid, orgId);
  const updates: { masterId: string; hsn: string; gstRate: number }[] = (Array.isArray(request.data?.updates) ? request.data.updates : [])
    .slice(0, 100)
    .map((u: any) => ({ masterId: String(u?.masterId || ""), hsn: String(u?.hsn || "").replace(/\D/g, ""), gstRate: Number(u?.gstRate) }))
    .filter((u: any) => /^[A-Za-z0-9_-]{1,64}$/.test(u.masterId) && [4, 6, 8].includes(u.hsn.length) && GST.includes(u.gstRate));
  if (!updates.length) return { masters: 0, inventoryItems: 0 };

  const projects = await db.collection(`organizations/${orgId}/projects`).select().get();
  let writer = db.batch();
  let pending = 0;
  let items = 0;
  const flush = async () => { if (pending) { await writer.commit(); writer = db.batch(); pending = 0; } };
  const put = async (ref: FirebaseFirestore.DocumentReference, data: object) => {
    writer.update(ref, data);
    if (++pending >= 400) await flush();
  };
  for (const u of updates) {
    const masterRef = db.doc(`organizations/${orgId}/materials/${u.masterId}`);
    if (!(await masterRef.get()).exists) continue;
    await put(masterRef, { hsn: u.hsn, gstRate: u.gstRate });
  }
  // Each project's copy of these materials (linked by masterMaterialId).
  const byId = new Map(updates.map((u) => [u.masterId, u]));
  const ids = [...byId.keys()];
  for (const p of projects.docs) {
    for (let i = 0; i < ids.length; i += 30) {
      const snap = await p.ref.collection("inventory").where("masterMaterialId", "in", ids.slice(i, i + 30)).get();
      for (const d of snap.docs) {
        const u = byId.get(String(d.data().masterMaterialId))!;
        await put(d.ref, { hsn: u.hsn, gstRate: u.gstRate });
        items++;
      }
    }
  }
  await flush();
  return { masters: updates.length, inventoryItems: items };
});
