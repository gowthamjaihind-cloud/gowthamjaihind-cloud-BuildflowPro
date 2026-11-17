const { start, shot, note, OUT } = require('./lib.cjs');
const fs = require('fs');
const MODULES = (process.env.MODS || "Dashboard|Project Insights|WBS|Daily Logs|Labour & Billing|Inventory|Procurement|Consumption History|Cost Management|Client Estimates|Reports|Document Vault").split('|');
const DANGER = /delete|remove|sign ?out|discard|reset|archive|revoke|clear|logout|cancel subscription|pay|subscribe|upgrade|telegram|whatsapp|google|download|export|print|pdf|excel|csv|share|copy|tamil|தமிழ்|collapse sidebar|^switch$/i;
async function login(p) {
  await p.goto('http://127.0.0.1:4173/'); await p.waitForTimeout(3500);
  if (await p.getByText('Sample Villa').count()) { await p.getByText('Sample Villa').first().click(); await p.waitForTimeout(2500); await p.getByText('Skip', { exact: true }).click().catch(() => {}); return; }
  await p.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await p.locator('input[type=checkbox]').first().check();
  await p.getByPlaceholder('Email address').fill('explore@example.com');
  await p.getByPlaceholder('Password').fill('Qa-Test-2026!');
  await p.locator('form button[type=submit], button:has-text("Sign in")').last().click();
  await p.waitForTimeout(4000);
  await p.getByText('Skip', { exact: true }).click().catch(() => {});
  await p.getByText('Sample Villa').first().click(); await p.waitForTimeout(2500);
  await p.getByText('Skip', { exact: true }).click().catch(() => {});
}
async function closeOverlays(p) {
  for (let i = 0; i < 3; i++) {
    const open = await p.locator('[role=dialog], .fixed.inset-0').filter({ visible: true }).count();
    if (!open) return;
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    const still = await p.locator('[role=dialog], .fixed.inset-0').filter({ visible: true }).count();
    if (!still) return;
    const c = p.locator('[role=dialog] button, .fixed.inset-0 button').filter({ hasText: /^(Cancel|Close|Back|Done|Not now|Skip)$/i }).first();
    if (await c.count()) await c.click().catch(() => {});
    else await p.locator('[aria-label=Close], [aria-label="Close"]').filter({ visible: true }).first().click().catch(() => {});
    await p.waitForTimeout(300);
  }
}
async function openModule(p, m) {
  await closeOverlays(p);
  return p.getByRole('button', { name: m, exact: true }).first().click().then(() => true).catch(() => false);
}

async function fields(p, label) {
  const f = await p.evaluate(() => {
    const vis = e => e.offsetParent;
    const scope = [...document.querySelectorAll('[role=dialog], .fixed.inset-0')].filter(vis).pop() || document.querySelector('main');
    return [...scope.querySelectorAll('input,select,textarea,button')].filter(vis).map(e => {
      let lab = '';
      let n = e; for (let i = 0; i < 4 && !lab && n; i++) { n = n.parentElement; const l = n && n.querySelector('label'); if (l) lab = l.innerText; }
      const opts = e.tagName === 'SELECT' ? ' {' + [...e.options].map(o => o.text).slice(0, 8).join('/') + '}' : '';
      return `${e.tagName.toLowerCase()}${e.type ? ':' + e.type : ''} [${(lab || '').trim().slice(0, 30)}] ${(e.placeholder || e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)}${opts}`;
    });
  });
  note(`=== ${label}\n  ` + f.join('\n  '));
}
module.exports = { login, closeOverlays, openModule, fields };
