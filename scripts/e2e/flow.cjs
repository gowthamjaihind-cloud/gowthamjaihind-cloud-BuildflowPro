// End-to-end journey of a brand-new customer, on the local emulators.
const { start, shot, note, log, OUT } = require('./lib.cjs');
const { closeOverlays, openModule, fields } = require('./common.cjs');
const fs = require('fs');
const VIDEO = !!process.env.VIDEO;
const EMAIL = process.env.EMAIL || `owner${Date.now()}@example.com`;
const results = [];
const UP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', LO = UP.toLowerCase();
const scope = (p) => p.locator('[role=dialog], .fixed.inset-0').filter({ visible: true }).last();
async function inScope(p) { return (await p.locator('[role=dialog], .fixed.inset-0').filter({ visible: true }).count()) ? scope(p) : p.locator('main'); }
// Labels in the app are not tied to their inputs (no htmlFor), so find the
// visible label in the open dialog (or the page) and take the next control.
let qa = 0;
async function field(p, label) {
  const id = 'qa' + (++qa);
  const ok = await p.evaluate(([label, id]) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const dialogs = [...document.querySelectorAll('[role=dialog], .fixed.inset-0, .fixed')].filter((d) => vis(d) && d.querySelector('input,select,textarea'));
    const root = dialogs.pop() || document.querySelector('main') || document.body;
    const labs = [...root.querySelectorAll('label')].filter((l) => vis(l) && l.textContent.toLowerCase().includes(label));
    for (const l of labs) {
      const all = [...root.querySelectorAll('input,select,textarea')].filter(vis);
      const next = all.find((c) => l.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (next) { next.setAttribute('data-qa', id); return true; }
    }
    return false;
  }, [label.toLowerCase(), id]);
  if (!ok) throw new Error('no field labelled ' + label);
  return p.locator(`[data-qa=${id}]`);
}
async function setRange(p, loc, v) {
  await loc.evaluate((el, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
}
const btn = async (p, re) => p.getByRole('button', { name: re }).filter({ visible: true }).last();
const pageBtn = (p, re) => p.getByRole('button', { name: re }).filter({ visible: true }).first();
async function caption(p, text) {
  if (!VIDEO) return;
  await p.evaluate((t) => {
    let el = document.getElementById('__qa_caption');
    if (!el) { el = document.createElement('div'); el.id = '__qa_caption'; el.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647;background:rgba(15,23,42,.92);color:#fff;font:600 15px/1.3 Inter,system-ui,sans-serif;padding:8px 16px;border-radius:999px;pointer-events:none;box-shadow:0 6px 20px rgba(0,0,0,.25)'; document.body.appendChild(el); }
    el.textContent = t;
  }, text).catch(() => {});
}
async function step(p, name, fn) {
  const mark = log.length;
  await caption(p, name);
  try { await fn(); results.push({ name, ok: true }); note(`PASS  ${name}`); }
  catch (e) { results.push({ name, ok: false, err: String(e.message || e).split('\n')[0] }); note(`FAIL  ${name}: ${String(e.message || e).split('\n')[0].slice(0, 200)}`); await shot(p, 'FAIL-' + name.replace(/\W+/g, '-').slice(0, 40), false); if (process.env.EXPLORE) await fields(p, 'at failure'); await closeOverlays(p); }
  const errs = log.slice(mark).filter((l) => /ERROR|HTTP [45]/.test(l));
  if (errs.length) results[results.length - 1].errors = errs;
}
const seen = async (p, text) => { await p.getByText(text).filter({ visible: true }).first().waitFor({ state: 'visible', timeout: 8000 }); };
async function stockIs(p, n) {
  const t = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
  const m = t.match(/Cement OPC 53.{0,60}?\b(\d+(?:\.\d+)?)\s*(?:bag)?\s*₹/);
  if (!m || Number(m[1]) !== n) throw new Error(`expected ${n} in stock, page says: ${(t.match(/Cement OPC 53.{0,80}/) || [''])[0]}`);
}
const pick = async (sel, re) => { const o = await sel.locator('option').allInnerTexts(); const v = o.find((t) => re.test(t)); if (!v) throw new Error('no option ' + re + ' in ' + o.join('/')); await sel.selectOption({ label: v }); };

(async () => {
  const { b, ctx, p } = await start({ video: VIDEO });
  if (VIDEO) p.setDefaultTimeout(15000);
  await step(p, 'Open sitetru landing page', async () => { await p.goto('http://127.0.0.1:4173/'); await p.waitForTimeout(2500); await p.mouse.wheel(0, 1400); await p.waitForTimeout(1200); await p.mouse.wheel(0, -1400); await p.waitForTimeout(600); });
  await step(p, 'Sign up refused without accepting terms', async () => {
    await pageBtn(p, /^sign in$/i).click();
    await pageBtn(p, /create an account/i).click();
    await p.getByPlaceholder('Your name').fill('Test Owner');
    await p.getByPlaceholder('Email address').fill(EMAIL);
    await p.getByPlaceholder('Password').fill('Qa-Test-2026!');
    await pageBtn(p, /^create account$/i).click();
    await seen(p, 'Please accept the Terms');
  });
  await step(p, 'Sign up with a new email account', async () => {
    await p.locator('input[type=checkbox]').first().check();
    await pageBtn(p, /^create account$/i).click();
    await p.getByPlaceholder(/e\.g\./).first().waitFor();
  });
  await step(p, 'Create the company (14-day free trial)', async () => {
    await p.getByPlaceholder(/e\.g\./).first().fill('Demo Constructions');
    await shot(p, 'onboarding', false);
    await pageBtn(p, /^start free trial$/i).click();
    await pageBtn(p, /add project/i).waitFor({ timeout: 20000 });
    await p.getByText('Skip', { exact: true }).click({ timeout: 2000 }).catch(() => {});
  });
  await step(p, 'Add a project from the Residential G+1 template', async () => {
    await pageBtn(p, /add project/i).click();
    // The first field (Project Name); its example text changes with the copy.
    await p.locator('input[type=text], input:not([type])').filter({ visible: true }).first().fill('Sample Villa');
    await p.getByPlaceholder('e.g. RR-2026-01').fill('SV-01');
    await p.getByPlaceholder(/Project scope/).fill('G+1 residential villa, 2,400 sq ft');
    await p.locator('input[type=date]').nth(0).fill('2026-11-01');
    await p.locator('input[type=date]').nth(1).fill('2027-08-31');
    await pick(p.locator('select').nth(1), /G\+1/);
    await pageBtn(p, /^create project$/i).click();
    await seen(p, 'Sample Villa');
    await shot(p, 'portfolio', false);
  });
  await step(p, 'Open the project dashboard', async () => {
    await p.getByText('Sample Villa').first().click(); await p.waitForTimeout(2000);
    await p.getByText('Skip', { exact: true }).click({ timeout: 2000 }).catch(() => {});
    await seen(p, 'Project Dashboard');
  });
  await step(p, 'WBS: the template created the phases and tasks', async () => {
    await openModule(p, 'WBS'); await seen(p, 'Ground floor'); await p.waitForTimeout(800);
  });
  await step(p, 'Inventory: add Cement (bag)', async () => {
    await openModule(p, 'Inventory'); await p.waitForTimeout(800);
    await pageBtn(p, /^add item$/i).click();
    const code = await field(p, 'item code'); const opts = await code.locator('option').allInnerTexts();
    if (opts.length > 2) await code.selectOption({ index: 1 });
    await (await field(p, 'item name')).fill('Cement OPC 53');
    await pick(await field(p, 'unit'), /^bag$/);
    await (await field(p, 'initial quantity')).fill('0');
    await (await field(p, 'unit cost')).fill('380');
    await (await field(p, 'low stock')).fill('20');
    await (await btn(p, /^add item$/i)).click();
    await seen(p, 'Cement OPC 53');
  });
  await step(p, 'Procurement: register supplier ABC Traders', async () => {
    await openModule(p, 'Procurement'); await p.waitForTimeout(800);
    await pageBtn(p, /^vendors$/i).click(); await pageBtn(p, /add party/i).click();
    await (await field(p, 'entity name')).fill('ABC Traders');
    await pick(await field(p, 'vendor category'), /^Material$/);
    await (await field(p, 'contact person')).fill('Ravi');
    await (await field(p, 'phone')).fill('+91 90000 00001');
    await (await field(p, 'business address')).fill('12 Market Road, Chennai');
    await (await btn(p, /register party/i)).click();
    await seen(p, 'ABC Traders');
  });
  await step(p, 'Procurement: register labour contractor XYZ Labour', async () => {
    await pageBtn(p, /add party/i).click();
    await (await field(p, 'entity name')).fill('XYZ Labour');
    await pick(await field(p, 'vendor category'), /^Labou?r$/);
    await (await field(p, 'phone')).fill('+91 90000 00002');
    await (await btn(p, /register party/i)).click();
    await seen(p, 'XYZ Labour');
  });
  await step(p, 'Raise a purchase order: 100 bags cement @ ₹380 + 18% GST', async () => {
    await pageBtn(p, /^purchase orders$/i).click(); await pageBtn(p, /new po/i).click(); await p.waitForTimeout(800);
    await pick(await field(p, 'vendor'), /ABC Traders/);
    await pick(await field(p, 'item'), /Cement/);
    await (await field(p, 'qty')).fill('100');
    await (await field(p, 'rate before tax')).fill('380');
    await (await field(p, 'hsn')).fill('2523');
    await pick(await field(p, 'gst'), /^18%$/);
    await shot(p, 'po-filled', false);
    await (await btn(p, /save draft po/i)).click();
    await seen(p, 'ABC Traders');
    await shot(p, 'po-list', false);
  });
  await step(p, 'Open the PO and approve it', async () => {
    await p.getByText('ABC Traders').first().click(); await p.waitForTimeout(1200);
    await shot(p, 'po-detail', true);
    await pageBtn(p, /approve order/i).click(); await p.waitForTimeout(1500);
    const c = p.getByRole('button', { name: /^(approve|confirm|yes)/i }).filter({ visible: true });
    if (await c.count()) await c.first().click().catch(() => {});
    await closeOverlays(p);
    await seen(p, /approved/i);
  });
  //MORE
  await step(p, 'Goods receipt: 100 bags delivered, 98 accepted, 2 rejected', async () => {
    await p.getByText('PO-2026-0001').filter({ visible: true }).first().click(); await p.waitForTimeout(1200);
    await pageBtn(p, /record goods receipt/i).click(); await p.waitForTimeout(1200);
    await (await field(p, 'challan')).fill('DC-1001');
    const nums = (await inScope(p)).locator('input[type=number]');
    await nums.nth(0).fill('100'); await nums.nth(1).fill('98');
    await (await field(p, 'notes')).fill('2 bags torn on arrival');
    await shot(p, 'grn-filled', false);
    await (await btn(p, /save receipt/i)).click();
    await p.waitForTimeout(2500); await closeOverlays(p);
    await pageBtn(p, /^goods receipt$/i).click();
    await seen(p, 'GRN-2026-0001');
  });
  await step(p, 'Inventory shows 98 bags of cement in stock', async () => {
    await openModule(p, 'Inventory'); await p.waitForTimeout(1500);
    await shot(p, 'inventory-after-grn', false);
    await stockIs(p, 98);
  });
  await step(p, 'Stock card: the receipt from ABC Traders is listed', async () => {
    await p.getByText('Cement OPC 53').filter({ visible: true }).first().click(); await p.waitForTimeout(1500);
    await seen(p, 'ABC Traders');
    await shot(p, 'stock-card', false);
    await closeOverlays(p);
  });
  await step(p, 'Labour rate card: Mason ₹900 per head for XYZ Labour', async () => {
    await openModule(p, 'Labour & Billing'); await p.waitForTimeout(1000);
    await pageBtn(p, /global rate entry/i).click(); await p.waitForTimeout(800);
    await pick(await field(p, 'vendor'), /XYZ Labour/);
    await (await field(p, 'role type')).fill('Mason');
    await (await field(p, 'rate')).fill('900');
    await (await btn(p, /^save rate$/i)).click();
    await seen(p, /1 labou?r classification/i);
    await p.getByText('XYZ Labour').filter({ visible: true }).first().click(); await p.waitForTimeout(800);
    await seen(p, 'Mason');
  });
  await step(p, 'Daily log: progress, 10 bags cement used, 4 masons', async () => {
    await openModule(p, 'Daily Logs'); await p.waitForTimeout(1000);
    await pageBtn(p, /log work now/i).click(); await p.waitForTimeout(1000);
    await pick(p.locator('select').filter({ hasText: 'Choose Location' }).filter({ visible: true }).first(), /General/);
    await p.waitForTimeout(500);
    const task = p.locator('select').filter({ visible: true }).filter({ hasText: /Choose|Site survey|Pre-construction|--/ }).nth(1);
    const opts = await task.locator('option').allInnerTexts();
    await task.selectOption({ index: Math.min(1, opts.length - 1) });
    await setRange(p, p.locator('input[type=range]').filter({ visible: true }).first(), '20');
    await (await btn(p, /add material/i)).click(); await p.waitForTimeout(600);
    if (process.env.EXPLORE) await fields(p, 'after add material');
    const msel = p.locator('select').filter({ hasText: 'Select Material' }).filter({ visible: true }).first();
    await pick(msel, /Cement/);
    await msel.locator('xpath=following::input[@type="number"][1]').fill('10');
    await (await btn(p, /add labour/i)).click(); await p.waitForTimeout(600);
    if (process.env.EXPLORE) await fields(p, 'after add labour');
    const lsel = p.locator('select').filter({ hasText: /XYZ Labour|Mason/ }).filter({ visible: true }).first();
    const lo = await lsel.locator('option').allInnerTexts();
    await lsel.selectOption({ label: lo.find((t) => /Mason|XYZ/.test(t)) });
    await p.waitForTimeout(400);
    if (process.env.EXPLORE) await fields(p, 'after labour pick');
    await lsel.locator('xpath=following::input[@type="number"][1]').fill('4');
    await (await field(p, 'note')).fill('Site clearing and marking done');
    await shot(p, 'daily-log-filled', false);
    await (await btn(p, /submit log/i)).click();
    await p.waitForTimeout(2500); await closeOverlays(p);
    await seen(p, 'Site clearing and marking done');
    await shot(p, 'daily-log-saved', false);
  });
  await step(p, 'Inventory now 88 bags (98 received − 10 used)', async () => {
    await openModule(p, 'Inventory'); await p.waitForTimeout(1500);
    await stockIs(p, 88);
  });
  await step(p, 'Cost Management: add ₹2,500 generator fuel', async () => {
    await openModule(p, 'Cost Management'); await p.waitForTimeout(1000);
    await pageBtn(p, /add transaction/i).click(); await p.waitForTimeout(800);
    await (await field(p, 'description')).fill('Generator fuel');
    await (await field(p, 'amount')).fill('2500');
    await pick(p.locator('select').filter({ hasText: /Subcontractor/ }).filter({ visible: true }).last(), /^Equipment$/);
    await (await btn(p, /save transaction/i)).click(); await p.waitForTimeout(2000);
    await closeOverlays(p);
    await seen(p, 'Generator fuel');
    await shot(p, 'costs', false);
  });
  await step(p, 'Client Estimates: create an estimate', async () => {
    await openModule(p, 'Client Estimates'); await p.waitForTimeout(1000);
    await pageBtn(p, /new estimate/i).click(); await p.waitForTimeout(800);
    await (await field(p, 'client notes')).fill('Phase 1 civil works');
    await (await btn(p, /create estimate/i)).click(); await p.waitForTimeout(2500);
    await closeOverlays(p);
    await shot(p, 'estimate', false);
    await seen(p, /EST|Draft/i);
  });
  await step(p, 'Reports: today\'s daily report includes the log', async () => {
    await openModule(p, 'Reports'); await p.waitForTimeout(2000);
    await seen(p, /Site clearing and marking done|Mason/);
    await shot(p, 'report', false);
  });
  const TABS = {
    'Project Insights': ['COST', 'LABOUR', 'PROCUREMENT', 'INVENTORY', 'PROGRESS'],
    'WBS': [],
    'Labour & Billing': ['PRICING', 'RA BILLING'],
    'Inventory': ['STOCK LEDGER', 'RECONCILIATION', 'CONFIGURATION'],
    'Procurement': ['PURCHASE ORDERS', 'GOODS RECEIPT', 'BILLS', 'RECEIPTS', 'LEDGER', 'VENDORS'],
    'Consumption History': [],
    'Cost Management': ['OVERVIEW', 'TASK COSTS', 'DIRECT COSTS', 'FULL REPORT', 'PAYMENTS'],
    'Client Estimates': [],
    'Reports': ['DAILY', 'WEEKLY', 'MONTHLY'],
    'Document Vault': ['LIST', 'GALLERY'],
  };
  for (const [m, tabs] of Object.entries(TABS)) {
    await step(p, `${m}: open${tabs.length ? ' every tab' : ''}`, async () => {
      if (!(await openModule(p, m))) throw new Error('could not open ' + m);
      await p.waitForTimeout(1200);
      for (const tb of tabs) {
        const b = p.locator('main button, main [role=tab]').filter({ visible: true }).filter({ hasText: new RegExp('^\\s*' + tb + '\\s*$', 'i') }).first();
        if (!(await b.count())) throw new Error('no tab ' + tb);
        await b.click(); await p.waitForTimeout(900);
      }
    });
  }
  await step(p, 'Dashboard reflects spend', async () => {
    await openModule(p, 'Dashboard'); await p.waitForTimeout(2000);
    await shot(p, 'dashboard-after', false);
  });
  await step(p, 'Settings: open company profile and members', async () => {
    await p.getByRole('button', { name: /switch/i }).filter({ visible: true }).first().click();
    await p.getByRole('button', { name: /global settings/i }).first().click(); await p.waitForTimeout(1500);
    await shot(p, 'settings', false);
  });
  await step(p, 'Settings: an invalid GSTIN is refused', async () => {
    await p.getByPlaceholder('e.g. 29ABCDE1234F1Z5').fill('33ABC123');
    await pageBtn(p, /save configuration/i).click();
    await seen(p, /not a valid gstin/i);
  });
  await step(p, 'Settings: a valid GSTIN is saved', async () => {
    await p.waitForTimeout(2600);
    await p.getByPlaceholder('e.g. 29ABCDE1234F1Z5').fill('33ABCDE1234F1Z5');
    await pageBtn(p, /save configuration/i).click();
    await seen(p, /saved/i);
  });
  for (const tab of ['Team', 'Master data', 'Identity & Authorization', 'Projects & Billing']) {
    await step(p, `Settings: ${tab} tab`, async () => {
      await p.getByRole('button', { name: tab, exact: true }).filter({ visible: true }).first().click();
      await p.waitForTimeout(1500);
      await shot(p, 'settings-' + tab.replace(/\W+/g, '-'), process.env.EXPLORE ? true : false);
    });
  }
  await step(p, 'Sign out', async () => {
    await p.goto('http://127.0.0.1:4173/'); await p.waitForTimeout(2500);
    await pageBtn(p, /sign out/i).click(); await p.waitForTimeout(1500);
    const c = p.getByRole('button', { name: /^(sign out|yes|confirm)/i }).filter({ visible: true });
    if (await c.count()) await c.last().click().catch(() => {});
    await pageBtn(p, /^sign in$/i).waitFor();
  });
  fs.writeFileSync(OUT + '/results.json', JSON.stringify(results, null, 1));
  fs.writeFileSync(OUT + '/flow.log', log.join('\n'));
  await ctx.close(); await b.close();
})();
