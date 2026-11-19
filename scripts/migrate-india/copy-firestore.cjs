#!/usr/bin/env node
/**
 * Copy every document from the Singapore database to the Mumbai one.
 *
 *   NODE_PATH=functions/node_modules node scripts/migrate-india/copy-firestore.cjs
 *
 * Env: PROJECT_ID, SOURCE_DB, TARGET_DB, OLD_BUCKET, NEW_BUCKET.
 * Credentials: Application Default Credentials (the CI service account).
 *
 * - Every collection, every subcollection, at every depth, including
 *   "missing" parent documents that exist only because they hold
 *   subcollections (listDocuments finds those; a query would not).
 * - Values keep their types: timestamps, numbers, bytes, geopoints. A
 *   DocumentReference is re-pointed at the same path in the TARGET database
 *   (left alone it would still name the old one).
 * - Every string that names the old file bucket is rewritten to the new one,
 *   which is how saved photo and bill links follow the files to Mumbai.
 * - Writes with set(), so a second run overwrites rather than duplicates. Run
 *   it again after any late writes to the old database.
 *
 * Prints a count per top-level collection, then re-counts the target and
 * fails if any collection came out short.
 */
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, DocumentReference, Timestamp, GeoPoint } = require("firebase-admin/firestore");

const need = (k) => {
  const v = process.env[k];
  if (!v) { console.error(`missing env ${k}`); process.exit(2); }
  return v;
};
const PROJECT_ID = need("PROJECT_ID");
const SOURCE_DB = need("SOURCE_DB");
const TARGET_DB = need("TARGET_DB");
const OLD_BUCKET = need("OLD_BUCKET");
const NEW_BUCKET = need("NEW_BUCKET");
if (SOURCE_DB === TARGET_DB) { console.error("source and target are the same database"); process.exit(2); }

const app = initializeApp({ projectId: PROJECT_ID });
const src = getFirestore(app, SOURCE_DB);
const dst = getFirestore(app, TARGET_DB);

let rewrites = 0;
function convert(v) {
  if (v === null || v === undefined) return v;
  if (typeof v === "string") {
    if (!v.includes(OLD_BUCKET)) return v;
    rewrites++;
    return v.split(OLD_BUCKET).join(NEW_BUCKET);
  }
  if (typeof v !== "object") return v;
  if (v instanceof DocumentReference) return dst.doc(v.path);
  if (v instanceof Timestamp || v instanceof GeoPoint || Buffer.isBuffer(v) || v instanceof Uint8Array) return v;
  if (Array.isArray(v)) return v.map(convert);
  // Other SDK value types (e.g. VectorValue) are passed through untouched.
  if (Object.getPrototypeOf(v) !== Object.prototype) return v;
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = convert(x);
  return out;
}

const writer = dst.bulkWriter();
writer.onWriteError((err) => {
  if (err.failedAttempts < 5) return true; // retry
  console.error(`write failed for ${err.documentRef.path}: ${err.message}`);
  failures++;
  return false;
});
let failures = 0;
let copied = 0;

async function copyCollection(colRef, perTop) {
  const refs = await colRef.listDocuments();
  for (let i = 0; i < refs.length; i += 200) {
    const chunk = refs.slice(i, i + 200);
    const snaps = await src.getAll(...chunk);
    for (const snap of snaps) {
      if (snap.exists) {
        writer.set(dst.doc(snap.ref.path), convert(snap.data()));
        copied++;
        perTop.count++;
      }
      for (const sub of await snap.ref.listCollections()) await copyCollection(sub, perTop);
    }
  }
}

async function countAll(db, colRef) {
  let n = 0;
  const refs = await colRef.listDocuments();
  for (let i = 0; i < refs.length; i += 200) {
    const snaps = await db.getAll(...refs.slice(i, i + 200));
    for (const s of snaps) {
      if (s.exists) n++;
      for (const sub of await s.ref.listCollections()) n += await countAll(db, sub);
    }
  }
  return n;
}

(async () => {
  console.log(`copying ${PROJECT_ID}: ${SOURCE_DB} -> ${TARGET_DB}; links ${OLD_BUCKET} -> ${NEW_BUCKET}`);
  const tops = await src.listCollections();
  const report = [];
  for (const col of tops) {
    const perTop = { name: col.id, count: 0 };
    await copyCollection(col, perTop);
    report.push(perTop);
    console.log(`  ${col.id}: ${perTop.count}`);
  }
  await writer.close();
  console.log(`copied ${copied} documents, rewrote ${rewrites} file links, ${failures} failed writes`);

  console.log("verifying target counts…");
  let short = 0;
  for (const r of report) {
    const n = await countAll(dst, dst.collection(r.name));
    const ok = n >= r.count;
    if (!ok) short++;
    console.log(`  ${r.name}: source ${r.count}, target ${n}${ok ? "" : "  <-- SHORT"}`);
  }
  if (failures || short) {
    console.error(`FAILED: ${failures} failed writes, ${short} short collections`);
    process.exit(1);
  }
  console.log("OK: every collection arrived in full");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
