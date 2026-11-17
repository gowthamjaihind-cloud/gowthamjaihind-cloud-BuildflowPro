import { describe, it, expect } from "vitest";
import { barsToStockUnit, barDiameter, isRebar, kgPerMetre } from "./steel";

describe("steel bars by count", () => {
  it("uses d²/162 kg per metre", () => {
    expect(kgPerMetre(12)).toBeCloseTo(0.889, 3);
    expect(kgPerMetre(8)).toBeCloseTo(0.395, 3);
    expect(kgPerMetre(16)).toBeCloseTo(1.58, 2);
  });

  it("turns 150 nos of 12mm into 1,600 kg (12 m bars)", () => {
    const r = barsToStockUnit("TMT Bar 12mm Fe500", "kg", 150)!;
    expect(r.kg).toBe(1600);
    expect(r.qty).toBe(1600);
    expect(r.working).toBe("12mm: 150 nos × 12 m × 0.889 kg/m = 1,600 kg");
  });

  it("rounds to the nearest 10 kg", () => {
    // 40 × 12 × 0.39506 = 189.6 kg
    expect(barsToStockUnit("8 mm TMT", "Kg", 40)!.kg).toBe(190);
    // 3 × 12 × 0.39506 = 14.2 kg -> 10
    expect(barsToStockUnit("8mm TMT", "kg", 3)!.kg).toBe(10);
  });

  it("gives tonnes when the material is stocked in MT", () => {
    const r = barsToStockUnit("Steel rod 16mm", "MT", 100)!;
    // 100 × 12 × 1.5802 = 1896.3 -> 1900 kg
    expect(r.kg).toBe(1900);
    expect(r.qty).toBe(1.9);
    expect(r.working).toContain("(1.9 t)");
  });

  it("leaves other materials alone", () => {
    expect(barsToStockUnit("TMT Bar 12mm", "nos", 150)).toBeNull();
    expect(barsToStockUnit("Binding wire 18 gauge", "kg", 5)).toBeNull();
    expect(barsToStockUnit("OPC 53 cement", "bag", 100)).toBeNull();
    expect(barsToStockUnit("TMT bar", "kg", 10)).toBeNull(); // size unknown
  });

  it("reads bar sizes", () => {
    expect(barDiameter("TMT 10 mm")).toBe(10);
    expect(barDiameter("Pipe 15mm")).toBeNull();
    expect(isRebar("Fe500D 25mm")).toBe(true);
    expect(isRebar("MS Angle 50mm")).toBe(false);
  });
});
