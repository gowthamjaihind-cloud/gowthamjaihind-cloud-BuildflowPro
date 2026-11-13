// Privilege-escalation and billing-bypass probe for firestore.rules, against the
// LOCAL Firestore emulator only (never production). No dependencies.
//
//   npx firebase-tools emulators:exec --project demo-sitetru --only firestore \
//     "node scripts/rules-escalation-probe.mjs"
//
// Exits non-zero if any line reads FAIL. Each attack line is a thing that was
// ALLOWED before the fix that shipped with this script:
//
//   * a user could write `role: "Owner"` onto their own users/{uid} doc, and
//     every rule trusts that field -- a Site Engineer became an Admin;
//   * any Admin (real or self-promoted) could write `subscriptionStatus:
//     "active"` and a bigger `plan` / `aiQuota` onto their org from the browser
//     console -- a paid plan for free, and server functions trust those fields;
//   * a user could point their own currentOrgId at another org and read every
//     profile in it (and, as a self-made Admin, edit them).
//
// The app paths beside them must stay ALLOWED, or the fix broke the product.
//
// The emulator accepts unsigned tokens, and "Bearer owner" bypasses rules,
// which is how the seed data is written.

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

/** PATCH with an update mask = a merge write of exactly these keys. */
async function write(auth, path, data, { create = false } = {}) {
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const pre = create ? "currentDocument.exists=false&" : "";
  const r = await fetch(`${BASE}/${path}?${pre}${mask}`, {
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
const ORG = "org-victim", OTHER = "org-other";
await write("owner", `organizations/${ORG}`, {
  companyName: "Sample Builders", plan: "starter", subscriptionStatus: "trialing", aiQuota: 50,
  members: { alice: "Owner", sam: "Site Engineer" },
});
await write("owner", `organizations/${OTHER}`, {
  companyName: "Other Co", plan: "starter", subscriptionStatus: "active", members: { olga: "Owner" },
});
await write("owner", "users/alice", { email: "a@example.com", role: "Owner", currentOrgId: ORG });
await write("owner", "users/sam", { email: "s@example.com", role: "Site Engineer", currentOrgId: ORG });
await write("owner", "users/olga", { email: "o@example.com", role: "Owner", currentOrgId: OTHER });
await write("owner", "users/mallory", { email: "m@example.com", role: "Owner", currentOrgId: OTHER });
await write("owner", `organizations/${OTHER}`, { members: { olga: "Owner", mallory: "Owner" } });

const alice = tok("alice"), sam = tok("sam"), mallory = tok("mallory"), newbie = tok("newbie");
let failed = 0;
const expect = async (label, want, p) => {
  const got = await p;
  const ok = got === want;
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label.padEnd(64)} ${got ? "allowed" : "denied"}`);
};

console.log("Attacks (must be denied):");
await expect("Site Engineer promotes self to Owner", false, write(sam, "users/sam", { role: "Owner" }));
await expect("Site Engineer grants self projectAccess", false, write(sam, "users/sam", { projectAccess: { p1: "write" } }));
await expect("Owner sets own org subscriptionStatus=active", false, write(alice, `organizations/${ORG}`, { subscriptionStatus: "active" }));
await expect("Owner raises own org aiQuota", false, write(alice, `organizations/${ORG}`, { aiQuota: 100000 }));
await expect("Owner changes own org plan", false, write(alice, `organizations/${ORG}`, { plan: "enterprise" }));
await expect("Owner clears own org trialEndsAt", false, write(alice, `organizations/${ORG}`, { trialEndsAt: 9999999999999 }));
await expect("New user creates an org that is already active", false,
  write(newbie, "organizations/org-new", { members: { newbie: "Owner" }, subscriptionStatus: "active", plan: "enterprise" }, { create: true }));
await expect("New user creates own profile as Owner", false,
  write(tok("newbie2"), "users/newbie2", { email: "n2@example.com", role: "Owner" }, { create: true }));
await expect("Outsider points currentOrgId at another org", false, write(mallory, "users/mallory", { currentOrgId: ORG }));
await expect("Outsider (Owner elsewhere) edits a victim user's role", false, write(mallory, "users/sam", { role: "Viewer" }));
await expect("Outsider reads a victim user's profile", false, read(mallory, "users/alice"));

console.log("\nApp paths (must stay allowed):");
await expect("Owner saves GSTIN / state code", true, write(alice, `organizations/${ORG}`, { gstin: "29ABCDE1234F1Z5", stateCode: "29" }));
await expect("Owner renames company", true, write(alice, `organizations/${ORG}`, { companyName: "Sample Builders Pvt Ltd" }));
await expect("Owner adds a member", true, write(alice, `organizations/${ORG}`, { members: { alice: "Owner", sam: "Site Engineer", vic: "Viewer" } }));
await expect("Owner edits a teammate's role", true, write(alice, "users/sam", { role: "Project Manager" }));
await expect("Teammate reads a teammate", true, read(sam, "users/alice"));
await expect("User records consent on own profile", true, write(sam, "users/sam", { legal: { termsVersion: "v2" } }));
await expect("User switches to an org they belong to", true, write(sam, "users/sam", { currentOrgId: ORG }));
await expect("User mirrors orgIds", true, write(sam, "users/sam", { orgIds: { 0: ORG } }));
await expect("New user creates own profile as Viewer", true,
  write(newbie, "users/newbie", { email: "n@example.com", role: "Viewer" }, { create: true }));
await expect("Claim of an unclaimed org", true,
  (async () => { await write("owner", "organizations/org-free", { companyName: "Unclaimed" }); return write(newbie, "organizations/org-free", { members: { newbie: "Owner" } }); })());

// --- per-project access ------------------------------------------------------
// vic is a Viewer with no grant; sam (now Project Manager) is granted read on
// p1 and write on p2; alice is the Owner.
const P = `organizations/${ORG}/projects`;
await write("owner", `${P}/p1`, { name: "Project One", ownerId: "alice" });
await write("owner", `${P}/p2`, { name: "Project Two", ownerId: "alice" });
await write("owner", `${P}/p1/tasks/t1`, { name: "Task" });
await write("owner", `${P}/p1/costs/c1`, { amount: 100 });
await write("owner", `${P}/p2/tasks/t1`, { name: "Task" });
await write("owner", "users/vic", { email: "v@example.com", role: "Viewer", currentOrgId: ORG });
await write("owner", "users/sam", { projectAccess: { p1: "read", p2: "write" } });
const vic = tok("vic");

console.log("\nProject access (must be denied):");
await expect("Member with no grant reads a project's costs", false, read(vic, `${P}/p1/costs/c1`));
await expect("Member with no grant writes a task", false, write(vic, `${P}/p1/tasks/t1`, { name: "x" }));
await expect("Read-only member writes a task", false, write(sam, `${P}/p1/tasks/t1`, { name: "x" }));
await expect("Member grants themselves access", false, write(vic, "users/vic", { projectAccess: { p1: "write" } }));

console.log("\nProject access (must stay allowed):");
await expect("Any member reads the project's name (portfolio list)", true, read(vic, `${P}/p1`));
await expect("Read-only member reads a task", true, read(sam, `${P}/p1/tasks/t1`));
await expect("Write member writes a task", true, write(sam, `${P}/p2/tasks/t1`, { name: "Renamed" }));
await expect("Owner reads and writes any project", true, (async () => (await read(alice, `${P}/p1/costs/c1`)) && (await write(alice, `${P}/p2/tasks/t1`, { name: "Owner edit" })))());
await expect("Project Manager creates a project", true, write(sam, `${P}/p3`, { name: "Project Three", ownerId: "sam" }, { create: true }));
await expect("...and works in the project they own", true, write(sam, `${P}/p3/tasks/t1`, { name: "First task" }, { create: true }));

// --- plan project limit -------------------------------------------------------
const CAP = "org-capped";
await write("owner", `organizations/${CAP}`, { plan: "starter", includedProjects: 1, projectCount: 1, members: { carol: "Owner" } });
await write("owner", "users/carol", { email: "c@example.com", role: "Owner", currentOrgId: CAP });
const carol = tok("carol");
console.log("\nProject limit:");
await expect("Owner at the plan's limit creates another project", false, write(carol, `organizations/${CAP}/projects/extra`, { name: "Extra", ownerId: "carol" }, { create: true }));
await expect("Owner forges the project counter", false, write(carol, `organizations/${CAP}`, { projectCount: 0 }));
await write("owner", `organizations/${CAP}`, { purchasedSlots: 1, slotsExpireAt: Date.now() + 86400000 });
await expect("...and can once a slot is bought", true, write(carol, `organizations/${CAP}/projects/extra`, { name: "Extra", ownerId: "carol" }, { create: true }));
await write("owner", `organizations/${CAP}`, { projectCount: 2, slotsExpireAt: Date.now() - 1000 });
await expect("...but not after the slot lapses", false, write(carol, `organizations/${CAP}/projects/extra2`, { name: "Extra 2", ownerId: "carol" }, { create: true }));
await expect("Existing projects stay editable over the limit", true, write(carol, `organizations/${CAP}/projects/extra`, { name: "Renamed" }));
await write("owner", `organizations/org-unl`, { plan: "enterprise", includedProjects: null, projectCount: 99, members: { carol: "Owner" } });
await expect("Uncapped plan creates freely", true, write(carol, `organizations/org-unl/projects/p100`, { name: "P100", ownerId: "carol" }, { create: true }));

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
