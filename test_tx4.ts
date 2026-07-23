import { db } from "./src/server/firebase_client";
import { collection, doc, setDoc } from "firebase/firestore";

async function run() {
  try {
    await setDoc(doc(collection(db, "dailyLogs")), { a: 1 });
    console.log("Tx succeeded");
  } catch (err: any) {
    console.error("Tx failed:", err.message);
  }
  process.exit(0);
}
run().catch(console.error);
