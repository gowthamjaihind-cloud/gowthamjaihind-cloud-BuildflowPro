import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 440, height: 952 }, deviceScaleFactor: 3 });
await p.goto("file://" + process.argv[2], { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.screenshot({ path: process.argv[3], fullPage: true });
console.log("saved", process.argv[3]);
await b.close();
