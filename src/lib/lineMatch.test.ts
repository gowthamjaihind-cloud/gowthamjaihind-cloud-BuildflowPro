import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { relinkToPo as relink, tokenMatch } from "./lineMatch";

type L = { name: string; unit?: string; poLineRef?: string; materialId?: string };
const relinkToPo = (lines: L[], p: typeof po) => relink<L>(lines, p);

const po = [
  { itemId: "inv-8", name: "TMT Bar 8mm Fe500", unit: "kg", materialId: "STL-8" },
  { itemId: "inv-12", name: "TMT Bar 12mm Fe500", unit: "kg" },
  { itemId: "inv-cem", name: "OPC 53 Grade Cement", unit: "bag" },
];

describe("relinking a scanned bill to a hand-picked PO", () => {
  it("links lines by name and size, never 8mm to 12mm", () => {
    const out = relinkToPo([{ name: "8MM TMT FE500" }, { name: "12 mm TMT" }, { name: "Cement OPC 53" }, { name: "Transport" }], po);
    expect(out.map((l) => l.poLineRef)).toEqual(["inv-8", "inv-12", "inv-cem", undefined]);
    expect(out[0].materialId).toBe("STL-8");
    expect(out[1].unit).toBe("kg");
  });

  it("drops links to a different PO's lines", () => {
    const out = relinkToPo([{ name: "Sand", poLineRef: "other-po-line" }], po);
    expect(out[0].poLineRef).toBeUndefined();
  });

  it("does not link two bill lines to the same PO line", () => {
    const out = relinkToPo([{ name: "OPC 53 Cement" }, { name: "Cement OPC53 grade" }], po);
    expect(out.filter((l) => l.poLineRef === "inv-cem")).toHaveLength(1);
  });

  it("sizes must agree", () => {
    expect(tokenMatch("TMT 8mm", "TMT 10mm")).toBe(false);
  });
});

describe("line matching: app and server copies", () => {
  it("are identical", () => {
    const app = readFileSync(new URL("./lineMatch.ts", import.meta.url), "utf8");
    const server = readFileSync(new URL("../../functions/src/shared/lineMatch.ts", import.meta.url), "utf8").split("\n").slice(3).join("\n");
    expect(server).toBe(app);
  });
});
