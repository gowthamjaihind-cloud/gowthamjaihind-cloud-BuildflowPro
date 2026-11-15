import { describe, it, expect } from "vitest";
import { captionSaysInvoice, taskFromCaption, parsePhotoKind, PHOTO_KIND_PROMPT } from "./sitePhotos";

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
    expect(captionSaysInvoice("Tax Invoice_VTSALE 26-27 212_02_11_26_original.pdf")).toBe(true);
    expect(captionSaysInvoice("Footing_drawing_rev2.pdf")).toBe(false);
  });
});

describe("photo kind from the AI", () => {
  it("accepts the three kinds and checks the document category", () => {
    expect(parsePhotoKind({ kind: "bill" })).toEqual({ kind: "bill", category: "", title: "" });
    expect(parsePhotoKind({ kind: "document", category: "Structural Drawings", title: "Footing layout <b>" })).toEqual({ kind: "document", category: "Structural Drawings", title: "Footing layout b" });
    expect(parsePhotoKind({ kind: "document", category: "Secrets", title: "" })).toEqual({ kind: "document", category: "Others", title: "Document" });
  });
  it("treats anything unclear as a site photo, which asks before saving", () => {
    expect(parsePhotoKind(null).kind).toBe("site");
    expect(parsePhotoKind({ kind: "selfie" }).kind).toBe("site");
  });
  it("asks for site, bill or document", () => {
    expect(PHOTO_KIND_PROMPT).toMatch(/"site"/);
    expect(PHOTO_KIND_PROMPT).toMatch(/"bill"/);
    expect(PHOTO_KIND_PROMPT).toMatch(/Structural Drawings/);
  });
});
