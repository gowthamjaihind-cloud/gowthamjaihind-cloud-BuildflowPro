import * as Sentry from "@sentry/react";

// Sentry error tracking (frontend). The DSN is supplied at build time via
// VITE_SENTRY_DSN. A Sentry DSN is safe to ship in client code. Until a DSN is
// configured, every call here is a no-op, so the app runs unchanged.
const DSN = (import.meta as any).env?.VITE_SENTRY_DSN || "";

export const sentryEnabled = !!DSN;

export function initSentry() {
  if (!DSN) return; // no DSN yet → do nothing
  Sentry.init({
    dsn: DSN,
    environment: (import.meta as any).env?.MODE || "production",
    // Error tracking only — no performance tracing or session replay, to keep
    // the bundle light and avoid extra quota cost. Raise tracesSampleRate later
    // if you want performance data.
    tracesSampleRate: 0,
    // Drop noisy, non-actionable browser errors.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications.",
      "Non-Error promise rejection captured",
    ],
  });
}

// Attach (or clear) the signed-in user so errors are grouped by account.
export function setSentryUser(user: { uid?: string; email?: string | null } | null) {
  if (!DSN) return;
  if (user?.uid) Sentry.setUser({ id: user.uid, email: user.email || undefined });
  else Sentry.setUser(null);
}

// Manually report a caught error (with optional context tags).
export function captureError(error: unknown, context?: Record<string, any>) {
  if (!DSN) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
