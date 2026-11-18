import { useAuthStore } from "../store";

/**
 * Who sees the company's money: costs, budgets, vendor bills and payments,
 * client payments, RA bills, estimates and margins.
 *
 * Site Engineers do not. They log work, raise and receive material, and see
 * quantities -- not what things cost or what the company earns. The same line
 * is drawn in three places, keep them together:
 *   - firestore.rules  `canSeeMoney(orgId)` -- the real lock on the data
 *   - here             -- hides the screens, tiles and columns, and keeps the
 *                         data loaders from asking for what the rules deny
 *   - functions/src/actions/permissions.ts  `ask.money` -- the Telegram bot
 */
export const MONEY_HIDDEN_ROLES = ["Site Engineer"];

/** Project tabs that are about money only. */
export const MONEY_TABS = ["insights", "labor", "costs", "estimates"];

/** Project collections the rules keep from roles that do not see money. */
export const MONEY_COLLECTIONS = ["costs", "receipts", "vendor_bills", "ledger", "client_payments", "ra_bills", "estimates"];

export const canSeeMoney = (role?: string | null) => !MONEY_HIDDEN_ROLES.includes(String(role || ""));

export function useCanSeeMoney(): boolean {
  const role = useAuthStore((s) => s.user?.role);
  return canSeeMoney(role);
}
