import * as admin from "firebase-admin";
import { initSentry } from "./sentry";

// Start error tracking as early as possible (no-op until SENTRY_DSN is set).
initSentry();

admin.initializeApp();
// Firestore access goes through ./db, which binds to the app's named database
// and applies its own settings. Never call admin.firestore() directly.

export * from "./projects";
export * from "./approvals";
export * from "./notifications";
export * from "./audit";
export * from "./ai";
export * from "./dailyLogs";
export * from "./goodsReceipt";
export * from "./telegram";

/**
 * The WhatsApp lane, registered ONLY when it has been configured.
 *
 * This is not a feature flag for taste, it is a deploy-blocking hazard. Its
 * functions declare their credentials with `defineSecret`, and the Firebase CLI
 * refuses to deploy the ENTIRE codebase when any declared secret has no value
 * in Secret Manager:
 *
 *     Error: In non-interactive mode but have no value for the secret
 *     WHATSAPP_VERIFY_TOKEN
 *
 * So an optional integration nobody had set up yet took the Telegram bot, the
 * AI endpoints and every trigger down with it -- which is exactly what happened
 * on the first deploy to main after this shipped. An unconfigured integration
 * must cost nothing.
 *
 * To turn it on: set WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
 * WHATSAPP_VERIFY_TOKEN and WHATSAPP_APP_SECRET with
 * `firebase functions:secrets:set`, then put WHATSAPP_ENABLED=true in
 * functions/.env. Until then these functions are simply not deployed.
 *
 * A conditional require rather than `export *`, because an export cannot be
 * conditional -- and the point is that the module, and therefore its
 * `defineSecret` calls, is never loaded at all when the flag is off.
 */
if (process.env.WHATSAPP_ENABLED === "true") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Object.assign(module.exports, require("./whatsapp"));
}
export * from "./setupOrg";
export * from "./createOrg";
export * from "./invites";
export * from "./billing";
export * from "./dataRights";
export * from "./razorpay";
export * from "./cleanup";
export * from "./planChange";
export * from "./claims";
