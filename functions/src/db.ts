import { getFirestore } from "firebase-admin/firestore";

/**
 * Shared Firestore instance for ALL Cloud Functions.
 *
 * The app stores its data in a NAMED Firestore database
 * (see firebase-applet-config.json -> firestoreDatabaseId), not "(default)".
 * admin.firestore() binds to "(default)" — a different, empty database — so any
 * function using it silently reads and writes the wrong place.
 *
 * Always import { db } from here instead of calling admin.firestore().
 * (admin.firestore.FieldValue / Timestamp are static helpers and remain fine.)
 */
export const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID ||
  "ai-studio-97ffdc85-b348-4a76-9ede-baa3db65adee";

export const db = getFirestore(FIRESTORE_DATABASE_ID);

// Matches the web app's client config so writes containing undefined fields don't throw.
db.settings({ ignoreUndefinedProperties: true });
