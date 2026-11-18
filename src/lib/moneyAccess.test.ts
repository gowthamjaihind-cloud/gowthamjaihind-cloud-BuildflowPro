import { describe, it, expect } from "vitest";
import { vi } from "vitest";
vi.mock("../store", () => ({ useAuthStore: () => undefined }));
import { canSeeMoney, MONEY_TABS, MONEY_COLLECTIONS } from "./moneyAccess";

describe("who sees money", () => {
  it("Site Engineers do not; managers and owners do", () => {
    expect(canSeeMoney("Site Engineer")).toBe(false);
    for (const r of ["Owner", "Admin", "Project Director", "Project Manager"]) expect(canSeeMoney(r)).toBe(true);
  });
  it("hides the money-only tabs and locks the money collections", () => {
    expect(MONEY_TABS).toEqual(expect.arrayContaining(["costs", "estimates", "labor", "insights"]));
    expect(MONEY_COLLECTIONS).toEqual(expect.arrayContaining(["costs", "ledger", "client_payments", "ra_bills", "estimates", "vendor_bills", "receipts"]));
    // Daily logs list labour roles from the rate cards: they must stay readable.
    expect(MONEY_COLLECTIONS).not.toContain("labor_rate_cards");
  });
});
