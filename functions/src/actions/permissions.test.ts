import { describe, it, expect } from "vitest";
import { denial, allowedActions, type Who } from "./permissions";

const base: Who = { uid: "u", role: "Site Engineer", isMember: true, projectAccess: "write" };

describe("command permissions", () => {
  it("lets a site engineer with write access log work and ask about the site, nothing more", () => {
    expect(allowedActions(base).sort()).toEqual(["ask.site", "log.create"]);
    expect(denial("po.create", base)).toMatch(/Site Engineer\) cannot create purchase orders/);
  });
  it("lets managers with write access do everything", () => {
    expect(allowedActions({ ...base, role: "Project Manager" })).toHaveLength(7);
  });
  it("gives Owners and Admins every project without per-project access", () => {
    expect(denial("payment.create", { uid: "o", role: "Owner", isMember: true })).toBeNull();
  });
  it("treats read-only project access as read-only, whatever the role", () => {
    const pm = { ...base, role: "Project Manager", projectAccess: "read" };
    expect(denial("ask.money", pm)).toBeNull();
    expect(denial("po.create", pm)).toMatch(/can view this project but not change it/);
  });
  it("refuses everything for non-members and no-access members, and writes on a locked project", () => {
    expect(denial("ask.site", { ...base, isMember: false })).toMatch(/not a member/);
    expect(denial("ask.site", { ...base, projectAccess: "none" })).toMatch(/don't have access/);
    expect(denial("po.create", { uid: "o", role: "Owner", isMember: true, projectLocked: true })).toMatch(/read-only/);
    expect(denial("ask.site", { uid: "o", role: "Owner", isMember: true, projectLocked: true })).toBeNull();
  });
  it("lets the project's owner write it without an access entry", () => {
    expect(denial("po.create", { uid: "p", role: "Project Manager", isMember: true, ownsProject: true })).toBeNull();
  });
  it("keeps viewers and stakeholders to reading", () => {
    expect(allowedActions({ uid: "v", role: "Viewer", isMember: true, projectAccess: "read" })).toEqual(["ask.site"]);
  });
});
