import { db } from "./src/server/firebase_client";
import { doc, getDoc } from "firebase/firestore";

async function run() {
  const u1 = await getDoc(doc(db, "users", "havpOEUkVkSXtSWZbJWHEQpsqQH2"));
  console.log("havpOEU...", u1.data());

  const u2 = await getDoc(doc(db, "users", "djLoZHML9WapJbczeiaeK66ZWfe2"));
  console.log("djLoZHML...", u2.data());

  const u3 = await getDoc(doc(db, "users", "SgWGWo3nNbg1WblXvEqgLFSHmpo2"));
  console.log("SgWGWo3...", u3.data());
  
  process.exit(0);
}
run().catch(console.error);
