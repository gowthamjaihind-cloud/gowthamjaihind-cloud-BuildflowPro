import { db } from "./src/server/firebase_client";
import { doc, runTransaction, getDoc, setDoc } from "firebase/firestore";

async function run() {
  const ref1 = doc(db, "bot_link_codes", "test_code");
  const ref2 = doc(db, "users", "test_user");
  
  await setDoc(ref2, { role: "Viewer" });
  
  try {
    await runTransaction(db, async (tx) => {
      tx.set(ref1, { a: 1 });
      tx.update(ref2, { telegramChatId: 12345, telegramLinkedAt: 1111 });
    });
    console.log("Tx succeeded");
  } catch (err: any) {
    console.error("Tx failed:", err.message);
  }
  process.exit(0);
}
run().catch(console.error);
