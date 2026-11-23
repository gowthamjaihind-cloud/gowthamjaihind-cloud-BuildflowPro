import { describe, it, expect } from "vitest";
import { orderGroupKeys, orderNameList, orderPhaseLocationGroups } from "./groupOrder";
import { buildLocationGroupedTree, buildPhaseLocationGroups } from "../components/schedule/wbsTreeUtils";

const t = (phase: string, location: string, startDate?: string) => ({ phase, location, startDate });
const start = (x: { startDate?: string; phase?: string; location?: string }) => x.startDate;

describe("phases and locations follow the schedule, not the alphabet", () => {
  it("orders groups by their earliest start", () => {
    const groups = {
      "Ground floor": [t("Ground floor", "", "2026-08-01")],
      Substructure: [t("Substructure", "", "2026-06-01"), t("Substructure", "", "2026-07-15")],
      Handover: [t("Handover", "", "2027-03-01")],
      "First floor": [t("First floor", "", "2026-10-01")],
    };
    expect(orderGroupKeys(groups, start)).toEqual(["Substructure", "Ground floor", "First floor", "Handover"]);
  });

  it("puts undated groups after dated ones, and Unassigned last", () => {
    const groups = {
      "Unassigned Phase": [t("", "", "2026-01-01")],
      Landscaping: [t("Landscaping", "")],
      Finishing: [t("Finishing", "", "2027-01-10")],
      Approvals: [t("Approvals", "", "not a date")],
    };
    expect(orderGroupKeys(groups, start)).toEqual(["Finishing", "Approvals", "Landscaping", "Unassigned Phase"]);
  });

  it("breaks a tie on the same start date by name", () => {
    const groups = { "Block B": [t("", "Block B", "2026-06-01")], "Block A": [t("", "Block A", "2026-06-01")] };
    expect(orderGroupKeys(groups, start)).toEqual(["Block A", "Block B"]);
  });

  it("orders phases by their earliest task across locations, and locations within each phase", () => {
    const out = orderPhaseLocationGroups(
      {
        "First floor": { "Block A": [t("First floor", "Block A", "2026-10-05")] },
        Substructure: {
          "Unassigned Location": [t("Substructure", "", "2026-05-01")],
          "Block B": [t("Substructure", "Block B", "2026-06-20")],
          "Block A": [t("Substructure", "Block A", "2026-06-01")],
        },
      },
      start,
    );
    expect(Object.keys(out)).toEqual(["Substructure", "First floor"]);
    expect(Object.keys(out.Substructure)).toEqual(["Block A", "Block B", "Unassigned Location"]);
  });

  it("pick lists: the project's names in schedule order, then the other suggestions", () => {
    const tasks = [t("Finishing", "Terrace", "2027-01-01"), t("Foundation", "Basement", "2026-05-01")];
    expect(orderNameList(tasks, (x: ReturnType<typeof t>) => x.phase, start, ["Excavation", "Foundation", "Finishing", "Handover"]))
      .toEqual(["Foundation", "Finishing", "Excavation", "Handover"]);
    expect(orderNameList(tasks, (x: ReturnType<typeof t>) => x.location, start, ["Site-wide", "Basement"]))
      .toEqual(["Basement", "Terrace", "Site-wide"]);
  });

  it("the WBS trees on phone and tablet use the same order", () => {
    const roots = [
      { id: "1", name: "Slab", phase: "Superstructure", location: "Tower 2", startDate: "2026-09-01" },
      { id: "2", name: "Footings", phase: "Substructure", location: "Tower 2", startDate: "2026-06-10" },
      { id: "3", name: "Piles", phase: "Substructure", location: "Tower 1", startDate: "2026-06-01" },
      { id: "4", name: "Gate", phase: "", location: "", startDate: "2026-01-01" },
    ];
    const groups = buildPhaseLocationGroups(roots);
    expect(groups.map((g) => g.name)).toEqual(["Substructure", "Superstructure", "Unassigned Phase"]);
    expect(groups[0].children.map((l) => l.name)).toEqual(["Tower 1", "Tower 2"]);
    expect(buildLocationGroupedTree(roots as never).map((g) => g.name)).toEqual(["Tower 1", "Tower 2", "Unassigned Location"]);
  });
});
