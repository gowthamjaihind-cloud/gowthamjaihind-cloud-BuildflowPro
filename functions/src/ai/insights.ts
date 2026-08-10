import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

// The Gemini API key lives in Secret Manager (never in the client bundle), so
// the model is only ever called server-side. Create it once with:
//   firebase functions:secrets:set GEMINI_API_KEY   (or via the Secret Manager console)
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const MODEL = "gemini-2.0-flash";

interface Insights {
  costVariance: string;
  scheduleSlippage: string;
  executiveDigest: string;
  siteReport: string;
}

// Region is left as the default (us-central1) to match the other callables the
// web app already invokes via getFunctions(getApp()).
export const generateProjectInsights = onCall(
  { secrets: [GEMINI_API_KEY], timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const brief = request.data?.brief;
    if (!brief) {
      throw new HttpsError("invalid-argument", "Missing project brief.");
    }

    const prompt = buildPrompt(brief);
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent` +
      `?key=${GEMINI_API_KEY.value()}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: "application/json",
          },
        }),
      });
    } catch (err: any) {
      console.error("Gemini request failed:", err);
      throw new HttpsError("unavailable", "Could not reach the AI service.");
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Gemini error", res.status, body.slice(0, 500));
      throw new HttpsError("internal", `AI service error (${res.status}).`);
    }

    const data: any = await res.json();
    const text: string | undefined =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new HttpsError("internal", "The AI returned an empty response.");
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
      model: MODEL,
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
