import { describe, it, expect } from "vitest";
import { candidateOrgIds, verifyOrgIds, claimsChanged } from "./claimsPolicy";

describe("candidateOrgIds", () => {
  it("merges the mirror with the active org and de-duplicates", () => {
    expect(candidateOrgIds(["a", "b"], "b")).toEqual(["a", "b"]);
    expect(candidateOrgIds(["a"], "c")).toEqual(["a", "c"]);
  });

  it("survives a mirror that is missing, junk, or full of junk", () => {
    expect(candidateOrgIds(undefined, undefined)).toEqual([]);
    expect(candidateOrgIds("not-an-array", null)).toEqual([]);
    expect(candidateOrgIds([1, "", null, {}, "ok"], undefined)).toEqual(["ok"]);
  });

  it("caps the list so a bloated profile cannot fan out reads", () => {
    const many = Array.from({ length: 200 }, (_, i) => `org${i}`);
    expect(candidateOrgIds(many, undefined, 50)).toHaveLength(50);
  });
});

describe("verifyOrgIds", () => {
  // This is the whole point of the module.
  it("drops an org the user claimed in their own profile but is not a member of", () => {
    const members: Record<string, string> = { mine: "Owner" };
    expect(verifyOrgIds(["mine", "someone-elses"], (id) => members[id])).toEqual(["mine"]);
  });

  it("accepts any role, not just Owner", () => {
    const members: Record<string, string> = { a: "Viewer", b: "Admin", c: "Manager" };
    expect(verifyOrgIds(["a", "b", "c"], (id) => members[id])).toEqual(["a", "b", "c"]);
  });

  it("treats an absent or empty role as not a member", () => {
    const members: Record<string, unknown> = { a: undefined, b: "", c: null, d: "Viewer" };
    expect(verifyOrgIds(["a", "b", "c", "d"], (id) => members[id])).toEqual(["d"]);
  });

  it("returns nothing when the org vouches for nobody", () => {
    expect(verifyOrgIds(["a", "b"], () => undefined)).toEqual([]);
  });

  it("sorts, so an unchanged membership never looks changed", () => {
    const members: Record<string, string> = { z: "Owner", a: "Viewer" };
    expect(verifyOrgIds(["z", "a"], (id) => members[id])).toEqual(["a", "z"]);
    expect(verifyOrgIds(["a", "z"], (id) => members[id])).toEqual(["a", "z"]);
  });
});

describe("claimsChanged", () => {
  it("is false when the same set arrives in a different order", () => {
    expect(claimsChanged(["b", "a"], ["a", "b"])).toBe(false);
  });

  it("is true on a first mint, an addition, and a revocation", () => {
    expect(claimsChanged(undefined, ["a"])).toBe(true);
    expect(claimsChanged(["a"], ["a", "b"])).toBe(true);
    expect(claimsChanged(["a", "b"], ["a"])).toBe(true);
  });

  it("is true when the last org is revoked, so the token gets refreshed", () => {
    expect(claimsChanged(["a"], [])).toBe(true);
    expect(claimsChanged([], [])).toBe(false);
  });
});
