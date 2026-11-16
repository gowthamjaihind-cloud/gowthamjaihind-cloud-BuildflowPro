import type { HelpContext } from "./knowledge";

/**
 * Workspace checks for the in-app "Something's not working?" diagnosis.
 * Pure: takes the facts help/index.ts reads on the server and says what
 * looks wrong, in the user's terms, with the fix the app can offer.
 * The device-side checks (internet, app version, sign-in, sync) run in
 * the browser: src/lib/diagnostics.ts.
 */

export type CheckStatus = "ok" | "warn" | "fail" | "info";
export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** A fix the app offers as a button; see src/lib/diagnostics.ts. */
  fix?: "openBilling" | "recheckBilling" | "openTelegram";
}

export function workspaceChecks(f: HelpContext, now = Date.now()): Check[] {
  const out: Check[] = [];
  const st = String(f.status || "");
  if (st === "expired" || st === "canceled") {
    out.push({ id: "plan", label: "Subscription", status: "fail", detail: `The workspace's subscription has ${st === "expired" ? "ended" : "been cancelled"}, so the app is paused until it is renewed. Nothing has been deleted.`, fix: "openBilling" });
  } else if (st === "past_due") {
    out.push({ id: "plan", label: "Subscription", status: "warn", detail: `The last renewal payment did not go through. Pay before ${f.graceEndsAt || "the grace period ends"} to avoid a pause. If you have already paid, re-check.`, fix: "recheckBilling" });
  } else if (st === "trialing") {
    out.push({ id: "plan", label: "Subscription", status: "ok", detail: `Free trial${f.trialEndsAt ? `, ends ${f.trialEndsAt}` : ""}.` });
  } else if (st === "active") {
    out.push({ id: "plan", label: "Subscription", status: f.cancelAtPeriodEnd ? "warn" : "ok", detail: f.cancelAtPeriodEnd ? `Active, set to end on ${f.paidUntil || "the end of the paid period"}.` : `Active${f.paidUntil ? `, paid until ${f.paidUntil}` : ""}.`, ...(f.cancelAtPeriodEnd ? { fix: "openBilling" as const } : {}) });
  } else if (st) {
    out.push({ id: "plan", label: "Subscription", status: "ok", detail: "No billing on this workspace." });
  }
  if (f.lockedProjects?.length) {
    out.push({ id: "locked", label: "Read-only projects", status: "warn", detail: `${f.lockedProjects.join(", ")} ${f.lockedProjects.length === 1 ? "is" : "are"} read-only because ${f.lockedProjects.length === 1 ? "its" : "their"} extra-project subscription ended. Subscribe again to edit.`, fix: "openBilling" });
  }
  if (typeof f.aiAllowance === "number" && (f.aiUsedThisMonth || 0) >= f.aiAllowance) {
    out.push({ id: "ai", label: "AI allowance", status: "warn", detail: `All ${f.aiAllowance} AI reads for this month are used, so bill reading and typed bot logs pause until next month or an upgrade.`, fix: "openBilling" });
  } else if (typeof f.aiAllowance === "number") {
    out.push({ id: "ai", label: "AI allowance", status: "ok", detail: `${f.aiUsedThisMonth || 0} of ${f.aiAllowance} used this month.` });
  }
  out.push(f.telegramLinked
    ? { id: "telegram", label: "Telegram bot", status: "ok", detail: "Your Telegram is connected." }
    : { id: "telegram", label: "Telegram bot", status: "info", detail: "Your Telegram is not connected to Sitetru.", fix: "openTelegram" });
  void now;
  return out;
}

/** Device checks sent by the browser, checked before they reach the model or a report. */
export function cleanChecks(raw: unknown): Check[] {
  if (!Array.isArray(raw)) return [];
  const ok = new Set(["ok", "warn", "fail", "info"]);
  return raw
    .filter((c: any) => c && typeof c.label === "string" && ok.has(c.status))
    .slice(0, 20)
    .map((c: any) => ({ id: String(c.id || "").slice(0, 30), label: String(c.label).slice(0, 60), status: c.status, detail: String(c.detail || "").slice(0, 300), ...(typeof c.fix === "string" ? { fix: c.fix.slice(0, 30) as any } : {}) }));
}
