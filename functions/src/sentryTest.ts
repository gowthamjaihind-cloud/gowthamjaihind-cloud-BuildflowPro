import { onRequest } from "firebase-functions/v2/https";
import * as Sentry from "@sentry/node";
import { captureError, sentryEnabled } from "./sentry";

// TEMPORARY: end-to-end verification that backend Sentry receives events.
// Exposed as a plain HTTP endpoint so it can be triggered by simply opening
// the URL in a browser (mobile-friendly). It reports a deliberate error
// through captureError — exactly like the real server-side error paths
// (razorpayWebhook, cleanupAbandonedSignups) — then flushes so the event is
// sent before the function instance freezes.
//
// Remove this file (and its export in index.ts) once a test event is
// confirmed in the Sentry `sitetru-functions` project.
export const sentryTest = onRequest(
  { timeoutSeconds: 30, cors: true },
  async (req, res) => {
    const marker = `backend-sentry-test-${Date.now()}`;
    const error = new Error(`Sitetru backend Sentry test — ${marker}`);
    captureError(error, { source: "sentryTest", marker });

    // Sentry's transport is async; on Cloud Functions the instance can be
    // frozen right after the response, so explicitly flush before replying.
    let flushed = false;
    try {
      flushed = await Sentry.flush(3000);
    } catch {
      /* ignore */
    }

    res.status(200).json({
      sentryEnabled,
      flushed,
      marker,
      message: sentryEnabled
        ? `Sent a test error to Sentry (marker: ${marker}). Open the sitetru-functions project — the issue should appear within a few seconds.`
        : "SENTRY_DSN is not set on this deploy — backend Sentry is disabled, nothing was sent.",
    });
  },
);
