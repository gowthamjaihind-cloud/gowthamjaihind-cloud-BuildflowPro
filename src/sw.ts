// @ts-nocheck
import { precacheAndRoute } from "workbox-precaching";
import { BackgroundSyncPlugin } from "workbox-background-sync";
import { clientsClaim } from "workbox-core";

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST || []);

// Setup Background Sync
const bgSyncPlugin = new BackgroundSyncPlugin("construction-offline-queue", {
  maxRetentionTime: 24 * 60, // Retry for max of 24 Hours (specified in minutes)
});

// Since Firestore handles its own data sync, we might not need to route Firestore APIs through Workbox Sync,
// but just in case we have any custom REST endpoints.
// Firestore transactions fail immediately when offline, so we intercept that logically in UI
// and store in IndexedDB. When online, we retry. Custom logic inside the app is needed for Firestore.

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
