import { db } from "./src/server/firebase_client";
import { collection, getDocs } from "firebase/firestore";

async function run() {
  const codes = await getDocs(collection(db, "bot_link_codes"));
  console.log("Codes:");
  codes.docs.forEach(d => console.log(d.id, d.data()));
  process.exit(0);
}
run().catch(console.error);
