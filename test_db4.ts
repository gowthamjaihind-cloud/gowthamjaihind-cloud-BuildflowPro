import { db } from "./src/server/firebase_client";
import { doc, getDoc } from "firebase/firestore";

async function run() {
  const session = await getDoc(doc(db, "bot_sessions", "551085277"));
  console.log("Session:", session.data());
  process.exit(0);
}
run().catch(console.error);
