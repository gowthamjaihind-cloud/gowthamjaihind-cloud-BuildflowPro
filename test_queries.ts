import { db, authPromise } from "./src/server/firebase_client";
import { getDocs, query, collection, doc, getDoc } from "firebase/firestore";

async function test() {
  await authPromise;
  const base = "organizations/o1/projects/p1";
  try {
    const snap = await getDocs(query(collection(db, `${base}/dailyLogs`)));
    console.log("dailyLogs: ", snap.size);
  } catch(e: any) {
    console.log("dailyLogs error: ", e.message);
  }
}
test().then(() => process.exit(0));
