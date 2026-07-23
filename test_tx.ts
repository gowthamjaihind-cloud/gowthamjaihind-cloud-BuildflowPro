import { db } from "./src/server/firebase_client";
import { doc, runTransaction, getDoc } from "firebase/firestore";

async function run() {
  const ref1 = doc(db, "bot_link_codes", "test_code");
  const ref2 = doc(db, "users", "test_user");
  
  try {
    await runTransaction(db, async (tx) => {
      tx.set(ref1, { a: 1 });
      tx.update(ref2, { b: 2 });
    });
    console.log("Tx succeeded");
  } catch (err: any) {
    console.error("Tx failed:", err.message);
  }
  process.exit(0);
}
run().catch(console.error);
