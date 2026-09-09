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
 *      APPCHECK_ENFORCE=true. One variable covers all 27.
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
export const CALLABLE_OPTS = {
  enforceAppCheck: APPCHECK_ENFORCED,
} as const;
