import * as Sentry from "@sentry/node";

// Sentry error tracking (Cloud Functions). The DSN is read from the SENTRY_DSN
// environment variable (set as a functions env var / secret). Until it's set,
// every export here is a no-op, so functions behave exactly as before.
const DSN = process.env.SENTRY_DSN || "";

export const sentryEnabled = !!DSN;

let initialized = false;

export function initSentry() {
  if (!DSN || initialized) return;
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV || "production",
    // Error tracking only — no performance tracing, to keep cost/overhead low.
    tracesSampleRate: 0,
  });
  initialized = true;
}

// Report an error we caught server-side, with optional context.
export function captureError(error: unknown, context?: Record<string, any>) {
  if (!DSN) return;
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    /* never let error reporting throw */
  }
}

// Wrap an async body so any unexpected throw is reported to Sentry and then
// rethrown unchanged (callers still get the original error / HttpsError).
export async function withSentry<T>(
  fn: () => Promise<T>,
  context?: Record<string, any>,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    captureError(e, context);
    throw e;
  }
}
