// Asserts that a normal build contains no demo-mode fixtures.
//
// Demo mode is gated on the compile-time literal __DEMO__, so a build without
// VITE_DEMO=1 should drop every demo branch and shake the fixtures out. This
// guards that: if someone converts the gate back into a helper call, or imports
// demoData from production code, the bundler can no longer fold the branch and
// the data would ship. This check fails loudly at that point.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = process.argv[2] || "dist";
const NEEDLES = ["Ramkumar Residence", "Lakshmi Steels", "Sri Balaji Cements", "demo@sitetru.com", "Demo Owner"];

// dist/demo is a deliberate, separate bundle served at sitetru.com/demo. It is
// supposed to contain fixtures, so it is excluded here and checked positively
// below instead -- otherwise this guard would fail on the demo we ship on purpose.
const SKIP = ["demo"];

const walk = (dir) => {
  let out = [];
  for (const e of readdirSync(dir)) {
    if (dir === DIST && SKIP.includes(e)) continue;
    const full = join(dir, e);
    out = out.concat(statSync(full).isDirectory() ? walk(full) : [full]);
  }
  return out;
};

let bad = [];
try {
  for (const f of walk(DIST)) {
    if (!/\.(js|mjs|cjs|html|json)$/.test(f)) continue;
    const body = readFileSync(f, "utf8");
    const hits = NEEDLES.filter((n) => body.includes(n));
    if (hits.length) bad.push(`${f} → ${hits.join(", ")}`);
  }
} catch (e) {
  console.error(`Could not read ${DIST}. Run a build first.`);
  process.exit(2);
}

if (bad.length) {
  console.error("FAIL — demo fixtures found in the production build:");
  bad.forEach((b) => console.error("  " + b));
  console.error("\nThe demo gate must stay an inline __DEMO__ check so it can be folded away.");
  process.exit(1);
}
// The other half: if the demo bundle is shipped, it must actually contain the
// fixtures. A demo that builds but shows nothing is a worse failure than one
// that does not build, because it looks fine in CI and empty to a customer.
const demoDir = join(DIST, "demo");
let demoNote = "";
if (existsSync(demoDir)) {
  const found = new Set();
  for (const f of walk(demoDir)) {
    if (!/\.(js|mjs|cjs|html|json)$/.test(f)) continue;
    const body = readFileSync(f, "utf8");
    NEEDLES.forEach((n) => body.includes(n) && found.add(n));
  }
  if (found.size === 0) {
    console.error("FAIL — dist/demo exists but carries no fixtures; the demo would open empty.");
    process.exit(1);
  }
  demoNote = ` dist/demo carries fixtures (${found.size}/${NEEDLES.length} markers).`;
}

console.log(`PASS — no demo fixtures in ${DIST}.${demoNote}`);
