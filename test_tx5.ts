import { db } from "./src/server/firebase_client";
import { collection, getDocs } from "firebase/firestore";

async function run() {
  try {
    const snap = await getDocs(collection(db, "projects"));
    console.log("Tx succeeded, count:", snap.size);
  } catch (err: any) {
    console.error("Tx failed:", err.message);
  }
  process.exit(0);
}
run().catch(console.error);
