// Storage rules probe, against the LOCAL Storage emulator only (never
// production). No dependencies.
//
//   bash scripts/emulators.sh   # then, in another shell:
//   node scripts/storage-rules-probe.mjs
//
// Checks tenant isolation (the orgIds token claim), the closed legacy
// /projects prefix, and the upload type list (no SVG or HTML: both can carry
// script and would run on the bucket's origin). Exits non-zero on FAIL.

const PROJ = "demo-sitetru";
const HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9199";
const BUCKET = process.env.PROBE_BUCKET || "jewel-ledger.firebasestorage.app";
const BASE = `http://${HOST}/v0/b/${BUCKET}/o`;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const tok = (uid, orgIds) =>
  `${b64({ alg: "none", typ: "JWT" })}.${b64({
    iss: `https://securetoken.google.com/${PROJ}`, aud: PROJ, iat: 1, exp: 9999999999,
    auth_time: 1, sub: uid, user_id: uid, firebase: { sign_in_provider: "password" },
    ...(orgIds ? { orgIds } : {}),
  })}.`;

// Multipart, as the Firebase SDK sends it: the content type travels in the
// metadata part (a plain media upload is stored as application/octet-stream).
async function upload(auth, path, type, body = "probe") {
  const boundary = "probe" + Date.now();
  const payload = `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${JSON.stringify({ name: path, contentType: type })}\r\n`
    + `--${boundary}\r\nContent-Type: ${type}\r\n\r\n${body}\r\n--${boundary}--`;
  const r = await fetch(`${BASE}?name=${encodeURIComponent(path)}`, {
    method: "POST",
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      "X-Goog-Upload-Protocol": "multipart",
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: payload,
  });
  return r.status === 200;
}
async function read(auth, path) {
  const r = await fetch(`${BASE}/${encodeURIComponent(path)}`, { headers: auth ? { Authorization: `Bearer ${auth}` } : {} });
  return r.status === 200;
}
async function del(auth, path) {
  const r = await fetch(`${BASE}/${encodeURIComponent(path)}`, { method: "DELETE", headers: { Authorization: `Bearer ${auth}` } });
  return r.status === 200 || r.status === 204;
}

const alice = tok("alice", ["org-acme"]);
const mallory = tok("mallory", ["org-evil"]);
const noClaim = tok("newbie");
const F = "organizations/org-acme/projects/villa/documents/plan.pdf";

let failed = 0;
const expect = async (label, want, p) => {
  const got = await p;
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${want ? "ALLOW" : "DENY "}  ${label}${ok ? "" : `  (got ${got ? "ALLOW" : "DENY"})`}`);
};

console.log("--- the app's own paths ---");
await expect("member uploads a PDF to their org", true, upload(alice, F, "application/pdf"));
await expect("member uploads a site photo", true, upload(alice, "organizations/org-acme/projects/villa/dailyLogs/d1/a.jpg", "image/jpeg"));
await expect("member uploads a CSV", true, upload(alice, "organizations/org-acme/projects/villa/boq/b.csv", "text/csv"));
await expect("member reads their org's file", true, read(alice, F));

console.log("--- tenant isolation ---");
await expect("another org's member reads the file", false, read(mallory, F));
await expect("another org's member overwrites the file", false, upload(mallory, F, "application/pdf"));
await expect("another org's member deletes the file", false, del(mallory, F));
await expect("token with no orgIds claim reads the file", false, read(noClaim, F));
await expect("signed-out request reads the file", false, read(null, F));

console.log("--- legacy prefix and file types ---");
await expect("signed-in user writes under legacy /projects", false, upload(alice, "projects/villa/x.pdf", "application/pdf"));
await expect("signed-in user reads under legacy /projects", false, read(alice, "projects/villa/x.pdf"));
await expect("member uploads an SVG", false, upload(alice, "organizations/org-acme/projects/villa/x.svg", "image/svg+xml", "<svg/>"));
await expect("member uploads HTML", false, upload(alice, "organizations/org-acme/projects/villa/x.html", "text/html", "<script>1</script>"));
await expect("member uploads to the bucket root", false, upload(alice, "x.pdf", "application/pdf"));

console.log(failed ? `\n${failed} FAIL` : "\nall ok");
process.exit(failed ? 1 : 0);
