import { db } from "./src/server/firebase_client";
import { getDoc, doc } from "firebase/firestore";

async function run() {
  try {
    const snap = await getDoc(doc(db, "projects", "P5vv0gHsHBOIcCoJchQl"));
    console.log("Tx succeeded, exists:", snap.exists());
  } catch (err: any) {
    console.error("Tx failed:", err.message);
  }
  process.exit(0);
}
run().catch(console.error);
