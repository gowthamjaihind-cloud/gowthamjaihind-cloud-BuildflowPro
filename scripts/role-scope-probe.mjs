// Role-scope probe for firestore.rules, against the LOCAL Firestore emulator
// only (never production). No dependencies.
//
//   npx firebase-tools emulators:exec --project demo-sitetru --only firestore \
//     "node scripts/role-scope-probe.mjs"
//
// A person's role is per ORGANIZATION (organizations/{orgId}.members[uid]),
// but the rules used to read users/{uid}.role, ONE value per person, which the
// last action overwrites: creating your own organization sets it to "Owner",
// and switching organizations leaves it as it was. So someone invited into an
// organization as a Viewer who owns another one was an Owner here too: every
// project, every bill and payment, and the members map itself -- they could
// make themselves Owner and remove the real one.
//
// Each attack line below was ALLOWED before the fix that shipped with this
// script; the app paths beside them must stay ALLOWED. Exits non-zero on FAIL.

const PROJ = "demo-sitetru";
const DB = "ai-studio-97ffdc85-b348-4a76-9ede-baa3db65adee";
const HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const BASE = `http://${HOST}/v1/projects/${PROJ}/databases/${DB}/documents`;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const tok = (uid, extra = {}) =>
  `${b64({ alg: "none", typ: "JWT" })}.${b64({
    iss: `https://securetoken.google.com/${PROJ}`, aud: PROJ, iat: 1, exp: 9999999999,
    auth_time: 1, sub: uid, user_id: uid, firebase: { sign_in_provider: "password" }, ...extra,
  })}.`;
const val = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
async function write(auth, path, data) {
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const r = await fetch(`${BASE}/${path}?${mask}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: fields(data) }),
  });
  return r.status === 200;
}
async function read(auth, path) {
  const r = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${auth}` } });
  return r.status === 200;
}

// --- seed (rules bypassed) ---------------------------------------------------
const A = "org-acme", E = "org-eves";
const P = `organizations/${A}/projects/villa`;
async function seed() {
  await write("owner", `organizations/${A}`, {
    companyName: "Acme Builders", members: { alice: "Owner", pam: "Project Manager", sam: "Site Engineer", eve: "Viewer" },
  });
  await write("owner", `organizations/${E}`, { companyName: "Eve Co", members: { eve: "Owner" } });
  await write("owner", P, { name: "Villa", ownerId: "alice" });
  await write("owner", `${P}/client_payments/p1`, { amount: 200000 });
  await write("owner", `${P}/tasks/t1`, { name: "Footing" });
  await write("owner", "users/alice", { email: "a@example.com", role: "Owner", currentOrgId: A });
  await write("owner", "users/pam", { email: "p@example.com", role: "Project Manager", currentOrgId: A, projectAccess: { villa: "write" } });
  await write("owner", "users/sam", { email: "s@example.com", role: "Site Engineer", currentOrgId: A, projectAccess: { villa: "write" } });
  // Eve was invited to Acme as a Viewer, created her own org (profile role
  // "Owner"), then switched back to Acme: currentOrgId Acme, role still Owner.
  await write("owner", "users/eve", { email: "e@example.com", role: "Owner", currentOrgId: A });
}
await seed();

const alice = tok("alice"), pam = tok("pam"), sam = tok("sam"), eve = tok("eve");
let failed = 0;
const expect = async (label, want, p) => {
  const got = await p;
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${want ? "ALLOW" : "DENY "}  ${label}${ok ? "" : `  (got ${got ? "ALLOW" : "DENY"})`}`);
};

console.log("--- a Viewer who is Owner of ANOTHER org ---");
await expect("Viewer/other-org Owner reads this org's client payments", false, read(eve, `${P}/client_payments/p1`));
await expect("Viewer/other-org Owner writes a task", false, write(eve, `${P}/tasks/t2`, { name: "x" }));
await expect("Viewer/other-org Owner makes themselves Owner in the members map", false,
  write(eve, `organizations/${A}`, { members: { alice: "Owner", pam: "Project Manager", sam: "Site Engineer", eve: "Owner" } }));
await expect("Viewer/other-org Owner demotes the real Owner's profile", false, write(eve, "users/alice", { role: "Viewer" }));
await expect("Viewer/other-org Owner edits the company letterhead", false,
  write(eve, `organizations/${A}/profile/company`, { addressLine1: "x" }));

await seed();
console.log("--- managers cannot take over membership ---");
await expect("Project Manager rewrites the members map", false,
  write(pam, `organizations/${A}`, { members: { alice: "Viewer", pam: "Owner", sam: "Site Engineer", eve: "Viewer" } }));
await expect("Project Manager changes another member's role", false, write(pam, "users/sam", { role: "Owner" }));
await expect("Site Engineer rewrites the members map", false,
  write(sam, `organizations/${A}`, { members: { sam: "Owner" } }));

await seed();
console.log("--- the app's own paths still work ---");
await expect("Owner reads client payments", true, read(alice, `${P}/client_payments/p1`));
await expect("Owner edits company name", true, write(alice, `organizations/${A}`, { companyName: "Acme Builders Pvt Ltd" }));
await expect("Owner edits the letterhead", true, write(alice, `organizations/${A}/profile/company`, { addressLine1: "12 Main Rd" }));
await expect("Project Manager reads client payments", true, read(pam, `${P}/client_payments/p1`));
await expect("Project Manager records a client payment", true, write(pam, `${P}/client_payments/p2`, { amount: 5000 }));
await expect("Site Engineer writes a task", true, write(sam, `${P}/tasks/t3`, { name: "Columns" }));
await expect("Site Engineer cannot record a client payment", false, write(sam, `${P}/client_payments/p3`, { amount: 1 }));
await expect("Viewer reads their own org's doc", true, read(eve, `organizations/${A}`));

console.log(failed ? `\n${failed} FAIL` : "\nall ok");
process.exit(failed ? 1 : 0);
