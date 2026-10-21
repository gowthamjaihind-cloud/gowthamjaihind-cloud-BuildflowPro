import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) =>
  readFileSync(join(HERE, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const HOOK = read("./useRazorpayCheckout.ts");

describe("plan checkout takes a mandate, not a single payment", () => {
  it("subscribe() hands Razorpay a subscription_id", () => {
    // order_id takes one payment and never returns. subscription_id is what
    // puts checkout into mandate mode so later charges happen without us.
    const body = HOOK.slice(HOOK.indexOf("const subscribe"), HOOK.indexOf("const paySlots"));
    expect(body).toMatch(/subscription_id:/);
    expect(body).not.toMatch(/order_id:/);
  });

  it("does not pretend the modal closing proved payment", () => {
    // The authorisation payment and every renewal are confirmed by webhook.
    // Verifying client-side here would mark an org active on a mandate that
    // had not yet collected anything.
    const body = HOOK.slice(HOOK.indexOf("const subscribe"), HOOK.indexOf("const paySlots"));
    expect(body).not.toMatch(/callVerifyRazorpayPayment/);
  });

  const SURFACES: Array<[string, string]> = [
    ["Paywall", "../components/Paywall.tsx"],
    ["ManagePlanModal", "../components/ManagePlanModal.tsx"],
    ["Onboarding", "../components/Onboarding.tsx"],
  ];

  for (const [name, rel] of SURFACES) {
    it(`${name} subscribes rather than charging once`, () => {
      // The whole defect this fixes: every plan purchase was a one-off order,
      // so nothing ever charged a second time and customers silently lapsed.
      const src = read(rel);
      expect(src).toMatch(/\bsubscribe\(/);
      expect(src, `${name} still takes a one-off plan payment`).not.toMatch(/[^A-Za-z]pay\(\s*(id|plan)/);
    });
  }

  it("extra project SLOTS stay one-off, by design", () => {
    // Slots are not part of the subscription; paySlots must keep using orders.
    const body = HOOK.slice(HOOK.indexOf("const paySlots"));
    expect(body).toMatch(/callCreateSlotOrder/);
  });
});

describe("the customer is told that money recurs", () => {
  it("says so where the mandate is actually taken", () => {
    for (const rel of ["../components/Paywall.tsx", "../components/ManagePlanModal.tsx"]) {
      const src = read(rel);
      expect(src, `${rel} never says the charge repeats`).toMatch(
        /recurs|Billed automatically/i,
      );
    }
  });

  it("the paywall strings spell out both cadences and how to stop", () => {
    const t = read("../i18n/translations.ts");
    expect(t).toMatch(/"paywall\.recurs":[^\n]*every month/);
    expect(t).toMatch(/"paywall\.recursAnnual":[^\n]*every year/);
    // Saying it recurs without saying how to stop is half an answer.
    expect(t).toMatch(/"paywall\.recurs":[^\n]*[Cc]ancel/);
  });

  it("onboarding says paying now forfeits the remaining trial", () => {
    const t = read("../i18n/translations.ts");
    const line = t.match(/"onb\.orPayNow":[^\n]*/)?.[0] ?? "";
    expect(line).toMatch(/trial/i);
  });
});
