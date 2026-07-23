import { getDoc, doc } from "firebase/firestore";
import { db } from "./src/server/firebase_client";

async function run() {
  try {
    const snap = await getDoc(doc(db, "bot_sessions", "123"));
    console.log("Read success, exists:", snap.exists());
    process.exit(0);
  } catch(e) {
    console.error("Firestore read error:", e);
    process.exit(1);
  }
}
run();
