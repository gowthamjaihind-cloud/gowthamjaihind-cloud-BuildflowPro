import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { chargeAiUsage, orgIdForUser, refundAiUsage } from "./usage";
import { geminiText } from "./gemini";
import { AI_MAX_INSTANCES, requireOrgMember } from "./access";
import { CALLABLE_OPTS } from "../callable";

// The Gemini API key lives in Secret Manager (never in the client bundle), so
// the model is only ever called server-side. Create it once with:
//   firebase functions:secrets:set GEMINI_API_KEY   (or via the Secret Manager console)
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
// The model list, retries and fallback live in ./gemini (shared with invoice scanning).

interface Insights {
  costVariance: string;
  scheduleSlippage: string;
  executiveDigest: string;
  siteReport: string;
}

// Region is left as the default (us-central1) to match the other callables the
// web app already invokes via getFunctions(getApp()).
export const generateProjectInsights = onCall(
  { ...CALLABLE_OPTS, secrets: [GEMINI_API_KEY], timeoutSeconds: 120, maxInstances: AI_MAX_INSTANCES },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const brief = request.data?.brief;
    if (!brief) {
      throw new HttpsError("invalid-argument", "Missing project brief.");
    }

    // Meter against the org's monthly AI quota (throws if exceeded).
    // A user with no company used to be metered against nothing -- unlimited.
    const orgId = await requireOrgMember(request.auth.uid, await orgIdForUser(request.auth.uid));
    await chargeAiUsage(orgId, "insights");

    const prompt = buildPrompt(brief);
    let text: string;
    let model: string;
    try {
      ({ text, model } = await geminiText(
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
        },
        GEMINI_API_KEY.value(),
      ));
    } catch (e) {
      await refundAiUsage(orgId, "insights"); // charged up front; give it back
      throw e;
    }

    let parsed: Insights;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Occasionally the model wraps the JSON in prose; grab the first object.
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new HttpsError("internal", "The AI response could not be read.");
      }
      parsed = JSON.parse(match[0]);
    }

    return {
      insights: {
        costVariance: parsed.costVariance || "",
        scheduleSlippage: parsed.scheduleSlippage || "",
        executiveDigest: parsed.executiveDigest || "",
        siteReport: parsed.siteReport || "",
      },
      generatedAt: new Date().toISOString(),
      model,
    };
  }
);


function buildPrompt(brief: any): string {
  const briefJson = typeof brief === "string" ? brief : JSON.stringify(brief);
  return `You are a senior construction project-controls analyst. Analyse the PROJECT DATA (JSON) below and produce concise, specific, decision-ready insights for the project owner. Use ONLY the data provided — never invent figures. All money is Indian Rupees (₹). "Today" is given in the data as todayISO.

Return ONLY a JSON object with exactly these four string keys, each holding short Markdown (use **bold** and "- " bullet lists; do not use headings larger than ###):

- "costVariance": Where the project stands on planned vs actual cost overall and by category (material, labour, equipment, direct cost). Call out the 2-3 biggest variances with figures and the tasks driving them. End with one clear recommendation.
- "scheduleSlippage": Tasks at risk of slipping or already behind, judged from progress % vs planned dates and recent daily-log activity. List the top at-risk tasks and why. Flag any task with no recent log activity. End with the single most urgent action.
- "executiveDigest": A tight 4-6 sentence "state of the project" a busy owner reads in 20 seconds — overall health, cost position, schedule position, top risk. Prose, no bullets.
- "siteReport": A clean site-activity report built from the recent daily logs — work done, materials consumed, labour and equipment deployed, and any issues/notes raised. Group by most recent dates. Suitable to share with a client.

If a section has insufficient data, say so briefly rather than inventing anything.

PROJECT DATA:
${briefJson}`;
}
