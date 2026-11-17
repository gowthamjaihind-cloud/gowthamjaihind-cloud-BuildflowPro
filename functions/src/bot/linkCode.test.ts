import { describe, it, expect } from "vitest";
import { newMemberCode, codeUsable } from "../bot/linkCode";

describe("member Telegram links", () => {
  it("are 20 random characters the bot accepts as they are", () => {
    const a = newMemberCode();
    expect(a).toMatch(/^[A-Z0-9]{20}$/);
    expect(newMemberCode()).not.toBe(a);
  });
  it("never expire, but stop working once used or revoked", () => {
    const now = Date.parse("2027-06-01T00:00:00Z");
    expect(codeUsable({ kind: "member", used: false }, now)).toBe(true);
    expect(codeUsable({ kind: "member", used: true }, now)).toBe(false);
    expect(codeUsable({ kind: "member", used: false, revoked: true }, now)).toBe(false);
  });
  it("leave a person's own 15-minute code expiring as before", () => {
    const now = Date.now();
    expect(codeUsable({ used: false, expiresAt: now + 60_000 }, now)).toBe(true);
    expect(codeUsable({ used: false, expiresAt: now - 1 }, now)).toBe(false);
    expect(codeUsable({ used: false }, now)).toBe(false);
  });
});
