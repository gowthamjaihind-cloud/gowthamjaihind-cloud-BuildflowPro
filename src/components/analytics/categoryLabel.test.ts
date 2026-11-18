import { describe, it, expect } from "vitest";
import { categoryLabel } from "./categoryLabel";
import { translate } from "../../i18n";

describe("cost category labels", () => {
  it("reads Labour and Labor alike", () => {
    expect(categoryLabel("Labour", translate)).toBe("Labour");
    expect(categoryLabel("Labor", translate)).toBe("Labour");
    expect(categoryLabel("Direct Cost", translate)).toBe("Direct Cost");
  });
  it("never shows a raw key", () => {
    expect(categoryLabel("Overheads", translate)).toBe("Overheads");
  });
});
