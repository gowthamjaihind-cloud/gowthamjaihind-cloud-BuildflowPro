import { describe, it, expect } from "vitest";
import { logPhotoDocs, isLogPhoto } from "./logPhotoDocs";

describe("daily-log photos in the Document Vault", () => {
  it("lists each photo as a read-only Progress Photo with its task, newest first", () => {
    const docs = logPhotoDocs(
      [
        { id: "L1", taskId: "f", workDate: "2026-11-14", photoUrls: ["https://x/a.jpg", "https://x/b.jpg"], createdVia: "telegram" },
        { id: "L2", taskId: "e", workDate: "2026-11-15", photoUrls: ["https://x/c.jpg", "javascript:alert(1)"] },
        { id: "L3", taskId: "f", workDate: "2026-11-13" },
      ],
      [{ id: "f", name: "Footing" }, { id: "e", name: "Excavation" }],
      "P",
    );
    expect(docs.map((d) => d.name)).toEqual(["Excavation: site photo 1", "Footing: site photo 1", "Footing: site photo 2"]);
    expect(docs.every((d) => d.category === "Progress Photos" && d.type === "Image" && isLogPhoto(d))).toBe(true);
    expect(docs[1].tags).toContain("telegram");
    expect(isLogPhoto({ id: "abc" })).toBe(false);
  });
});
