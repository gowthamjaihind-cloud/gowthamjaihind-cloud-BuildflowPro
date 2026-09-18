import { describe, it, expect } from "vitest";
import {
  toInteractive,
  toCloudApiPayload,
  fitLabels,
  BUTTON_TITLE_MAX,
  LIST_TITLE_MAX,
  LIST_ROWS_MAX,
  MORE_PREFIX,
  type InlineButton,
} from "./interactive";

/**
 * These limits are Meta's, and breaking one does not throw anywhere in our code
 * -- it comes back as a 400 from the Cloud API with a message that does not say
 * which field was wrong. So the constraints are asserted here instead.
 */

const btn = (text: string, id: string): InlineButton => ({ text, callback_data: id });
const grid = (...b: InlineButton[]): InlineButton[][] => b.map((x) => [x]);

describe("toInteractive", () => {
  it("sends plain text when there is nothing to tap", () => {
    expect(toInteractive("Saved.").kind).toBe("text");
    expect(toInteractive("Saved.", []).kind).toBe("text");
  });

  it("uses reply buttons for three or fewer", () => {
    const s = toInteractive("Pick", grid(btn("Yes", "y"), btn("No", "n")));
    expect(s.kind).toBe("buttons");
    if (s.kind !== "buttons") return;
    expect(s.buttons.map((b) => b.id)).toEqual(["y", "n"]);
  });

  it("switches to a list at four, because WhatsApp allows only three buttons", () => {
    const s = toInteractive("Pick", grid(btn("A", "a"), btn("B", "b"), btn("C", "c"), btn("D", "d")));
    expect(s.kind).toBe("list");
  });

  it("never exceeds ten list rows", () => {
    const many = Array.from({ length: 40 }, (_, i) => btn(`Task ${i}`, `t${i}`));
    const s = toInteractive("Pick", grid(...many));
    if (s.kind !== "list") throw new Error("expected list");
    expect(s.rows.length).toBeLessThanOrEqual(LIST_ROWS_MAX);
  });

  it("paginates rather than dropping options off the end", () => {
    const many = Array.from({ length: 25 }, (_, i) => btn(`Task ${i}`, `t${i}`));
    const seen = new Set<string>();
    for (let page = 1; page <= 4; page++) {
      const s = toInteractive("Pick", grid(...many), { page });
      if (s.kind !== "list") throw new Error("expected list");
      for (const r of s.rows) if (!r.id.startsWith(MORE_PREFIX)) seen.add(r.id);
    }
    // Every task is reachable by paging; none is silently hidden.
    expect(seen.size).toBe(25);
  });

  it("offers More… only while there is actually more", () => {
    const many = Array.from({ length: 10 }, (_, i) => btn(`T${i}`, `t${i}`));
    const s = toInteractive("Pick", grid(...many));
    if (s.kind !== "list") throw new Error("expected list");
    expect(s.rows.some((r) => r.id.startsWith(MORE_PREFIX))).toBe(false);
  });

  it("refuses an over-long id instead of truncating it", () => {
    // Truncating a label is cosmetic. Truncating an id routes the tap to the
    // wrong handler branch, which is why this throws rather than trims.
    const long = btn("x", "a".repeat(300));
    expect(() => toInteractive("Pick", grid(long))).toThrow(/never truncate/);
  });
});

describe("fitLabels", () => {
  it("leaves short labels alone", () => {
    expect(fitLabels(["Yes", "No"], BUTTON_TITLE_MAX)).toEqual(["Yes", "No"]);
  });

  it("keeps WBS names distinguishable when their heads are identical", () => {
    // The real case: this app's task names share long prefixes, and a plain
    // slice makes two different tasks look like the same button.
    const names = [
      "Ground floor slab — reinforcement",
      "Ground floor slab — shuttering",
      "Ground floor slab — concrete pour",
    ];
    const fitted = fitLabels(names, LIST_TITLE_MAX);
    expect(new Set(fitted).size).toBe(3);
    for (const f of fitted) expect(f.length).toBeLessThanOrEqual(LIST_TITLE_MAX);
  });

  it("still separates labels that are genuinely identical", () => {
    const fitted = fitLabels(["Concrete", "Concrete", "Concrete"], BUTTON_TITLE_MAX);
    expect(new Set(fitted).size).toBe(3);
  });

  it("respects the limit for every label it returns", () => {
    const names = Array.from({ length: 30 }, (_, i) => "A very long task name indeed " + i);
    for (const f of fitLabels(names, LIST_TITLE_MAX)) {
      expect(f.length).toBeLessThanOrEqual(LIST_TITLE_MAX);
    }
  });
});

describe("toCloudApiPayload", () => {
  it("shapes reply buttons the way the Cloud API expects", () => {
    const p: any = toCloudApiPayload("919000000000", toInteractive("Pick", grid(btn("Yes", "y"))));
    expect(p.messaging_product).toBe("whatsapp");
    expect(p.interactive.type).toBe("button");
    expect(p.interactive.action.buttons[0]).toEqual({ type: "reply", reply: { id: "y", title: "Yes" } });
  });

  it("shapes a list with a section", () => {
    const many = Array.from({ length: 6 }, (_, i) => btn(`T${i}`, `t${i}`));
    const p: any = toCloudApiPayload("919000000000", toInteractive("Pick", grid(...many)));
    expect(p.interactive.type).toBe("list");
    expect(p.interactive.action.sections[0].rows.length).toBe(6);
  });

  it("does not turn on link previews, which reformat a log summary", () => {
    const p: any = toCloudApiPayload("919000000000", toInteractive("Saved."));
    expect(p.text.preview_url).toBe(false);
  });
});
