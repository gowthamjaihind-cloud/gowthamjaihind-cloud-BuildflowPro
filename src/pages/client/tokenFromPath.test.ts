import { describe, it, expect } from "vitest";
import { tokenFromPath } from "./ClientDashboardPage";

describe("tokenFromPath", () => {
  it("reads the token from a shared link", () => {
    expect(tokenFromPath("/p/abcdefghijklmnopqrstuvwxyz012345")).toBe("abcdefghijklmnopqrstuvwxyz012345");
    expect(tokenFromPath("/p/abcdefghijklmnopqrstuvwxyz012345/")).toBe("abcdefghijklmnopqrstuvwxyz012345");
  });
  it("refuses anything that is not a whole token", () => {
    expect(tokenFromPath("/p/short")).toBe("");
    expect(tokenFromPath("/p/abcdefghijklmnopqrstuvwxyz012345/../x")).toBe("");
    expect(tokenFromPath("/projects/abcdefghijklmnopqrstuvwxyz012345")).toBe("");
  });
});
