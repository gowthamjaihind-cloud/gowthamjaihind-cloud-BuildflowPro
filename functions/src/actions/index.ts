import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { CALLABLE_OPTS } from "../callable";
import { AUDIO_TYPES, MAX_AUDIO_BASE64 } from "../command/po";
import { prepareAction, confirmAction, cancelAction, approvePo } from "./run";

/** The app's "Do it for me": the same engine the bot uses (run.ts). */
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

export const actionPrepare = onCall({ ...CALLABLE_OPTS, secrets: [GEMINI_API_KEY], timeoutSeconds: 120, memory: "512MiB", maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const orgId = String(request.data?.orgId || "");
  const projectId = String(request.data?.projectId || "");
  if (!orgId || !projectId) throw new HttpsError("failed-precondition", "Open a project first, then ask.");
  const text = typeof request.data?.text === "string" ? request.data.text.trim().slice(0, 1500) : "";
  const audio = typeof request.data?.audioBase64 === "string" ? request.data.audioBase64 : "";
  const mimeType = String(request.data?.mimeType || "").split(";")[0].trim();
  if (!text && !audio) throw new HttpsError("invalid-argument", "Type or record what you want done.");
  if (audio && (!AUDIO_TYPES.includes(mimeType) || audio.length > MAX_AUDIO_BASE64)) {
    throw new HttpsError("invalid-argument", "That recording could not be used. Keep it under a minute and try again.");
  }
  return prepareAction({ uid, orgId, projectId, channel: "app", key: GEMINI_API_KEY.value(), logsInline: true, ...(audio ? { audio: { base64: audio, mimeType } } : { text }) });
});

export const actionConfirm = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 60 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  return confirmAction(String(request.data?.id || ""), uid);
});

/** Approve a Draft PO from "Do it for me" (Owner or Admin, checked in approvePo). */
export const poApprove = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  return approvePo(uid, String(request.data?.orgId || ""), String(request.data?.projectId || ""), String(request.data?.poId || ""));
});

export const actionCancel = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  await cancelAction(String(request.data?.id || ""), uid);
  return { ok: true };
});
export { taxCodeSuggestions, applyTaxCodes } from "./taxCodes";
