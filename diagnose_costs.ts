/**
 * READ-ONLY cost diagnostic. Writes nothing. Completely safe to run.
 *
 * WHERE TO PUT IT:
 *   Save this file in your project's root folder — the same folder that
 *   contains package.json.
 *
 * HOW TO RUN (in a terminal, from that folder):
 *
 *   Step 1 - list your projects:
 *     npx tsx diagnose_costs.ts you@email.com yourPassword
 *
 *   Step 2 - diagnose the one you want:
 *     npx tsx diagnose_costs.ts you@email.com yourPassword <projectId>
 *
 * Your password is only used to sign in to Firebase, exactly like logging
 * into the app. It is not stored or logged.
 */
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
const auth = getAuth(app);

const [email, password, projectId, orgId] = process.argv.slice(2);

if (!email || !password) {
  console.error(
    "\nUsage: npx tsx diagnose_costs.ts <email> <password> [projectId] [orgId]\n",
  );
  process.exit(1);
}

const money = (n: number) => "Rs " + (n || 0).toLocaleString("en-IN");

async function main() {
  console.log("\nSigning in...");
  await signInWithEmailAndPassword(auth, email, password);
  console.log("Signed in OK.\n");

  if (!projectId) {
    console.log("Your projects:\n");
    const snap = await getDocs(collection(db, "projects"));
    if (snap.empty) {
      console.log("  (nothing at /projects — you may be on an org account)");
      console.log("  If so, pass your orgId as the 4th argument.\n");
      return;
    }
    snap.docs.forEach((d) =>
      console.log(`  ${d.id}    ${(d.data() as any).name || "(unnamed)"}`),
    );
    console.log(
      `\nNow re-run with the project id:\n  npx tsx diagnose_costs.ts ${email} <password> <projectId>\n`,
    );
    return;
  }

  const base = orgId
    ? `organizations/${orgId}/projects/${projectId}`
    : `projects/${projectId}`;

  const get = async (coll: string) => {
    const snap = await getDocs(collection(db, `${base}/${coll}`));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  };

  console.log(`Diagnosing: ${base}\n${"=".repeat(70)}\n`);

  const pos = await get("purchase_orders");
  console.log(`1. PURCHASE ORDERS (${pos.length})`);
  let zeroRateLines = 0;
  let totalLines = 0;
  for (const po of pos) {
    for (const li of po.lineItems || []) {
      totalLines++;
      if (!li.rate) {
        zeroRateLines++;
        console.log(
          `   ZERO RATE  ${po.poNumber}  "${li.name}"  qty=${li.orderedQty}  rate=${money(li.rate)}`,
        );
      }
    }
  }
  console.log(
    `   -> ${zeroRateLines} of ${totalLines} line items have rate = 0` +
      (zeroRateLines > 0 ? "   <== ROOT CAUSE\n" : "   (ok)\n"),
  );

  const inv = await get("inventory");
  console.log(`2. INVENTORY (${inv.length})`);
  let zeroCostItems = 0;
  for (const i of inv) {
    if (!(i.avgUnitCost ?? i.unitCost ?? 0)) {
      zeroCostItems++;
      console.log(
        `   ZERO COST  "${i.name}"  unitCost=${money(i.unitCost)}  avgUnitCost=${i.avgUnitCost === undefined ? "unset" : money(i.avgUnitCost)}`,
      );
    }
  }
  console.log(
    `   -> ${zeroCostItems} of ${inv.length} items price consumption at 0` +
      (zeroCostItems > 0 ? "   <== consumption on these = 0\n" : "   (ok)\n"),
  );

  const ledger = await get("ledger");
  console.log(`3. VENDOR LEDGER (${ledger.length} entries)`);
  console.log(`   -> ${ledger.filter((l) => !l.amount).length} entries with amount = 0`);
  ledger
    .slice(0, 8)
    .forEach((l) =>
      console.log(
        `      ${l.date}  ${l.referenceType}  ${money(l.amount)}  ${l.description || ""}`,
      ),
    );
  console.log();

  const costs = await get("costs");
  const actual = costs.filter((c) => c.type === "Actual");
  const real = actual.filter((c) => !c.isAccrual);
  console.log(`4. COST ENTRIES (${costs.length})`);
  console.log(
    `   Actual: ${actual.length}  (GRN accruals: ${actual.length - real.length}, real: ${real.length})`,
  );
  console.log(
    `   Sum of non-accrual actuals (what Cost Mgmt counts): ${money(real.reduce((s, c) => s + (c.amount || 0), 0))}`,
  );
  console.log(
    `   Unlinked (-> Project Overhead): ${costs.filter((c) => !c.taskId).length}\n`,
  );

  const logs = await get("dailyLogs");
  const invMap = new Map(inv.map((i) => [i.id, i]));
  let consumptionValue = 0;
  let orphans = 0;
  let logsWithMats = 0;
  for (const log of logs) {
    if (!log.materials?.length) continue;
    logsWithMats++;
    for (const m of log.materials) {
      const item: any = invMap.get(m.materialId);
      if (!item) {
        orphans++;
        continue;
      }
      consumptionValue +=
        (m.quantity || 0) * (item.avgUnitCost ?? item.unitCost ?? 0);
    }
  }
  console.log(
    `5. DAILY LOG CONSUMPTION (${logs.length} logs, ${logsWithMats} with materials)`,
  );
  console.log(`   Materials not matching any inventory item: ${orphans}`);
  console.log(`   TOTAL VALUE OF ALL CONSUMPTION: ${money(consumptionValue)}`);
  if (consumptionValue === 0 && logsWithMats > 0) {
    console.log("   <== You logged consumption but it values to 0.");
  }

  console.log(`\n${"=".repeat(70)}\nVERDICT:`);
  if (zeroRateLines > 0) {
    console.log("  Your PO line rates are 0. Everything downstream is therefore 0.");
    console.log("  Fix the PO rates in the app, then run repair_costs.ts.");
  } else if (zeroCostItems > 0) {
    console.log("  POs look ok, but some inventory items still price at 0.");
  } else if (consumptionValue > 0) {
    console.log("  Data looks healthy. If the app still shows 0, you are looking");
    console.log("  at a stale build — rebuild and redeploy the frontend.");
  } else {
    console.log("  No zero rates, but no consumption value either. Check that your");
    console.log("  daily logs actually have materials attached to them.");
  }
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\nERROR:", e.message || e);
    if (String(e).includes("auth/")) {
      console.error("(Check the email/password — same as logging into the app.)");
    }
    process.exit(1);
  });
