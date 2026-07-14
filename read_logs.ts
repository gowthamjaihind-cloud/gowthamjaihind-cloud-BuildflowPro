import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, orderBy, limit, query } from "firebase/firestore";
import fs from "fs";

const configStr = fs.readFileSync('./firebase-applet-config.json', 'utf8');
const config = JSON.parse(configStr);

const app = initializeApp(config);
const db = getFirestore(app);

async function check() {
  const q = query(collection(db, "errorLogs"), orderBy("timestamp", "desc"), limit(5));
  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    console.log("No error logs found.");
    return;
  }
  snapshot.forEach(doc => {
    console.log(doc.id, doc.data());
  });
  process.exit(0);
}
check();
