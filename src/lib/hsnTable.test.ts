import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { lookupTax } from "./hsnTable";

describe("checked HSN / GST list", () => {
  it("knows common materials", () => {
    expect(lookupTax("OPC 53 Grade Cement")).toMatchObject({ hsn: "2523", gstRate: 18 });
    expect(lookupTax("TMT Bar 12mm Fe500")).toMatchObject({ hsn: "7214", gstRate: 18 });
    expect(lookupTax("Binding wire 18G")).toMatchObject({ hsn: "7217" });
    expect(lookupTax("River sand")).toMatchObject({ hsn: "2505", gstRate: 5 });
    expect(lookupTax("M-Sand")).toMatchObject({ hsn: "2517", gstRate: 5 });
    expect(lookupTax("20mm Blue metal jelly")).toMatchObject({ hsn: "2517", gstRate: 5 });
    expect(lookupTax("ISMB 150")).toMatchObject({ hsn: "7216" });
    expect(lookupTax("Vitrified tiles 600x600")).toMatchObject({ hsn: "6907" });
  });

  it("does not guess for look-alikes or unknown items", () => {
    expect(lookupTax("Cement paint")).toBeNull();
    expect(lookupTax("Solid cement blocks 6 inch")).toBeNull();
    expect(lookupTax("Teak wood door frame")).toBeNull();
  });

  it("the server's copy is identical", () => {
    const app = readFileSync(new URL("./hsnTable.ts", import.meta.url), "utf8");
    const server = readFileSync(new URL("../../functions/src/shared/hsnTable.ts", import.meta.url), "utf8").split("\n").slice(3).join("\n");
    expect(server).toBe(app);
  });
});
