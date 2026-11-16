import { doc, getDocFromServer, waitForPendingWrites, terminate, clearIndexedDbPersistence } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "../firebase";
import { recentErrors } from "./errorLog";

/**
 * "Something's not working?": the checks that only the device can run, and
 * the fixes the app can safely make by itself. The workspace's half (plan,
 * read-only projects, AI allowance, Telegram) comes from helpDiagnose.
 *
 * Every fix is undo-safe: none deletes anything on the server, and "Clear
 * saved data" refuses while there are changes not yet uploaded.
 */

export type CheckStatus = "ok" | "warn" | "fail" | "info";
export type FixId = "update" | "reconnect" | "clearCache" | "openBilling" | "recheckBilling" | "openTelegram" | "goOnline";
export interface Check { id: string; label: string; status: CheckStatus; detail: string; fix?: FixId }

export const FIX_LABELS: Record<FixId, string> = {
  update: "Update the app",
  reconnect: "Sign in again",
  clearCache: "Clear saved data",
  openBilling: "Open Projects & Billing",
  recheckBilling: "Re-check payment",
  openTelegram: "Open Telegram settings",
  goOnline: "Try again",
};

const within = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p.then((v) => ({ ok: true as const, v })), new Promise<{ ok: false }>((r) => setTimeout(() => r({ ok: false }), ms))]);

/** The main script a page of the app loads: changes with every release. */
export const bundleOf = (html: string) => (/\/assets\/index-[\w-]+\.js/.exec(html) || [""])[0];

export function deviceSummary(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : "other";
  const browser = /CriOS|Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : /Firefox/.test(ua) ? "Firefox" : "other";
  const installed = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone ? "installed app" : "browser tab";
  return `${os} · ${browser} · ${installed} · ${window.innerWidth}×${window.innerHeight} · ${navigator.onLine ? "online" : "offline"}`;
}

export async function runDeviceChecks(): Promise<Check[]> {
  const out: Check[] = [];

  // Internet, and whether this is the latest version of the app.
  let freshHtml = "";
  if (!navigator.onLine) {
    out.push({ id: "net", label: "Internet", status: "fail", detail: "This device is offline. Changes are kept on the device and upload when it reconnects.", fix: "goOnline" });
  } else {
    const r = await within(fetch(`/index.html?check=${Date.now()}`, { cache: "no-store" }).then((x) => (x.ok ? x.text() : "")), 8000);
    if (r.ok && r.v) {
      freshHtml = r.v;
      out.push({ id: "net", label: "Internet", status: "ok", detail: "Connected." });
    } else {
      out.push({ id: "net", label: "Internet", status: "fail", detail: "Sitetru could not be reached. The connection may be weak or blocked.", fix: "goOnline" });
    }
  }
  const running = bundleOf(document.documentElement.innerHTML) || [...document.scripts].map((s) => bundleOf(s.src)).find(Boolean) || "";
  const latest = bundleOf(freshHtml);
  if (running && latest) {
    out.push(running === latest
      ? { id: "version", label: "App version", status: "ok", detail: "You have the latest version." }
      : { id: "version", label: "App version", status: "warn", detail: "A newer version of the app is available. Older versions can show problems that are already fixed.", fix: "update" });
  }

  // Sign-in.
  const user = auth.currentUser;
  if (!user) {
    out.push({ id: "auth", label: "Sign-in", status: "fail", detail: "You are not signed in.", fix: "reconnect" });
  } else if (navigator.onLine) {
    const r = await within(user.getIdToken(true), 8000);
    out.push(r.ok
      ? { id: "auth", label: "Sign-in", status: "ok", detail: `Signed in as ${user.email || "you"}.` }
      : { id: "auth", label: "Sign-in", status: "fail", detail: "Your sign-in could not be refreshed.", fix: "reconnect" });
  }

  // Reaching your data, and changes still waiting to upload.
  if (user && navigator.onLine) {
    const r = await within(getDocFromServer(doc(db, "users", user.uid)), 8000).catch(() => ({ ok: false as const }));
    out.push(r.ok
      ? { id: "data", label: "Data connection", status: "ok", detail: "Your data loads from the server." }
      : { id: "data", label: "Data connection", status: "fail", detail: "Your data could not be loaded from the server just now. The app shows the copy saved on this device." , fix: "reconnect" });
  }
  const synced = await within(waitForPendingWrites(db), 2500).catch(() => ({ ok: false as const }));
  out.push(synced.ok
    ? { id: "sync", label: "Unsaved changes", status: "ok", detail: "Everything you entered has been uploaded." }
    : { id: "sync", label: "Unsaved changes", status: "warn", detail: "Some changes are saved on this device but not uploaded yet. Keep the app open with internet until they upload." });

  // Space on the device.
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota && est.usage && est.usage / est.quota > 0.9) {
      out.push({ id: "space", label: "Device storage", status: "warn", detail: "This device is almost out of space for the app's saved data.", fix: "clearCache" });
    }
  } catch {
    /* not available */
  }

  const errs = recentErrors();
  if (errs.length) out.push({ id: "errors", label: "Errors on this screen", status: "info", detail: `${errs.length} error(s) recorded in this session. The last: ${errs[errs.length - 1]}` });
  return out;
}

/** Load the latest version: drop the offline copy of the app and reload. Data is untouched. */
export async function fixUpdate() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await caches?.keys?.()) || [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } finally {
    location.reload();
  }
}

/** Refresh the sign-in; if that fails, sign out so the next sign-in starts clean. */
export async function fixReconnect(): Promise<"ok" | "signedOut"> {
  const r = await within(auth.currentUser ? auth.currentUser.getIdToken(true) : Promise.reject(new Error("no user")), 8000).catch(() => ({ ok: false as const }));
  if (r.ok) return "ok";
  await signOut(auth).catch(() => {});
  location.reload();
  return "signedOut";
}

/**
 * Forget the copy of the data saved on this device and load it fresh. Refused
 * while changes are waiting to upload: clearing then would lose them.
 */
export async function fixClearCache(): Promise<"refused" | "done"> {
  const synced = await within(waitForPendingWrites(db), 3000).catch(() => ({ ok: false as const }));
  if (!synced.ok) return "refused";
  await terminate(db);
  await clearIndexedDbPersistence(db).catch(() => {});
  await fixUpdate();
  return "done";
}
