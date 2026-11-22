import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PLANS, OVERAGE_RATE } from "../lib/plans";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "./LandingPage.tsx"), "utf8");

/**
 * The landing page quotes prices as hand-written strings and does NOT import the
 * catalog, which is deliberate: marketing copy and the billing catalog change for
 * different reasons and at different times, and threading PLANS through the page
 * would make every price a render-time lookup in a file that is mostly prose.
 *
 * The cost of that choice is drift, and it already happened once -- the page went
 * on advertising ₹999, ₹1,799, ₹2,999 and a permanent free tier after the catalog
 * had collapsed to three plans, so the site quoted prices the app would not
 * charge. These checks are the guard that was missing, read against the file's
 * text so nothing has to be rendered.
 */

/** ₹1499 in the catalog is written "₹1,499" on the page. */
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

describe("landing page prices match the catalog", () => {
  it("quotes Starter's monthly price", () => {
    expect(SRC).toContain(`monthly: "${rupees(PLANS.starter.monthly!)}"`);
  });

  it("quotes Business's monthly price", () => {
    expect(SRC).toContain(`monthly: "${rupees(PLANS.business.monthly!)}"`);
  });

  it("quotes both annual totals", () => {
    expect(SRC).toContain(rupees(PLANS.starter.annual!));
    expect(SRC).toContain(rupees(PLANS.business.annual!));
  });

  it("names the per-project rate customers are actually charged", () => {
    expect(SRC).toContain(`₹${OVERAGE_RATE}`);
  });

  it("says how many projects Business includes", () => {
    expect(SRC).toContain(`${PLANS.business.includedProjects} projects included`);
  });

  it("names the seat counts the plans actually grant", () => {
    expect(SRC).toContain(`${PLANS.starter.userLimit} users`);
    expect(SRC).toContain(`${PLANS.business.userLimit} users`);
  });

  it("lists one card per plan and no more", () => {
    // A retired tier left in the array is the other half of the drift: the page
    // would keep selling Growth after the catalog stopped having it.
    const names = [...SRC.matchAll(/^\s+name: "([^"]+)",$/gm)].map((m) => m[1]);
    const cards = names.filter((n) => n !== "Free trial");
    expect(cards.sort()).toEqual(["Business", "Enterprise", "Starter"]);
  });
});

describe("landing page makes no retired claim", () => {
  it("quotes no price that no plan charges", () => {
    const live = new Set(
      Object.values(PLANS).flatMap((p) => [p.monthly, p.annual]).filter((n): n is number => typeof n === "number"),
    );
    // Every ₹ amount of three digits or more that the page states, other than
    // the per-project rate and the effective monthly rates derived from annual.
    const derived = new Set(
      Object.values(PLANS)
        .filter((p) => p.annual)
        .map((p) => Math.round(p.annual! / 12)),
    );
    const quoted = [...SRC.matchAll(/₹([\d,]{3,})/g)].map((m) => Number(m[1].replace(/,/g, "")));
    for (const amount of new Set(quoted)) {
      const ok = live.has(amount) || derived.has(amount) || amount === OVERAGE_RATE;
      expect(ok, `₹${amount} is quoted on the landing page but no plan charges it`).toBe(true);
    }
  });

  it("does not promise a permanent free tier", () => {
    // There isn't one. The free entry point is the 14-day Starter trial.
    expect(SRC).not.toMatch(/free forever/i);
    expect(SRC).not.toMatch(/start free forever/i);
    const zeroPriced = Object.values(PLANS).filter((p) => p.monthly === 0);
    expect(zeroPriced, "a ₹0 plan exists again — the page may advertise it").toHaveLength(0);
  });

  it("has no Tamil left on it", () => {
    // The web app is English only; Tamil lives in the Telegram bot. A stray
    // Tamil string here would render to every visitor regardless.
    expect(SRC).not.toMatch(/[஀-௿]/);
  });
});

describe("the per-day price", () => {
  /*
    "₹99 a month" is pitched as about ₹3 a day. ₹99 / 30 = ₹3.30, so a bare
    "₹3 a day" next to "₹99 a month" is a claim a customer can check and find
    short; "about" (monthly) and "under" (yearly, ₹990 / 365 = ₹2.71) are true.
    Every per-day claim in the landing page and the films must say one of them,
    and the arithmetic must still hold for the catalog as it stands.
  */
  const starter = PLANS.starter;
  const perDayMonthly = starter.monthly! / 30;
  const perDayAnnual = starter.annual! / 365;
  const MARKETING = [
    "src/pages/LandingPage.tsx",
    "marketing/remotion/src/film/Titles.tsx",
    "marketing/remotion/src/Type.tsx",
    "marketing/remotion/src/pulse/Pulse.tsx",
    "marketing/video/build.mjs",
    "marketing/films/launch.script.mjs",
    "marketing/films/walkthrough.script.mjs",
  ].map((rel) => ({ rel, src: readFileSync(join(HERE, "../..", rel), "utf8") }));

  it("still rounds to about ₹3 a month-day, and is under ₹3 a year-day", () => {
    expect(Math.round(perDayMonthly)).toBe(3);
    expect(perDayAnnual).toBeLessThan(3);
  });

  it("is always qualified: about (monthly) or under (yearly), never a bare ₹3", () => {
    for (const { rel, src } of MARKETING) {
      for (const m of src.matchAll(/(\w+)\s+(?:₹3|three rupees)\s+a day/gi)) {
        expect(["about", "under"], `${rel}: "${m[0]}"`).toContain(m[1].toLowerCase());
      }
    }
  });

  it("says 'under' only where the yearly price makes it true", () => {
    expect(SRC).toMatch(/annual: "Under ₹3 a day/);
    for (const { rel, src } of MARKETING.filter((x) => x.rel !== "src/pages/LandingPage.tsx")) {
      expect(src, `${rel} pairs 'under ₹3' with the monthly price`).not.toMatch(/under (?:₹3|three rupees) a day/i);
    }
  });

  it("appears in every marketing item that quotes ₹99", () => {
    for (const { rel, src } of MARKETING) {
      if (/₹99|ninety nine rupees/.test(src)) expect(src, rel).toMatch(/(?:₹3|three rupees) a day/i);
    }
  });
});
