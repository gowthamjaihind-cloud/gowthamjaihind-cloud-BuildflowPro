import { HttpsError } from "firebase-functions/v2/https";
import { BACKOFF_MS, BUSY_MESSAGE, classifyGeminiStatus, MODELS, RETRY_BUDGET_MS } from "./geminiPolicy";

export { BUSY_MESSAGE, MODELS };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Attach the real reason to an error for the operator. A plain property, not
 * HttpsError `details`: callables send `details` to the browser, and the
 * service's own response must never reach a customer's screen.
 */
function withDiag<T extends Error>(err: T, diag: string): T {
  (err as any).diag = diag;
  return err;
}

/**
 * One generateContent call with retry and model fallback; returns the text of
 * the first candidate. Shared by invoice scanning and Project Insights so both
 * survive a Gemini overload the same way.
 *
 * Errors the customer can see are plain sentences: the service's own body goes
 * to the function log for us, never into the UI.
 */
export async function geminiText(
  body: unknown,
  key: string,
  budgetMs = RETRY_BUDGET_MS,
): Promise<{ text: string; model: string }> {
  const started = Date.now();
  let lastReason = "no models tried";
  let sawTransient = false;

  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      if (attempt > 0) {
        if (Date.now() - started + BACKOFF_MS[attempt - 1] > budgetMs) break;
        await sleep(BACKOFF_MS[attempt - 1]);
      }
      let res: Response;
      try {
        // Each request is bounded by what is left of the budget. The budget
        // used to be checked only BETWEEN attempts, so a single request that
        // hung could run far past it -- long enough for Telegram to give up on
        // the bot's webhook and start re-sending the message.
        const remaining = Math.max(5_000, budgetMs - (Date.now() - started));
        res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(remaining) });
      } catch (e) {
        sawTransient = true;
        lastReason = `network: ${e}`;
        continue;
      }
      if (res.ok) {
        const data: any = await res.json().catch(() => null);
        const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return { text, model };
        lastReason = `empty response from ${model}`;
        break; // a different model may answer; the same one will not
      }
      const outcome = classifyGeminiStatus(res.status);
      const detail = await res.text().catch(() => "");
      console.warn(`Gemini ${model} -> ${res.status} (attempt ${attempt + 1})`, detail.slice(0, 300));
      lastReason = `${model} ${res.status}`;
      if (outcome === "next") break;
      if (outcome === "fatal") {
        // A bad key, a disabled API or a request Gemini rejects: retrying will
        // not help and the details are for us, not the customer.
        console.error("Gemini rejected the request", res.status, detail.slice(0, 500));
        throw withDiag(
          new HttpsError("internal", "The AI service could not process this request. Please contact support if it keeps happening."),
          `${model} rejected the request (${res.status}): ${detail.slice(0, 300)}`,
        );
      }
      sawTransient = true;
    }
    if (Date.now() - started > budgetMs) break;
  }

  console.error("Gemini gave no answer:", lastReason);
  if (sawTransient) throw withDiag(new HttpsError("unavailable", BUSY_MESSAGE), `no answer within ${Math.round(budgetMs / 1000)}s; last: ${lastReason}`.slice(0, 400));
  throw withDiag(new HttpsError("internal", "The AI service did not return a result. Please try again."), `no result; last: ${lastReason}`.slice(0, 400));
}
