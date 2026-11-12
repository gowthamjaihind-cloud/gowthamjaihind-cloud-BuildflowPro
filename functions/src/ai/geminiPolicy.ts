/**
 * How to treat a Gemini HTTP status. Pure, so it is testable without fetch.
 *
 *   next      the model is not available to this key: try the next model
 *   retry     overloaded or rate-limited: wait, retry, then the next model
 *   fatal     our request or our key is wrong: stop, retrying cannot help
 *
 * Before this, only 404 moved on and everything else surfaced at once, so a
 * routine "this model is currently experiencing high demand" (503) failed the
 * scan outright -- while three other models sat unused -- and showed the
 * customer Google's raw JSON.
 */
export type GeminiOutcome = "next" | "retry" | "fatal";

export function classifyGeminiStatus(status: number): GeminiOutcome {
  if (status === 404) return "next";
  if (status === 408 || status === 429 || status >= 500) return "retry";
  return "fatal";
}

/** Gemini models to try, best first. */
export const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest", "gemini-1.5-flash"];

/** Waits between attempts on the SAME model, ms. Two retries, then the next model. */
export const BACKOFF_MS = [1500, 4000];

/**
 * Give up retrying past this, ms. The callables time out at 120s and a vision
 * read of a large PDF can take 20s on its own, so the retry budget stops well
 * short of the timeout and the caller gets a clean "busy" message instead of a
 * deadline error.
 */
export const RETRY_BUDGET_MS = 70_000;

/** What the customer sees when every model is busy. No raw service output. */
export const BUSY_MESSAGE =
  "The AI service is busy right now. Please try again in a minute — this attempt was not counted against your monthly AI limit.";
