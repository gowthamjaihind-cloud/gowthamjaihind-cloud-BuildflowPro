// Owner (explore@example.com, org with Sample Villa) invites a Site Engineer;
// a new person joins with the link and we record what they can open.
const { start, shot, note, log, OUT } = require('./lib.cjs');
const { login, closeOverlays, openModule, fields } = require('./common.cjs');
const fs = require('fs');
const VIDEO = !!process.env.VIDEO;
const results = [];
async function caption(p, t) { if (!VIDEO) return; await p.evaluate((t) => { let el = document.getElementById('__qa_caption'); if (!el) { el = document.createElement('div'); el.id = '__qa_caption'; el.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647;background:rgba(15,23,42,.92);color:#fff;font:600 15px/1.3 Inter,system-ui,sans-serif;padding:8px 16px;border-radius:999px;pointer-events:none'; document.body.appendChild(el); } el.textContent = t; }, t).catch(() => {}); }
async function step(p, name, fn) { await caption(p, name); try { await fn(); results.push({ name, ok: true }); note('PASS  ' + name); } catch (e) { results.push({ name, ok: false }); note('FAIL  ' + name + ': ' + String(e.message).split('\n')[0].slice(0, 200)); await shot(p, 'FAIL-' + name.replace(/\W+/g, '-').slice(0, 40), false); } }
(async () => {
  const tA = Date.now();
  const A = await start({ video: VIDEO });
  let link, SE;
  await step(A.p, 'Owner creates a Site Engineer invite', async () => {
    await login(A.p);
    await A.p.getByRole('button', { name: /switch/i }).filter({ visible: true }).first().click();
    await A.p.getByRole('button', { name: /global settings/i }).first().click(); await A.p.waitForTimeout(1200);
    await A.p.getByRole('button', { name: 'Team', exact: true }).first().click(); await A.p.waitForTimeout(800);
    const sel = A.p.locator('select').filter({ hasText: 'Site Engineer' }).first();
    await sel.selectOption({ label: 'Site Engineer' });
    await A.p.getByRole('button', { name: /create invite/i }).click(); await A.p.waitForTimeout(3000);
    const v = await A.p.locator('input[readonly], input').filter({ visible: true }).evaluateAll((els) => els.map((e) => e.value).find((x) => /\?invite=/.test(x)));
    if (!v) throw new Error('no invite link on screen');
    link = 'http://127.0.0.1:4173/?' + v.split('?')[1];
    note('invite: ' + link);
    await shot(A.p, 'owner-invite', false);
  });
  const tB = Date.now();
  const B = await start({ video: VIDEO });
  fs.writeFileSync(OUT + '/offset.txt', String((tB - tA) / 1000));
  await caption(A.p, 'Owner: waiting for the new Site Engineer to join');
  const p = B.p;
  p.on('framenavigated', (f) => { if (f === p.mainFrame()) note('NAV ' + f.url()); });
  await step(p, 'New person signs up from the invite link', async () => {
    await p.goto(link); await p.waitForTimeout(2500);
    await shot(p, 'invite-landing', true);
    await p.getByRole('button', { name: /^sign in$|get started/i }).filter({ visible: true }).first().click();
    const ca = p.getByRole('button', { name: /create an account/i });
    if (await ca.count()) await ca.click();
    await p.getByPlaceholder('Your name').fill('Site Engineer');
    SE = `se${Date.now()}@example.com`;
    await p.getByPlaceholder('Email address').fill(SE);
    await p.getByPlaceholder('Password').fill('Qa-Test-2026!');
    await p.locator('input[type=checkbox]').first().check();
    await p.getByRole('button', { name: /^create account$/i }).click();
    for (let i = 0; i < 6; i++) { await p.waitForTimeout(700); note(`t${i} ${p.url()} :: ${(await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 80)}`); }
    await shot(p, 'invite-after-signup', true);
  });
  await step(p, 'Joins the company with the invite', async () => {
    const j = p.getByRole('button', { name: /join/i }).filter({ visible: true });
    if (await j.count()) { await j.first().click(); await p.waitForTimeout(4000); }
    await p.getByText('Skip', { exact: true }).click({ timeout: 2000 }).catch(() => {});
    await p.getByText(/portfolio/i).first().waitFor({ timeout: 15000 });
  });
  if (process.env.JOINONLY) { await A.b.close(); await B.b.close(); return; }
  await step(p, 'New member sees a clear "ask for access" message', async () => {
    await p.getByText(/don't have access to a project yet/i).waitFor({ timeout: 15000 });
  });
  await step(A.p, 'Owner gives the Site Engineer write access to Sample Villa', async () => {
    await A.p.getByRole('button', { name: 'Identity & Authorization', exact: true }).first().click(); await A.p.waitForTimeout(1500);
    await A.p.getByRole('button', { name: 'Edit role and access for ' + SE }).click(); await A.p.waitForTimeout(800);
    const row = A.p.locator('tr').filter({ hasText: SE }).first();
    await row.locator('select').filter({ hasText: 'Read / Write' }).first().selectOption('write');
    await shot(A.p, 'role-editor', false);
    await A.p.getByRole('button', { name: 'Save role and access for ' + SE }).click(); await A.p.waitForTimeout(2500);
    await row.getByText('R/W').waitFor({ timeout: 8000 });
    await shot(A.p, 'role-saved', false);
  });
  await step(p, 'Site Engineer opens the project', async () => {
    await p.reload(); await p.waitForTimeout(3000);
    await p.getByText('Sample Villa').filter({ visible: true }).first().click(); await p.waitForTimeout(2500);
    await p.getByText('Skip', { exact: true }).click({ timeout: 2000 }).catch(() => {});
    await shot(p, 'se-project', true);
  });
  for (const m of ['Daily Logs', 'Inventory', 'Procurement', 'Cost Management', 'Client Estimates', 'Labour & Billing']) {
    await step(p, `Site Engineer: ${m}`, async () => {
      const ok = await openModule(p, m);
      if (!ok) { note(`  ${m}: not in the menu`); return; }
      await p.waitForTimeout(2000);
      const t = (await p.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 160);
      note(`  ${m}: ${t}`);
      await shot(p, 'se-' + m.replace(/\W+/g, '-'), false);
    });
  }
  await step(p, 'Site Engineer: Settings', async () => {
    await p.getByRole('button', { name: /switch/i }).filter({ visible: true }).first().click(); await p.waitForTimeout(1500);
    await shot(p, 'se-portfolio2', true);
  });
  fs.writeFileSync(OUT + '/invite.log', log.join('\n'));
  const vA = await A.p.video()?.path(); const vB = await B.p.video()?.path();
  await A.ctx.close(); await B.ctx.close();
  fs.writeFileSync(OUT + '/videos.json', JSON.stringify({ vA, vB })); await A.b.close(); await B.b.close();
})();
