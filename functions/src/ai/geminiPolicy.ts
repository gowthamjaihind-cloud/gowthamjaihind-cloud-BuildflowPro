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

/**
 * Model names, in one place.
 *
 * Google retired the 1.5, 2.0 and 2.5 Flash families for this key in
 * November 2026: each answered 404 "no longer available ... use
 * gemini-3.8-flash / gemini-3.5-flash-lite". Every list in the backend had
 * those first, so bill scans spent their time on dead names and then timed
 * out on gemini-flash-latest. The operator's AI self-test (19 Nov) showed
 * gemini-flash-lite-latest answering a real bot request in 1.1s.
 *
 * Lite first everywhere: it is the one confirmed fast. gemini-3.8-flash is
 * Google's named replacement for full Flash; it follows as the fallback until
 * the self-test shows its speed. geminiModels.test.ts keeps retired names out.
 */
export const LITE_MODELS = ["gemini-3.5-flash-lite", "gemini-flash-lite-latest"];
export const FULL_MODELS = ["gemini-3.8-flash"];

/** Gemini models to try, best first. */
export const MODELS = [...LITE_MODELS, ...FULL_MODELS];

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
