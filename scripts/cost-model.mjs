#!/usr/bin/env node
/**
 * What one project actually costs to run, per month.
 *
 * Written because "₹99 per project with unlimited validity" is a pricing
 * decision that only makes sense against a number, and nobody had the number.
 * Every input is named and sourced below so the assumptions can be argued with
 * rather than guessed at again -- change one and re-run.
 *
 *   node scripts/cost-model.mjs
 *   node scripts/cost-model.mjs --photos-per-log 4 --months 18
 *
 * The output that matters is the LAST table: a project does not stop costing
 * money when it finishes. Its photos, drawings and scanned invoices sit in
 * Cloud Storage for as long as the customer can still open it, which under
 * "unlimited validity" is forever, against revenue collected once.
 */

// ---------------------------------------------------------------- prices ----
// asia-south1 (Mumbai), USD, Blaze / pay-as-you-go, September 2026.
// Firestore single-region runs about half the US multi-region rate
// ($0.06/$0.18/$0.02 per 100k and $0.18/GiB); these are those halved rates.
const USD_INR = 95.8; // 18 Sep 2026

const P = {
  fsRead: 0.031 / 100_000, // per document read
  fsWrite: 0.094 / 100_000, // per document write
  fsDelete: 0.01 / 100_000, // per document delete
  fsStoreGiBMonth: 0.108, // per GiB-month
  gcsStoreGBMonth: 0.023, // Cloud Storage standard, per GB-month
  gcsEgressGB: 0.12, // internet egress, first 10 TB
  fnInvocation: 0.4 / 1_000_000, // Cloud Run / Functions v2 per invocation
  geminiInPerTok: 0.3 / 1_000_000, // Gemini 2.5 Flash input
  geminiOutPerTok: 2.5 / 1_000_000, // Gemini 2.5 Flash output
};

// ----------------------------------------------------------- assumptions ----
// One mid-size residential job. Where the codebase pins a number, it is used;
// where it does not, the figure is marked GUESS and is the thing to argue with.
const A = {
  months: 12, // active build duration            GUESS
  users: 3, // people on the project             GUESS
  sessionsPerUserMonth: 20, //                    GUESS
  tasks: 150, // WBS leaves (templates ship 270)  measured: wbsTemplates.ts
  workingDaysMonth: 26, //                        GUESS
  logsPerDay: 3, // daily logs across the crew    GUESS
  photosPerLog: 2, //                             GUESS
  photoKB: 250, // 1600px long edge, JPEG q0.7    measured: utils/imageCompressor.ts
  docsPerMonth: 10, // drawings, approvals (PDF)  GUESS
  docMB: 2, //                                    GUESS
  scansPerMonth: 30, // aiQuota 150 / 5 projects  measured: lib/plans.ts
  scanRawMB: 0.6, // 2200px/q0.82 since this commit  measured: services/invoiceReceiptService.ts
  //              (was 3 MB raw -- that one path was 60% of all stored bytes)
  procurementDocsMonth: 60, // POs, GRNs, bills, ledger lines   GUESS
  docsReadPerSession: 300, // 20 onSnapshot listeners re-reading their collections
  //                          measured: 20 call sites across 17 files
  avgDocKB: 2, // a Firestore document            GUESS
  // Gemini vision on an invoice: the image dominates the input.
  scanInTokens: 1600,
  scanOutTokens: 700,
};

for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i].replace(/^--/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  if (k in A) A[k] = Number(process.argv[i + 1]);
}

const inr = (usd) => usd * USD_INR;
const money = (usd) => `₹${inr(usd).toFixed(2)}`;

// ------------------------------------------------------ monthly, ACTIVE ----
const logsMonth = A.workingDaysMonth * A.logsPerDay;
const photosMonth = logsMonth * A.photosPerLog;

const writesMonth =
  logsMonth + // daily logs
  photosMonth + // photo url appends
  A.procurementDocsMonth +
  A.docsPerMonth +
  A.scansPerMonth * 3 + // scan writes bill + grn + inventory
  A.tasks / A.months; // task edits amortised

const readsMonth = A.users * A.sessionsPerUserMonth * A.docsReadPerSession;
const fnInvocationsMonth = writesMonth * 2 + A.scansPerMonth; // triggers fire per write

// storage ADDED this month
const gbAddedMonth =
  (photosMonth * A.photoKB) / 1e6 + (A.docsPerMonth * A.docMB) / 1e3 + (A.scansPerMonth * A.scanRawMB) / 1e3;

const scanCost = A.scansPerMonth * (A.scanInTokens * P.geminiInPerTok + A.scanOutTokens * P.geminiOutPerTok);

