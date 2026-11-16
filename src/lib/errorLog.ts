/**
 * The last few errors this page hit, for "Something's not working?". Kept in
 * memory only, clipped, with anything that looks like a token or key removed,
 * so a support report can say what actually failed.
 */
const MAX = 15;
const errors: string[] = [];

export function scrubError(msg: unknown): string {
  return String(msg ?? "")
    .replace(/([?&](?:token|key|auth|sig|signature|access_token)=)[^&\s"']+/gi, "$1…")
    .replace(/\b(AIza[0-9A-Za-z_-]{20,}|rzp_(?:live|test)_[0-9A-Za-z]+|eyJ[0-9A-Za-z_-]{20,}\.[0-9A-Za-z._-]+)/g, "…")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function recordError(msg: unknown) {
  const s = scrubError(msg);
  if (!s) return;
  const stamped = `${new Date().toISOString().slice(11, 19)} ${s}`;
  if (errors[errors.length - 1]?.endsWith(s)) return; // the same error again
  errors.push(stamped);
  if (errors.length > MAX) errors.shift();
}

export const recentErrors = () => [...errors];

let installed = false;
export function installErrorLog() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => recordError(e.message || (e.error as any)?.message));
  window.addEventListener("unhandledrejection", (e) => recordError((e.reason as any)?.message || e.reason));
}
