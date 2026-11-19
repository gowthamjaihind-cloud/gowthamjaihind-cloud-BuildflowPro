/**
 * The app's file bucket, in Mumbai (see firebase-applet-config.json ->
 * storageBucket). Its own module, with no imports, because index.ts reads it
 * BEFORE admin.initializeApp(): importing it from ./db would open Firestore
 * first and crash every function on start.
 */
export const STORAGE_BUCKET = process.env.STORAGE_BUCKET || "sitetru-india-files";
