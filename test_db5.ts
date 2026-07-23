import { db } from "./src/server/firebase_client";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";

async function run() {
  const q = query(collection(db, "bot_link_codes"));
  const codes = await getDocs(q);
  const arr = codes.docs.map(d => d.data());
  arr.sort((a,b) => b.createdAt - a.createdAt);
  console.log("Recent codes:", arr.slice(0, 3));
  process.exit(0);
}
run().catch(console.error);
