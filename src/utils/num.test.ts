import { describe, expect, it } from "vitest";
import { round2, round3, money, moneyCompact, moneyShort, qty } from "./num";

// These formatters decide what a customer reads as money. A wrong figure here
// is a trust bug, not a cosmetic one, so the edge cases are pinned.

describe("round2 / round3", () => {
  it("kills the float noise that division produces", () => {
    // The value that started this: a total divided by a quantity.
    expect(round2(64.2936862546795)).toBe(64.29);
    expect(round3(64.2936862546795)).toBe(64.294);
  });

  it("treats anything non-numeric as zero rather than NaN", () => {
    for (const bad of [NaN, null, undefined, "abc", {}, []]) {
      expect(round2(bad)).toBe(0);
      expect(round3(bad)).toBe(0);
    }
  });

  it("reads numeric strings", () => {
    expect(round2("1234.567")).toBe(1234.57);
  });
});

describe("money — always two decimals", () => {
  it("pads whole rupees", () => {
    expect(money(412)).toBe("412.00");
    expect(money(0)).toBe("0.00");
  });

  it("groups in the Indian system, not thousands", () => {
    // 53,95,183 — not 5,395,183.
    expect(money(5395183)).toBe("53,95,183.00");
    expect(money(10761000)).toBe("1,07,61,000.00");
  });

  it("keeps the sign", () => {
    expect(money(-5395183)).toBe("-53,95,183.00");
  });

  it("never renders a lone decimal", () => {
    expect(money(33633362.2)).toBe("3,36,33,362.20");
  });
});

describe("moneyCompact — whole rupees stay clean", () => {
  it("drops decimals when there are none", () => {
    expect(moneyCompact(412)).toBe("412");
    expect(moneyCompact(5395183)).toBe("53,95,183");
  });

  it("shows BOTH decimals when there are paise", () => {
    // Regression: this returned "3,36,33,362.2", which is not a money string
    // and reads as a different number.
    expect(moneyCompact(33633362.2)).toBe("3,36,33,362.20");
    expect(moneyCompact(0.5)).toBe("0.50");
  });
});

describe("moneyShort — lakh and crore, the way it is said", () => {
  it("uses crore above a crore", () => {
    expect(moneyShort(10761000)).toBe("1.08Cr");
  });

  it("uses lakh above a lakh", () => {
    expect(moneyShort(5395183)).toBe("53.95L");
    expect(moneyShort(100000)).toBe("1L");
  });

  it("never uses thousands notation — nobody says 1.23K rupees", () => {
    expect(moneyShort(1234.5)).toBe("1,234.50");
    expect(moneyShort(-54000)).toBe("-54,000");
  });

  it("keeps the sign on large values", () => {
    expect(moneyShort(-5395183)).toBe("-53.95L");
  });

  it("is safe on junk", () => {
    expect(moneyShort(undefined)).toBe("0");
    expect(moneyShort(NaN)).toBe("0");
  });
});

describe("qty — up to three decimals, none forced", () => {
  it("does not pad whole quantities", () => {
    expect(qty(412)).toBe("412");
  });

  it("keeps partial units without float noise", () => {
    expect(qty(64.2936862546795)).toBe("64.294");
    expect(qty(3.42)).toBe("3.42");
  });
});
