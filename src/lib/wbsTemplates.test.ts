import { describe, it, expect } from "vitest";
import { nodeName, planFromTemplate, WBS_TEMPLATES } from "./wbsTemplates";
import type { WbsNode, WbsTemplate } from "./wbsTemplates";

const node = (name: string, nameTa?: string, children?: WbsNode[]): WbsNode => ({
  name,
  nameTa,
  days: children ? undefined : 2,
  children,
});

describe("nodeName", () => {
  it("defaults to English", () => {
    expect(nodeName(node("Excavation", "மண் அகழ்வு"))).toBe("Excavation");
  });

  it("uses the Tamil name when asked for Tamil", () => {
    expect(nodeName(node("Excavation", "மண் அகழ்வு"), "ta")).toBe("மண் அகழ்வு");
  });

  // The templates ship only partly translated, so this is the normal case.
  it("falls back to English when a node has no Tamil name", () => {
    expect(nodeName(node("Excavation"), "ta")).toBe("Excavation");
    expect(nodeName({ name: "Slab", nameTa: "" }, "ta")).toBe("Slab");
  });
});

describe("planFromTemplate language", () => {
  const template: WbsTemplate = {
    id: "t",
    name: "T",
    category: "Residential",
    description: "d",
    nodes: [node("Substructure", "அடித்தளம்", [node("Excavation", "மண் அகழ்வு"), node("PCC")])],
  };

  it("seeds English names by default", () => {
    const names = planFromTemplate(template, new Date("2026-01-01")).map((n) => n.name);
    expect(names).toEqual(["Substructure", "Excavation", "PCC"]);
  });

  it("seeds Tamil where present and English where not", () => {
    const plan = planFromTemplate(template, new Date("2026-01-01"), "ta");
    expect(plan.map((n) => n.name)).toEqual(["அடித்தளம்", "மண் அகழ்வு", "PCC"]);
  });

  it("carries the translated name into the phase label too", () => {
    const plan = planFromTemplate(template, new Date("2026-01-01"), "ta");
    expect(plan.every((n) => n.phase === "அடித்தளம்")).toBe(true);
  });

  it("produces the same number of tasks in either language", () => {
    const en = planFromTemplate(template, new Date("2026-01-01"), "en");
    const ta = planFromTemplate(template, new Date("2026-01-01"), "ta");
    expect(ta).toHaveLength(en.length);
    expect(ta.map((n) => n.startDate)).toEqual(en.map((n) => n.startDate));
  });

  it("never yields a blank name for any shipped template, in either language", () => {
    for (const tpl of WBS_TEMPLATES) {
      for (const lang of ["en", "ta"] as const) {
        const plan = planFromTemplate(tpl, new Date("2026-01-01"), lang);
        expect(plan.length).toBeGreaterThan(0);
        expect(plan.every((n) => n.name.trim().length > 0)).toBe(true);
      }
    }
  });
});
