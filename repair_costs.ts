/**
 * Repairs GRN-derived ledger entries, cost entries, and vendor balances
 * that were written with ₹0 because their PO line rates were 0.
 *
 * DELETES NOTHING. Updates existing docs in place.
 *
 * IMPORTANT — ORDER OF OPERATIONS:
 *   1. FIRST fix your PO line-item rates (in the app, or however you prefer).
 *      This script reads rates FROM the POs. If the POs are still ₹0,
 *      this script will correctly refuse to do anything.
 *   2. THEN run this in dry-run to preview:
 *        npx tsx repair_costs.ts <projectId> [orgId]
 *   3. THEN apply for real:
 *        npx tsx repair_costs.ts <projectId> [orgId] --apply
 *
 * After it runs, touching each GRN re-triggers the goodsReceipt Cloud Function,
 * which recomputes inventory avgUnitCost from the corrected PO rates. That in
 * turn makes all your EXISTING daily-log consumption value correctly — no need
 * to re-enter any daily logs.
 */
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
const auth = getAuth(app);

const args = process.argv.slice(2).filter((a) => a !== "--apply");
const [email, password, projectId, orgId] = args;
const APPLY = process.argv.includes("--apply");

if (!email || !password || !projectId) {
  console.error(
    "\nUsage: npx tsx repair_costs.ts <email> <password> <projectId> [orgId] [--apply]\n",
  );
  process.exit(1);
}

const base = orgId
  ? `organizations/${orgId}/projects/${projectId}`
  : `projects/${projectId}`;

const money = (n: number) => "₹" + (n || 0).toLocaleString("en-IN");

async function getAll(coll: string) {
  const snap = await getDocs(collection(db, `${base}/${coll}`));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

async function main() {
  console.log("\nSigning in...");
  await signInWithEmailAndPassword(auth, email, password);
  console.log("Signed in OK.");
  console.log(`\n${APPLY ? "APPLYING REPAIRS" : "DRY RUN (no writes)"} on ${base}`);
  console.log("=".repeat(72) + "\n");

  const pos = await getAll("purchase_orders");
  const grns = await getAll("goodsReceiptNotes");
  const poById = new Map(pos.map((p) => [p.id, p]));

  // Guard: refuse to run if POs still have zero rates.
  const stillZero: string[] = [];
  for (const po of pos) {
    for (const li of po.lineItems || []) {
      if (!li.rate) stillZero.push(`${po.poNumber} / ${li.name}`);
    }
  }
  if (stillZero.length > 0) {
    console.log("STOPPING — these PO line items still have a rate of ₹0:\n");
    stillZero.forEach((s) => console.log("   " + s));
    console.log(
      "\nFix these PO rates FIRST. This script derives every corrected amount\nfrom the PO rates, so it cannot repair anything while they are still zero.\n",
    );
    return;
  }
  console.log(`PO rates look valid (${pos.length} POs). Proceeding.\n`);

  const vendorDelta = new Map<string, number>();
  let repaired = 0;

  for (const grn of grns) {
    const po = poById.get(grn.poId);
    if (!po) {
      console.log(`SKIP  GRN ${grn.grnNumber} — its PO (${grn.poId}) no longer exists`);
      continue;
    }

    // Recompute the true amount from the (now corrected) PO rates.
    let correctAmount = 0;
    for (const line of grn.lineItems || []) {
      const poLine = (po.lineItems || []).find(
        (i: any) => i.itemId === line.poLineRef,
      );
      if (poLine) correctAmount += (line.acceptedQty || 0) * (poLine.rate || 0);
    }

    // What the ledger currently says.
    let currentLedgerAmount = 0;
    if (grn.ledgerId) {
      const lSnap = await getDoc(doc(db, `${base}/ledger/${grn.ledgerId}`));
      if (lSnap.exists()) currentLedgerAmount = lSnap.data()?.amount || 0;
    }

    if (Math.abs(currentLedgerAmount - correctAmount) < 0.01) {
      continue; // already correct
    }

    console.log(
      `FIX   GRN ${grn.grnNumber}  (${grn.vendorName})\n` +
        `        ledger/cost: ${money(currentLedgerAmount)}  ->  ${money(correctAmount)}`,
    );
    repaired++;

    // Track the vendor balance delta so we correct it once at the end.
    if (grn.vendorId) {
      vendorDelta.set(
        grn.vendorId,
        (vendorDelta.get(grn.vendorId) || 0) + (correctAmount - currentLedgerAmount),
      );
    }

    if (APPLY) {
      if (grn.ledgerId) {
        await updateDoc(doc(db, `${base}/ledger/${grn.ledgerId}`), {
          amount: correctAmount,
        });
      }
      if (grn.costEntryId) {
        await updateDoc(doc(db, `${base}/costs/${grn.costEntryId}`), {
          amount: correctAmount,
        });
      }
      // Touch the GRN. This re-fires the goodsReceipt Cloud Function, which
      // recomputes inventory avgUnitCost from the corrected PO rates.
      await updateDoc(doc(db, `${base}/goodsReceiptNotes/${grn.id}`), {
        repairedAt: new Date().toISOString(),
      });
    }
  }

  // Correct vendor outstanding balances by the net delta.
  if (vendorDelta.size > 0) {
    console.log("\nVendor outstanding balance corrections:");
    for (const [vendorId, delta] of vendorDelta) {
      const vRef = doc(db, `${base}/suppliers/${vendorId}`);
      const vSnap = await getDoc(vRef);
      if (!vSnap.exists()) continue;
      const curr = vSnap.data()?.outstandingBalance || 0;
      console.log(
        `   ${vSnap.data()?.name || vendorId}: ${money(curr)} -> ${money(curr + delta)}`,
      );
      if (APPLY) {
        await updateDoc(vRef, { outstandingBalance: curr + delta });
      }
    }
  }

  console.log("\n" + "=".repeat(72));
  if (repaired === 0) {
    console.log("Nothing to repair — all GRN ledger/cost amounts already match their POs.");
  } else if (APPLY) {
    console.log(`Repaired ${repaired} GRN(s).`);
    console.log(
      "The Cloud Function is now recomputing inventory avgUnitCost.\nGive it ~30s, then check Cost Management — existing daily-log\nconsumption should now value correctly. No re-entry needed.",
    );
  } else {
    console.log(`DRY RUN — ${repaired} GRN(s) would be repaired. Nothing was written.`);
    console.log("Re-run with --apply to commit these changes.");
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
