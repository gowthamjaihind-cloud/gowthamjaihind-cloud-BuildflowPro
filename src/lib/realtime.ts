/**
 * How long a realtime subscription may stay silent before the UI stops waiting.
 *
 * `onSnapshot` has three outcomes, not two. It calls back with data, or it
 * calls back with an error -- or, when the backend simply cannot be reached,
 * it calls back with NEITHER and retries forever. Every hook here was written
 * for the first two, so an unreachable backend left `loading` true for good and
 * the component rendered nothing at all: no spinner, no message, no panel.
 *
 * That is worst exactly where it happened. PlanSummary returns null while
 * loading, so an owner on a patchy site connection opened Settings and found
 * the whole plan-and-billing section missing -- which is the page you go to
 * when your subscription has lapsed and you need to pay.
 *
 * Ten seconds matches when the Firestore SDK itself gives up and logs "Could
 * not reach Cloud Firestore backend", so the UI and the console agree about
 * when something is wrong rather than the user seeing a blank panel ten
 * seconds before any explanation exists.
 *
 * Giving up is not permanent: the SDK keeps retrying underneath, and the next
 * snapshot to arrive clears the flag and fills the panel in.
 */
export const SNAPSHOT_TIMEOUT_MS = 10_000;
