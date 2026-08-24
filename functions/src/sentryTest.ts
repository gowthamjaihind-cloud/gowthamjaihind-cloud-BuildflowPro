import { onCall, HttpsError } from "firebase-functions/v2/https";
import { captureError, sentryEnabled } from "./sentry";

// TEMPORARY: end-to-end verification that backend Sentry receives events.
// Deliberately throws and reports through captureError, exactly like the real
// server-side error paths (razorpayWebhook, cleanupAbandonedSignups) do.
// Remove this file (and its export in index.ts) once a test event is confirmed
// in the Sentry `sitetru-functions` project.
export const sentryTest = onCall({ timeoutSeconds: 30 }, async (request) => {
  const marker = `backend-sentry-test-${Date.now()}`;
  const error = new Error(`Sitetru backend Sentry test — ${marker}`);
  captureError(error, {
    source: "sentryTest",
    marker,
    caller: request.auth?.uid ?? "anonymous",
  });
  // Surface status back to the caller so they can see the round-trip worked.
  throw new HttpsError(
    "internal",
    sentryEnabled
      ? `Test error sent to Sentry (marker: ${marker}). Check the sitetru-functions project.`
      : "SENTRY_DSN is not set on this deploy — backend Sentry is disabled, nothing was sent.",
  );
});
