import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PLANS, OVERAGE_RATE } from "../../lib/plans";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) =>
  readFileSync(join(HERE, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const MODAL = read("./components/CreateProjectModal.tsx");

describe("adding a project on a metered Starter", () => {
  it("asks before raising the bill", () => {
    // A bill may not go up without the customer agreeing. "You are over your
    // limit" is a notice, not consent.
    expect(MODAL).toMatch(/confirmDialog\(/);
    const block = MODAL.slice(MODAL.indexOf("const metered"));
    expect(block).toMatch(/confirmDialog\(/);
    expect(block).toMatch(/if \(!ok\) return;/);
  });

  it("quotes the real rupees, not just a warning", () => {
    const block = MODAL.slice(MODAL.indexOf("const metered"));
    // Both the current and the new monthly figure, so the change is legible.
    expect(block).toMatch(/projects\.length \* rate/);
    expect(block).toMatch(/next \* rate/);
    expect(block).toMatch(/OVERAGE_RATE|overageRate/);
  });

  it("syncs the mandate only AFTER the project exists", () => {
    // The server counts projects itself. Syncing first would bill for a
    // project that was never created.
    const block = MODAL.slice(MODAL.indexOf("const metered"));
    expect(block.indexOf("await doCreate()")).toBeLessThan(block.indexOf("callSyncSubscriptionQuantity"));
  });

  it("fails toward not charging when the sync breaks", () => {
    // The project is made and usable; leaving it unbilled is recoverable,
    // charging for something invisible is not.
    const block = MODAL.slice(MODAL.indexOf("const metered"));
    expect(block).toMatch(/catch\s*\{/);
  });

  it("only applies to a Starter with a live mandate", () => {
    // Business bills flat, and a Starter with no subscription still buys
    // one-off slots through the capacity modal.
    expect(MODAL).toMatch(/plan\.hasSubscription && plan\.plan === "starter"/);
    // The old slot path must survive for everyone else.
    expect(MODAL).toMatch(/setShowCapacity\(true\)/);
  });

  it("rests on Starter actually being priced per project", () => {
    // If Starter ever stops being ₹99/project, quantity x plan amount stops
    // being the right bill and this whole model needs revisiting.
    expect(PLANS.starter.monthly).toBe(OVERAGE_RATE);
    expect(PLANS.starter.includedProjects).toBe(1);
  });
});
