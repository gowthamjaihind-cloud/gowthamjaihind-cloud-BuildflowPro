import { db } from "./src/server/firebase_client";
import { doc, runTransaction } from "firebase/firestore";

async function run() {
  const ref1 = doc(db, "bot_link_codes", "IZXYXLAF");
  const ref2 = doc(db, "users", "havpOEUkVkSXtSWZbJWHEQpsqQH2");
  
  try {
    await runTransaction(db, async (tx) => {
      tx.update(ref1, { used: true });
      tx.update(ref2, { telegramChatId: 12345, telegramLinkedAt: 1111 });
    });
    console.log("Tx succeeded");
  } catch (err: any) {
    console.error("Tx failed:", err.message);
  }
  process.exit(0);
}
run().catch(console.error);
