import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  seatLimitOf,
  seatsUsed,
  isMember,
  pendingInvites,
  seatState,
  seatLimitMessage,
} from "./seats";

const HERE = dirname(fileURLToPath(import.meta.url));

const org = (userLimit: any, memberCount: number) => ({
  userLimit,
  members: Object.fromEntries(Array.from({ length: memberCount }, (_, i) => [`u${i}`, "Viewer"])),
});

describe("seatLimitOf", () => {
  it("reads a positive number as the cap", () => {
    expect(seatLimitOf({ userLimit: 10 })).toBe(10);
    expect(seatLimitOf({ userLimit: 40 })).toBe(40);
  });

  it("treats an ABSENT userLimit as no cap, never as zero", () => {
    // The bug this prevents: grandfathered, operator and trialing orgs have no
    // userLimit field. Reading that as 0 locks the owner out of their own
    // workspace -- they cannot invite anyone, on a limit nobody set.
    expect(seatLimitOf({})).toBeNull();
    expect(seatLimitOf(null)).toBeNull();
    expect(seatLimitOf(undefined)).toBeNull();
    expect(seatLimitOf({ members: { a: "Owner" } })).toBeNull();
  });

  it("treats explicit null as unlimited (Enterprise)", () => {
    expect(seatLimitOf({ userLimit: null })).toBeNull();
  });

  it("ignores values that cannot be a cap", () => {
    for (const bad of [0, -5, NaN, Infinity, "10", {}, []]) {
      expect(seatLimitOf({ userLimit: bad })).toBeNull();
    }
  });

  it("floors a fractional limit rather than admitting a part-seat", () => {
    expect(seatLimitOf({ userLimit: 10.7 })).toBe(10);
  });
});

describe("seatsUsed", () => {
  it("counts the members map", () => {
    expect(seatsUsed(org(10, 3))).toBe(3);
    expect(seatsUsed({ members: {} })).toBe(0);
  });

  it("survives a missing or malformed members map", () => {
    for (const bad of [null, undefined, {}, { members: null }, { members: "nope" }, { members: 7 }]) {
      expect(seatsUsed(bad)).toBe(0);
    }
  });
});

describe("isMember", () => {
  it("recognises someone already in the org", () => {
    expect(isMember({ members: { abc: "Admin" } }, "abc")).toBe(true);
    expect(isMember({ members: { abc: "Admin" } }, "xyz")).toBe(false);
  });

  it("is not fooled by inherited object properties", () => {
    // `members.constructor` is truthy on any object; a naive `members[uid]`
    // check would treat a user called "constructor" as a member.
    expect(isMember({ members: {} }, "constructor")).toBe(false);
    expect(isMember({ members: {} }, "toString")).toBe(false);
  });

  it("handles a missing members map", () => {
    expect(isMember({}, "abc")).toBe(false);
    expect(isMember(null, "abc")).toBe(false);
  });
});

describe("pendingInvites", () => {
  const now = 1_700_000_000_000;
  const DAY = 24 * 60 * 60 * 1000;

  it("counts codes that can still be redeemed", () => {
    expect(pendingInvites([{ expiresAt: now + DAY }, { expiresAt: now + 2 * DAY }], now)).toBe(2);
  });

  it("ignores codes already used", () => {
    expect(pendingInvites([{ used: true, expiresAt: now + DAY }], now)).toBe(0);
  });

  it("ignores codes that have expired", () => {
    // Counting a lapsed invite would permanently shrink the org's capacity:
    // every abandoned code would cost a seat nobody is sitting in.
    expect(pendingInvites([{ expiresAt: now - DAY }], now)).toBe(0);
  });

  it("counts a code with no expiry, since it never stops being redeemable", () => {
    expect(pendingInvites([{}], now)).toBe(1);
    expect(pendingInvites([{ expiresAt: 0 }], now)).toBe(1);
  });

  it("survives a malformed list", () => {
    expect(pendingInvites([])).toBe(0);
    expect(pendingInvites(undefined as any)).toBe(0);
    expect(pendingInvites([null, undefined] as any, now)).toBe(0);
  });
});

