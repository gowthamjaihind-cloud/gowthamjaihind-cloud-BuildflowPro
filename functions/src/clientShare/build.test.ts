import { describe, it, expect } from "vitest";
import { buildClientView, dayOf, type ClientViewInput } from "./build";

const ALL = { progress: true, photos: true, updates: true, payments: true };
const base = (over: Partial<ClientViewInput> = {}): ClientViewInput => ({
  sections: ALL,
  showHeadcount: true,
  today: "2026-11-15",
  company: { name: "Sample Builders", phone: "9876543210" },
  project: { name: "Sample Residence", status: "Active", startDate: "2026-09-01", endDate: "2027-03-31", budget: 5000000, ownerId: "u1" },
  tasks: [
    { id: "p1", name: "Substructure", startDate: "2026-09-01", endDate: "2026-10-31", progress: 100, duration: 60 },
    { id: "a", parentId: "p1", name: "Excavation", startDate: "2026-09-01", endDate: "2026-09-20", progress: 100, duration: 20, cost: 87123 },
    { id: "b", parentId: "p1", name: "Footing", startDate: "2026-09-21", endDate: "2026-10-31", progress: 100, duration: 40 },
    { id: "p2", name: "Superstructure", startDate: "2026-11-01", endDate: "2027-02-28", progress: 10, duration: 120 },
    { id: "c", parentId: "p2", name: "GF slab", startDate: "2026-11-01", endDate: "2026-11-10", progress: 40, duration: 10 },
    { id: "m", name: "Slab cast", type: "Milestone", endDate: "2026-11-10", progress: 0 },
  ],
  logs: [
    { taskId: "c", workDate: "2026-11-14", progressPercent: 40, note: "vendor unpaid, holding steel", labour: [{ roleName: "Mason", headcount: 4, rate: 917 }], materials: [{ name: "Cement", quantity: 20, unitCost: 413 }], photoUrls: ["https://firebasestorage.googleapis.com/x.jpg", "javascript:alert(1)"] },
    { taskId: "b", workDate: { seconds: Date.parse("2026-10-30T20:00:00Z") / 1000 }, progressPercent: 100, labour: [] },
    { taskId: "c", workDate: "2026-11-20", progressPercent: 60 },
  ],
  estimates: [
    { status: "Approved", totalAmount: 4000000, items: [{ rate: 500 }] },
    { status: "Approved", totalAmount: 250000 },
    { status: "Draft", totalAmount: 999999 },
  ],
  payments: [
    { date: "2026-09-05", amount: 1000000, referenceNumber: "NEFT-1", description: "internal remark" },
    { date: "2026-11-01", amount: 500000 },
  ],
  ...over,
});

describe("the client's view of a shared project", () => {
  it("never carries notes, costs, rates, materials or internal fields", () => {
    const json = JSON.stringify(buildClientView(base()));
    for (const leak of ["vendor unpaid", "917", "413", "Cement", "87123", "5000000", "internal remark", "NEFT-1", "ownerId", "u1", "javascript:"]) {
      expect(json, leak).not.toContain(leak);
    }
  });

  it("weights overall progress by duration over leaf tasks only", () => {
    const v = buildClientView(base());
    // a 20@100, b 40@100, c 10@40 -> (2000+4000+400)/70 = 91
    expect(v.progress.overall).toBe(91);
    expect(v.progress.tasksDone).toBe(2);
    expect(v.progress.tasksTotal).toBe(3);
  });

  it("flags late work and lists phases and milestones", () => {
    const v = buildClientView(base());
    expect(v.progress.phases.map((p: any) => p.name)).toEqual(["Substructure", "Superstructure"]);
    expect(v.progress.lateCount).toBe(1); // GF slab ended 10 Nov at 40%
    expect(v.progress.milestones).toEqual([{ name: "Slab cast", date: "2026-11-10", done: false }]);
    expect(v.progress.expectedCompletion).toBe("2027-03-31");
  });

  it("shows only https photos, newest first, and leaves out future-dated logs", () => {
    const v = buildClientView(base());
    expect(v.photos).toEqual([{ url: "https://firebasestorage.googleapis.com/x.jpg", date: "2026-11-14", task: "GF slab" }]);
    expect(v.updates.map((u: any) => u.date)).toEqual(["2026-11-14", "2026-10-31"]);
  });

  it("shows worker counts only when the link allows it", () => {
    expect(buildClientView(base()).updates[0].workers).toBe(4);
    expect(buildClientView(base({ showHeadcount: false })).updates[0]).not.toHaveProperty("workers");
  });

  it("totals the approved contract and what has been received", () => {
    const v = buildClientView(base());
    expect(v.payments).toMatchObject({ contractValue: 4250000, approvedEstimates: 2, received: 1500000, balance: 2750000 });
    expect(v.payments.history).toEqual([{ date: "2026-11-01", amount: 500000 }, { date: "2026-09-05", amount: 1000000 }]);
  });

  it("includes nothing from a section that is switched off", () => {
    const v = buildClientView(base({ sections: { progress: true, photos: false, updates: false, payments: false } }));
    expect(v).not.toHaveProperty("photos");
    expect(v).not.toHaveProperty("updates");
    expect(v).not.toHaveProperty("payments");
    expect(JSON.stringify(v)).not.toContain("4250000");
  });

  it("reads dates in every stored shape", () => {
    expect(dayOf("2026-11-14")).toBe("2026-11-14");
    expect(dayOf("14-11-2026")).toBe("2026-11-14");
    expect(dayOf({ seconds: Date.parse("2026-10-30T20:00:00Z") / 1000 })).toBe("2026-10-31");
    expect(dayOf(null)).toBe("");
  });
});
