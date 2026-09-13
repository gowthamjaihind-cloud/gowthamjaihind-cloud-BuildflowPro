import { describe, it, expect } from "vitest";
import { initialsOf } from "./initials";

describe("initialsOf", () => {
  it("takes first and last of a two-part name", () => {
    expect(initialsOf("Demo Owner")).toBe("DO");
  });

  it("handles the leading-initial form this app's users actually use", () => {
    // "B Gowtham", "R. Karthik" -- an initial then a given name. The dot is
    // punctuation, not a name part.
    expect(initialsOf("B Gowtham")).toBe("BG");
    expect(initialsOf("R. Karthik")).toBe("RK");
  });

  it("prefers first + last over the first two tokens", () => {
    // "K S Ravi" -> KR, not KS: the surname identifies, a middle initial does not.
    expect(initialsOf("K S Ravi")).toBe("KR");
    expect(initialsOf("K.S. Ravi")).toBe("KR");
  });

  it("returns one letter for a mononym rather than padding it", () => {
    expect(initialsOf("Gowtham")).toBe("G");
  });

  it("keeps a Tamil vowel sign attached to its consonant", () => {
    // Indexing with [0] would return the bare consonant and orphan the sign.
    const out = initialsOf("கோபால் ராஜ்");
    expect(Array.from(out).length).toBeGreaterThan(0);
    expect(out.startsWith("கோ")).toBe(true);
  });

  it("survives the empty cases without throwing", () => {
    expect(initialsOf("")).toBe("");
    expect(initialsOf(null)).toBe("");
    expect(initialsOf(undefined)).toBe("");
    expect(initialsOf("   ")).toBe("");
  });
});
