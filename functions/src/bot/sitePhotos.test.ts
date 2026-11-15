import { describe, it, expect } from "vitest";
import { captionSaysInvoice, taskFromCaption } from "./sitePhotos";

const tasks = [
  { id: "f", name: "Footing" },
  { id: "e", name: "Earth work Excavation" },
  { id: "c1", name: "Column casting ground floor" },
  { id: "c2", name: "Column casting first floor" },
];

describe("site photo captions", () => {
  it("finds the task a caption names", () => {
    expect(taskFromCaption("Save this in footing task", tasks)?.id).toBe("f");
    expect(taskFromCaption("excavation photos", tasks)?.id).toBe("e");
    expect(taskFromCaption("column casting first floor", tasks)?.id).toBe("c2");
  });
  it("gives no task when none or several fit equally", () => {
    expect(taskFromCaption("", tasks)).toBeNull();
    expect(taskFromCaption("today site photos", tasks)).toBeNull();
    expect(taskFromCaption("column casting", tasks)).toBeNull();
  });
  it("treats only a caption that says bill/invoice as an invoice", () => {
    expect(captionSaysInvoice("cement invoice")).toBe(true);
    expect(captionSaysInvoice("Steel bill from vendor")).toBe(true);
    expect(captionSaysInvoice("Save this in footing task")).toBe(false);
    expect(captionSaysInvoice("")).toBe(false);
  });
});
