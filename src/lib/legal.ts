// Single source of truth for legal document versions and links.
// Bump TERMS_VERSION whenever the Terms or Privacy Policy change materially so
// that recorded consent can be compared against the current version.
export const TERMS_VERSION = "2026-08-15";

export const TERMS_URL = "/terms.html";
export const PRIVACY_URL = "/privacy.html";
export const REFUND_URL = "/refund.html";
export const SHIPPING_URL = "/shipping.html";
export const CONTACT_URL = "/contact.html";

// The consent captured pre-auth (at the sign-in gate) is stashed here and then
// written onto the user profile once we have a uid (see useAuth).
const CONSENT_KEY = "sitetru_pending_consent";

export function stashPendingConsent() {
  try {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ termsVersion: TERMS_VERSION, acceptedAt: new Date().toISOString() }),
    );
  } catch {
    /* storage may be unavailable in some embeds; consent still gates the click */
  }
}

export function readPendingConsent(): { termsVersion: string; acceptedAt: string } | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPendingConsent() {
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* ignore */
  }
}
