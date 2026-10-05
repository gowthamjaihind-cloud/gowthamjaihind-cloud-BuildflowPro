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
 * Singapore rather than Mumbai (asia-south1) because the rest of the backend is
 * already there and splitting it again would be the same mistake in a new place.
 *
 * NOT applied to the Firestore triggers. A v2 Firestore trigger has to sit in a
 * region compatible with the DATABASE's location, which is a console setting
 * this repository cannot see — and the fact that those triggers deploy and run
 * in us-central1 today is good evidence the database is US-located. Moving them
 * on that guess would break them, and unlike a callable nobody waits on a
 * trigger, so there is no latency to win. They stay put deliberately.
 */
export const REGION = "asia-southeast1";

export const CALLABLE_OPTS = {
  enforceAppCheck: APPCHECK_ENFORCED,
  region: REGION,
} as const;