describe("seatState", () => {
  it("allows a join while there is room", () => {
    expect(seatState(org(10, 3)).ok).toBe(true);
    expect(seatState(org(10, 3)).remaining).toBe(7);
  });

  it("allows the seat that exactly fills the plan", () => {
    // Off-by-one guard: a 10-seat plan must hold ten people, not nine.
    const s = seatState(org(10, 9));
    expect(s.ok).toBe(true);
    expect(s.remaining).toBe(1);
  });

  it("refuses the seat past the limit", () => {
    expect(seatState(org(10, 10)).ok).toBe(false);
    expect(seatState(org(10, 10)).remaining).toBe(0);
  });

  it("refuses a full org even if it is somehow over its cap already", () => {
    const s = seatState(org(10, 14));
    expect(s.ok).toBe(false);
    expect(s.remaining).toBe(0); // never negative
  });

  it("RESERVES unredeemed invites at mint time", () => {
    // The real hole this closes: 9 of 10 seats used, mint ten codes, and every
    // code is valid for 14 days. Without reserving the pending ones the org
    // lands at 19 members on a 10-seat plan and nothing ever complained.
    expect(seatState(org(10, 9), { reserved: 0 }).ok).toBe(true);
    expect(seatState(org(10, 9), { reserved: 1 }).ok).toBe(false);
    expect(seatState(org(10, 5), { reserved: 4 }).ok).toBe(true);
    expect(seatState(org(10, 5), { reserved: 5 }).ok).toBe(false);
  });

  it("never caps an org with no limit set", () => {
    expect(seatState(org(null, 500)).ok).toBe(true);
    expect(seatState(org(undefined, 500)).ok).toBe(true);
    expect(seatState(org(null, 500)).remaining).toBeNull();
  });

  it("can be asked about more than one seat", () => {
    expect(seatState(org(10, 8), { adding: 2 }).ok).toBe(true);
    expect(seatState(org(10, 8), { adding: 3 }).ok).toBe(false);
  });

  it("treats adding zero seats as always fitting", () => {
    expect(seatState(org(10, 10), { adding: 0 }).ok).toBe(true);
  });
});

describe("seatLimitMessage", () => {
  it("names the actual limit, so the owner knows which plan they are on", () => {
    const msg = seatLimitMessage(seatState(org(10, 10)), "invite");
    expect(msg).toContain("10");
    expect(msg).toMatch(/seats/);
  });

  it("reads differently for the person joining than for the one inviting", () => {
    const full = seatState(org(40, 40));
    expect(seatLimitMessage(full, "invite")).toContain("invite anyone else");
    expect(seatLimitMessage(full, "join")).toContain("join");
  });
});

describe("the invite functions actually use this", () => {
  const src = readFileSync(join(HERE, "./invites.ts"), "utf8");

  it("checks seats when minting a code AND when redeeming one", () => {
    // A guard that exists but is never called is the failure mode this repo has
    // already hit: userLimit was written, advertised, and read by nobody.
    const createBody = src.slice(src.indexOf("export const createInvite"), src.indexOf("export const acceptInvite"));
    const acceptBody = src.slice(src.indexOf("export const acceptInvite"));
    expect(createBody).toMatch(/seatState\(/);
    expect(acceptBody).toMatch(/seatState\(/);
  });

  it("reserves pending invites at mint time, and not at redeem time", () => {
    const createBody = src.slice(src.indexOf("export const createInvite"), src.indexOf("export const acceptInvite"));
    const acceptBody = src.slice(src.indexOf("export const acceptInvite"));
    // Mint time counts the outstanding codes and PASSES them to seatState.
    // Matching the computation alone is not enough: `reserved` can be worked
    // out and then never handed over, which leaves the hole wide open while
    // every assertion still reads green. So the reservation has to appear
    // inside the seatState argument itself.
    expect(createBody).toMatch(/pendingInvites\(/);
    expect(createBody).toMatch(/seatState\([^;]*\{[^}]*\breserved\b[^}]*\}/);
    // Redeem time must NOT reserve: the code being redeemed is itself one of
    // the pending ones, so counting them again would charge it twice and an
    // org on its last seat could never fill it.
    expect(acceptBody).not.toMatch(/pendingInvites\(/);
  });

  it("lets an existing member through without spending a seat", () => {
    const acceptBody = src.slice(src.indexOf("export const acceptInvite"));
    expect(acceptBody).toMatch(/isMember\(/);
  });
});
