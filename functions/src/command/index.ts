import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { db } from "../db";
import { CALLABLE_OPTS } from "../callable";
import { geminiText } from "../ai/gemini";
import { chargeAiUsage, refundAiUsage } from "../ai/usage";
import { parseModelJson } from "../bot/aiLog";
import { buildCommandPrompt, sanitizeCommand, AUDIO_TYPES, MAX_AUDIO_BASE64, type PoContext } from "./po";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const MODELS = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-flash-lite-latest"];
const READ_ONLY_ROLES = ["Viewer", "Stakeholder"];

/**
 * The command chat: a typed or spoken request turned into a prepared action.
 * Today that is a draft purchase order, which the app opens in the usual
 * Create Purchase Order form for the user to check and create. Nothing is
 * written here. Counts as one AI use; given back when the model fails or
 * the request is not an action.
 */
export const commandParse = onCall({ ...CALLABLE_OPTS, secrets: [GEMINI_API_KEY], timeoutSeconds: 90, memory: "512MiB", maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const orgId = String(request.data?.orgId || "");
  const projectId = String(request.data?.projectId || "");
  if (!orgId || !projectId) throw new HttpsError("failed-precondition", "Open a project first, then ask.");
  const org = await db.doc(`organizations/${orgId}`).get();
  const role = (org.data() as any)?.members?.[uid];
  if (!org.exists || !role) throw new HttpsError("permission-denied", "You are not a member of this workspace.");
  if (READ_ONLY_ROLES.includes(role)) throw new HttpsError("permission-denied", "Your role can view this project but not create purchase orders.");
  const base = `organizations/${orgId}/projects/${projectId}`;
  const project = await db.doc(base).get();
  if (!project.exists) throw new HttpsError("not-found", "That project was not found.");
  if ((project.data() as any)?.billingLocked) throw new HttpsError("failed-precondition", "This project is read-only until its subscription is renewed.");

  const text = typeof request.data?.text === "string" ? request.data.text.trim().slice(0, 1500) : "";
  const audio = typeof request.data?.audioBase64 === "string" ? request.data.audioBase64 : "";
  const mime = String(request.data?.mimeType || "").split(";")[0].trim();
  if (!text && !audio) throw new HttpsError("invalid-argument", "Type or record what you want done.");
  if (audio && (!AUDIO_TYPES.includes(mime) || audio.length > MAX_AUDIO_BASE64)) {
    throw new HttpsError("invalid-argument", "That recording could not be used. Keep it under a minute and try again.");
  }

  const [suppliers, inventory] = await Promise.all([
    db.collection(`${base}/suppliers`).limit(300).get(),
    db.collection(`${base}/inventory`).limit(300).get(),
  ]);
  const ctx: PoContext = {
    today: new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10),
    vendors: suppliers.docs.map((d) => ({ id: d.id, name: String((d.data() as any).name || "").slice(0, 80) })).filter((v) => v.name),
    materials: inventory.docs.map((d) => {
      const x = d.data() as any;
      return { id: d.id, materialId: String(x.materialId || ""), name: String(x.name || "").slice(0, 80), unit: String(x.unit || ""), rate: Number(x.avgUnitCost || x.unitCost) || 0, hsn: String(x.hsn || ""), gstRate: Number(x.gstRate) || 0 };
    }).filter((m) => m.name),
  };
  if (!ctx.materials.length) throw new HttpsError("failed-precondition", "This project has no materials in Inventory yet. Add them there first, then ask again.");

  // Charged first so parallel requests cannot pass the monthly allowance;
  // a quota error reaches the user as "allowance used up".
  await chargeAiUsage(orgId, "command");
  let raw: any;
  try {
    const parts: any[] = [{ text: buildCommandPrompt(ctx, audio ? null : text) }];
    if (audio) parts.push({ inlineData: { mimeType: mime, data: audio } });
    const { text: out } = await geminiText(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } },
      GEMINI_API_KEY.value(),
      75_000,
      {
        perAttemptMs: 30_000,
        models: MODELS,
        forModel: (model, b: any) =>
          model.startsWith("gemini-2.5") ? { ...b, generationConfig: { ...b.generationConfig, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } } } : b,
      },
    );
    raw = parseModelJson(out);
  } catch (e) {
    console.error("commandParse failed", (e as any)?.diag || e);
    await refundAiUsage(orgId, "command");
    throw new HttpsError("unavailable", "Couldn't understand that just now. Please try again, or use the form.");
  }
  const result = sanitizeCommand(raw, ctx, audio ? null : text);
  if (result.kind !== "po" || !result.draft.items.length) await refundAiUsage(orgId, "command");
  return result;
});