console.log(`\nAssumptions: ${A.months}-month build, ${A.users} users, ${logsMonth} logs/mo, ` +
  `${photosMonth} photos/mo, ${A.scansPerMonth} invoice scans/mo.  USD/INR ${USD_INR}\n`);

console.log("PER ACTIVE MONTH");
const rows = [
  ["Firestore reads", readsMonth, readsMonth * P.fsRead],
  ["Firestore writes", writesMonth, writesMonth * P.fsWrite],
  ["Function invocations", fnInvocationsMonth, fnInvocationsMonth * P.fnInvocation],
  ["Gemini invoice scans", A.scansPerMonth, scanCost],
];
let activeOps = 0;
for (const [label, n, usd] of rows) {
  activeOps += usd;
  console.log(`  ${label.padEnd(24)} ${String(Math.round(n)).padStart(8)}   ${money(usd).padStart(10)}`);
}
console.log(`  ${"storage ADDED".padEnd(24)} ${gbAddedMonth.toFixed(2).padStart(6)} GB`);

// ------------------------------------------- the whole build, cumulative ----
let cum = 0;
let gb = 0; // blobs in Cloud Storage
let docs = 0; // documents in Firestore
for (let m = 1; m <= A.months; m++) {
  gb += gbAddedMonth;
  docs += writesMonth;
  const fsGiB = (docs * A.avgDocKB) / 1024 / 1024;
  cum += activeOps + gb * P.gcsStoreGBMonth + fsGiB * P.fsStoreGiBMonth;
}
const totalGB = gb;
const totalDocs = docs;
console.log(`\nOVER THE ${A.months}-MONTH BUILD`);
console.log(`  data accumulated        ${totalGB.toFixed(2)} GB blobs, ${Math.round(totalDocs)} Firestore docs`);
console.log(`  total cost              ${money(cum)}`);
console.log(`  per month averaged      ${money(cum / A.months)}`);

// --------------------------------------------------- after it is finished ----
// The project is done. Nobody writes to it. It still costs money, because the
// customer can still open it -- which is exactly what "unlimited validity" sells.
const idleMonth = totalGB * P.gcsStoreGBMonth;
const openedMonth = idleMonth + 200 * P.fsRead + 0.05 * P.gcsEgressGB; // an occasional look-back

console.log(`\nAFTER HANDOVER, PER MONTH (nobody writing, data retained)`);
console.log(`  storage only            ${money(idleMonth)}`);
console.log(`  storage + occasional viewing ${money(openedMonth)}`);

console.log(`\nWHAT ₹99 ONCE ACTUALLY BUYS`);
const oneTime = 99;
const buildInr = inr(cum); // compare rupees with rupees, not rupees with dollars
if (buildInr >= oneTime) {
  console.log(`  ₹99 does not even cover the BUILD: the ${A.months} active months cost ₹${buildInr.toFixed(0)}.`);
  console.log(`  Underwater by ₹${(buildInr - oneTime).toFixed(0)} before the project is even handed over,`);
  console.log(`  and then retention keeps charging ₹${inr(idleMonth).toFixed(2)}/mo forever.`);
} else {
  const left = oneTime - buildInr;
  console.log(`  build consumes ₹${buildInr.toFixed(0)} of the ₹99, leaving ₹${left.toFixed(0)}`);
  console.log(`  retention burns ₹${inr(idleMonth).toFixed(2)}/mo -> exhausted ${(left / inr(idleMonth)).toFixed(0)} months after handover`);
}

console.log(`\nWHAT ₹99 PER PROJECT PER MONTH BUYS`);
const marginActive = 99 - inr(activeOps + totalGB * P.gcsStoreGBMonth);
console.log(`  revenue ₹99/mo against a worst-month cost of ` +
  `₹${inr(activeOps + totalGB * P.gcsStoreGBMonth).toFixed(2)} -> margin ₹${marginActive.toFixed(0)}/mo (${((marginActive / 99) * 100).toFixed(0)}%)`);
console.log(`  and retention is covered for as long as the customer keeps paying.\n`);

console.log(`NOTE: ${((A.scansPerMonth * A.scanRawMB) / 1e3 / gbAddedMonth * 100).toFixed(0)}% of the storage added each month is ` +
  `SCANNED INVOICES UPLOADED UNCOMPRESSED`);
console.log(`  (services/invoiceReceiptService.ts uploads sourceFile raw, while daily-log`);
console.log(`   photos and vault images go through compressImage at 1600px/q0.7).`);
console.log(`  Routing that one call through the same compressor cuts stored bytes per`);
console.log(`  project from ${totalGB.toFixed(2)} GB to about ` +
  `${(totalGB - (A.scansPerMonth * A.months * (A.scanRawMB - 0.25)) / 1e3).toFixed(2)} GB.\n`);
