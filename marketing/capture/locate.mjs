// Where things are on the captured screens, in screenshot pixels (3200x2000).
//
// The films aim their camera at real elements -- a KPI tile, a total, a row.
// Guessing those positions from a scaled-down contact sheet is how a punch-in
// lands half a tile off; this asks the page instead, with the same viewport,
// scale and theme the screenshots were taken at.
//
//   node marketing/capture/locate.mjs > marketing/remotion/src/pulse/boxes.json
import { chromium } from "playwright-core";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.DEMO_URL || "http://localhost:4173";
const DPR = 2;

// [screen id (matches the l-*.png name), nav label, [[key, text or /regex/]]]
const WANT = [
  ["01-dashboard", "Dashboard", [["completion", "Completion"], ["variance", "Variance"], ["risk", "Tasks at risk"], ["timeline", "Phase timeline"]]],
  ["04-daily-logs", "Daily Logs", [["workforce", "Total Workforce"], ["logcard", /Brickwork/]]],
  ["06-inventory", "Inventory", [["valuation", "Total Valuation"], ["cement", /OPC 53 Grade Cement/]]],
  ["07-procurement", "Procurement", [["polist", /^PO-2026-\d+$/]]],
  ["09-cost-management", "Cost Management", [["totalcost", "Total Cost"], ["equipdirect", "Equipment & Direct"]]],
  ["05-labour", "Labour & Billing", [["contractor", "Sample Labour Contractor"]]],
  ["11-reports", "Reports", [["report", /DAILY PROGRESS REPORT/i]]],
];

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: DPR, serviceWorkers: "block" });
await ctx.addInitScript(() => {
  try { localStorage.setItem("sitetru.demo.tour.done", "1"); localStorage.setItem("darkMode", "false"); } catch { /* ignore */ }
});
const page = await ctx.newPage();
await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
await page.addStyleTag({ content: "[data-demo-banner],[data-demo-tour]{display:none!important}" });
await page.getByText("Sample Residence — Plot 12").first().click();
await page.waitForTimeout(3500);

const out = {};
for (const [id, nav, keys] of WANT) {
  await page.getByRole("button", { name: nav, exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(2600);
  out[id] = {};
  for (const [key, text] of keys) {
    const loc = typeof text === "string" ? page.getByText(text, { exact: true }) : page.getByText(text);
    const n = await loc.count();
    if (!n) { console.error(`missing ${id}.${key}`); continue; }
    // The card the text sits in, not the text: the nearest ancestor that looks like a panel.
    const box = await loc.first().evaluate((el) => {
      let n = el;
      for (let i = 0; i < 6 && n.parentElement; i++) {
        const cs = getComputedStyle(n);
        if ((parseFloat(cs.borderRadius) >= 10 && (cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.borderTopWidth !== "0px")) || n.tagName === "TR") break;
        n = n.parentElement;
      }
      const r = n.getBoundingClientRect();
      const t = el.getBoundingClientRect();
      return { card: [r.x, r.y, r.width, r.height], text: [t.x, t.y, t.width, t.height] };
    });
    const s = (a) => a.map((v) => Math.round(v * DPR));
    out[id][key] = { card: s(box.card), text: s(box.text) };
  }
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
