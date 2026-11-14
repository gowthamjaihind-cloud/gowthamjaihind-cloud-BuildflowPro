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
export interface GeminiOptions {
  /**
   * Longest any single request may take. Without it one stuck request used
   * the whole budget, and no other model was ever tried.
   */
  perAttemptMs?: number;
  /** Adjust the request for a particular model (settings only some accept). */
  forModel?: (model: string, body: any) => any;
  /** Models to try, in order, instead of the default list. */
  models?: string[];
}

export async function geminiText(
  body: unknown,
  key: string,
  budgetMs = RETRY_BUDGET_MS,
  opts: GeminiOptions = {},
): Promise<{ text: string; model: string }> {
  const started = Date.now();
  let lastReason = "no models tried";
  let sawTransient = false;
  // Every attempt, for the operator: "last reason" alone hid which models
  // timed out and which no longer exist.
  const tried: string[] = [];
  const note = (model: string, what: string, t0: number) => tried.push(`${model} ${what} ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  for (const model of opts.models || MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      if (attempt > 0) {
        if (Date.now() - started + BACKOFF_MS[attempt - 1] > budgetMs) break;
        await sleep(BACKOFF_MS[attempt - 1]);
      }
      let res: Response;
      const t0 = Date.now();
      try {
        // Each request is bounded by what is left of the budget. The budget
        // used to be checked only BETWEEN attempts, so a single request that
        // hung could run far past it -- long enough for Telegram to give up on
        // the bot's webhook and start re-sending the message.
        const remaining = Math.max(5_000, budgetMs - (Date.now() - started));
        const limit = opts.perAttemptMs ? Math.min(remaining, opts.perAttemptMs) : remaining;
        const payload = opts.forModel ? opts.forModel(model, body) : body;
        res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(limit) });
      } catch (e: any) {
        sawTransient = true;
        lastReason = `${model} network: ${e}`;
        note(model, e?.name === "TimeoutError" || e?.name === "AbortError" ? "timed out" : "network error", t0);
        // A request that ran out of time will not do better on a second try
        // with the same model: move on to the next one.
        if (e?.name === "TimeoutError" || e?.name === "AbortError") break;
        continue;
      }
      if (res.ok) {
        const data: any = await res.json().catch(() => null);
        const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return { text, model };
        lastReason = `empty response from ${model}`;
        note(model, "empty answer", t0);
        break; // a different model may answer; the same one will not
      }
      const outcome = classifyGeminiStatus(res.status);
      const detail = await res.text().catch(() => "");
      note(model, String(res.status), t0);
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
  const trail = tried.length ? tried.join("; ") : lastReason;
  if (sawTransient) throw withDiag(new HttpsError("unavailable", BUSY_MESSAGE), `no answer within ${Math.round(budgetMs / 1000)}s: ${trail}`.slice(0, 600));
  throw withDiag(new HttpsError("internal", "The AI service did not return a result. Please try again."), `no result: ${trail}`.slice(0, 600));
}
