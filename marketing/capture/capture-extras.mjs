// Shots of features that live behind a click, for the films:
// stock card, a purchase order with GST, its printable document, the
// client-share dialog and "Do it for me". Same demo build and settings as
// capture-screens.mjs (serve-demo.mjs on :4173). Prints MISSING for any shot
// it could not reach instead of failing the run.
//
//   FILM_THEME=light OUT_DIR=marketing/video/screens-light node marketing/capture/capture-extras.mjs
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT_DIR || resolve(HERE, "../video/screens");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.DEMO_URL || "http://localhost:4173";
const THEME = process.env.FILM_THEME || "dark";

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, serviceWorkers: "block" });
await ctx.addInitScript((THEME) => {
  try { localStorage.setItem("sitetru.demo.tour.done", "1"); localStorage.setItem("darkMode", String(THEME !== "light")); } catch { /* ignore */ }
}, THEME);
const page = await ctx.newPage();
const hide = () => page.addStyleTag({ content: "[data-demo-banner],[data-demo-tour]{display:none!important}" });

async function openProject() {
  await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await hide();
  await page.getByText("Sample Residence — Plot 12").first().click();
  await page.waitForTimeout(3500);
}
async function nav(label) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.getByRole("button", { name: label, exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(2500);
}
async function shot(name, fn) {
  try {
    await fn();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT, `x-${name}.png`) });
    console.log(`x-${name}`);
  } catch (e) {
    console.log(`MISSING x-${name}: ${String(e.message || e).split("\n")[0].slice(0, 120)}`);
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(600);
}

await openProject();

await shot("stock-card", async () => {
  await nav("Inventory");
  await page.getByText(/OPC 53 Grade Cement/).first().click({ timeout: 8000 });
});
await shot("po-detail", async () => {
  await nav("Procurement");
  await page.getByText(/^PO-2026-\d+$/).first().click({ timeout: 8000 });
});
await shot("po-document", async () => {
  await nav("Procurement");
  await page.getByText(/^PO-2026-\d+$/).first().click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  await page.getByText("View / PDF", { exact: true }).first().click({ timeout: 8000 });
});
await shot("share", async () => {
  await nav("Dashboard");
  await page.getByRole("button", { name: /share with client/i }).first().click({ timeout: 8000 });
});
await shot("doit", async () => {
  await openProject(); // a fresh page: the share dialog can outlive Escape
  await page.getByRole("button", { name: "Help", exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  await page.getByRole("tab", { name: /do it for me/i }).first().click({ timeout: 8000 });
  await page.waitForTimeout(800);
  const box = page.locator("textarea, input[type=text]").filter({ visible: true }).last();
  await box.fill("Order 100 bags of cement from Sample Cement Supplier, deliver Friday");
});

await browser.close();
console.log("\nwrote ->", OUT);
