import { describe, it, expect } from "vitest";
import { memberChangeDenial } from "./membersPolicy";

const members = { olivia: "Owner", adam: "Admin", amy: "Admin", pam: "Project Manager", sam: "Site Engineer" };
const deny = (caller: string, member: string, role?: string) => memberChangeDenial({ members, caller, member, role });

describe("who may change a member's role", () => {
  it("an Owner may change anyone else's role, Owner and Admin included", () => {
    expect(deny("olivia", "sam", "Project Manager")).toBeNull();
    expect(deny("olivia", "adam", "Viewer")).toBeNull();
    expect(deny("olivia", "pam", "Owner")).toBeNull();
  });
  it("an Admin may change other roles, but not make or unmake an Owner or Admin", () => {
    expect(deny("adam", "sam", "Project Manager")).toBeNull();
    expect(deny("adam", "olivia", "Viewer")).toMatch(/Only an Owner/);
    expect(deny("adam", "amy", "Viewer")).toMatch(/Only an Owner/);
    expect(deny("adam", "sam", "Admin")).toMatch(/Only an Owner/);
  });
  it("managers and everyone else cannot change roles", () => {
    expect(deny("pam", "sam", "Viewer")).toMatch(/Only an Owner or Admin/);
    expect(deny("sam", "sam", "Owner")).toMatch(/Only an Owner or Admin/);
    expect(deny("stranger", "sam", "Viewer")).toMatch(/Only an Owner or Admin/);
  });
  it("nobody changes their own role, and only members can be changed", () => {
    expect(deny("olivia", "olivia", "Viewer")).toMatch(/your own role/);
    expect(deny("olivia", "outsider", "Viewer")).toMatch(/not a member/);
  });
  it("project access alone needs Owner or Admin, not Owner", () => {
    expect(deny("adam", "olivia")).toBeNull();
    expect(deny("pam", "sam")).toMatch(/Only an Owner or Admin/);
  });
});
