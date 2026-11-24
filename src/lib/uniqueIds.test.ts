import { describe, it, expect } from "vitest";
import { uniqueIds } from "./uniqueIds";

describe("row ids for lists", () => {
  it("numbers repeats so every key is unique, and leaves the rest alone", () => {
    const rows = uniqueIds([{ id: "log1-mason" }, { id: "log1-mason" }, { id: "log2-helper" }, { id: "log1-mason" }]);
    expect(rows.map((r) => r.id)).toEqual(["log1-mason", "log1-mason#2", "log2-helper", "log1-mason#3"]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
});
