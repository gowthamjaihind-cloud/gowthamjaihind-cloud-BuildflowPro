const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.env.OUT || require('os').tmpdir() + '/sitetru-e2e';
fs.mkdirSync(OUT, { recursive: true });
const log = [];
const note = (s) => { console.log(s); log.push(s); };
async function start({ video = false } = {}) {
  const b = await chromium.launch(video ? { slowMo: 120 } : {});
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, ...(video ? { recordVideo: { dir: OUT + '/video', size: { width: 1280, height: 800 } } } : {}) });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') note('  CONSOLE ERROR: ' + m.text().replace(/\s+/g, ' ').slice(0, 220)); });
  p.on('pageerror', (e) => note('  PAGE ERROR: ' + String(e).slice(0, 220)));
  p.on('response', (r) => { if (r.status() >= 400 && !/favicon|sw\.js/.test(r.url())) note(`  HTTP ${r.status()} ${r.request().method()} ${r.url().replace(/\?.*/, '').slice(0, 140)}`); });
  p.on('dialog', (d) => { note('  DIALOG: ' + d.message().slice(0, 120)); d.accept(); });
  return { b, ctx, p };
}
let n = 0;
async function shot(p, name, list = true) {
  await p.waitForTimeout(700);
  n++;
  await p.screenshot({ path: `${OUT}/${String(n).padStart(2, '0')}-${name}.png` });
  if (list) {
    const items = await p.$$eval('button,a,[role=tab],input,select,textarea', (els) => els.filter((e) => e.offsetParent).map((e) => {
      const t = (e.innerText || e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.getAttribute('name') || e.type || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${e.tagName === 'INPUT' || e.tagName === 'SELECT' || e.tagName === 'TEXTAREA' ? '[' + e.tagName.toLowerCase() + ']' : ''}${t}`;
    }).filter(Boolean));
    note(`## ${name}: ${[...new Set(items)].slice(0, 70).join(' | ')}`);
  }
}
module.exports = { start, shot, note, log, OUT };
