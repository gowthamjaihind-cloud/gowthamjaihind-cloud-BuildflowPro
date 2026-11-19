/**
 * Shared options for every callable function.
 *
 * App Check is initialised in the client (src/firebase.ts) and every request
 * already carries an attestation token, but nothing on the server has ever
 * checked it: all 27 callables accepted any caller holding a valid ID token.
 * That is the gap this closes — but deliberately not by default.
 *
 * Turning enforcement on blind is the kind of change that takes a product
 * down completely. If the reCAPTCHA v3 site key is not registered for this
 * Firebase project, or App Check has not been registered in the console, then
 * enforcing means every callable rejects every user at once — billing,
 * onboarding, invites, exports, all of it. There is no way to verify the key's
 * registration from the repository.
 *
 * So enforcement is a deploy-time switch rather than a code edit:
 *
 *   1. Firebase console → App Check → register the web app with reCAPTCHA v3,
 *      then leave the Functions/Firestore/Storage providers in MONITORING
 *      mode and watch the "verified requests" share climb as clients update.
 *   2. Only once that share is effectively 100%, redeploy functions with
 *      APPCHECK_ENFORCE=true. One variable covers all of them (28 today, and
 *      functions/src/appcheck.test.ts fails if a new one forgets to opt in).
 *   3. If anything regresses, redeploy without it. No code change either way.
 *
 * Monitoring first is the whole point: it tells you what enforcement WOULD
 * have broken, before it breaks it.
 */
export const APPCHECK_ENFORCED = process.env.APPCHECK_ENFORCE === "true";

/**
 * Spread into every `onCall` options object, before any per-function keys so
 * a function can still set its own timeout or memory:
 *
 *   onCall({ ...CALLABLE_OPTS, timeoutSeconds: 60 }, handler)
 */
/**
 * Where the functions run.
 *
 * Every callable used to have no region at all, which silently means
 * us-central1 — Iowa. The Telegram and WhatsApp handlers and the scheduled jobs
 * named asia-southeast1 explicitly, so the backend was split across the Pacific
 * and the user-facing half was on the wrong side of it. Signing up, buying a
 * plan, inviting a teammate and every AI call made a round trip from Madurai to
 * Iowa and back: roughly 250-300ms added per call, over site mobile data.
 *
 * Mumbai (asia-south1), beside the database (sitetru-india) and the file
 * bucket (sitetru-india-files), which moved there from Singapore and the US so
 * customer data is stored in India.
 *
 * The Firestore triggers run here too. A v2 Firestore trigger must sit in a
 * region compatible with its DATABASE's location; the database is in this
 * region, so they share it. (They used to run in us-central1 next to a
 * Singapore database, on the guess that the database was in the US.)
 */
export const REGION = "asia-south1";

export const CALLABLE_OPTS = {
  enforceAppCheck: APPCHECK_ENFORCED,
  region: REGION,
} as const;
