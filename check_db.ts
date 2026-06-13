import { getFirestore, collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

const app = initializeApp(firebaseConfig);
const firestoreClient = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function test() {
  const snaps = await getDocs(collection(firestoreClient, "bot_sessions"));
  console.log("Sessions before:", snaps.docs.map((d: any) => ({ id: d.id, ...d.data() })));
  
  for (const s of snaps.docs) {
     console.log("Deleting session:", s.id);
     await deleteDoc(doc(firestoreClient, "bot_sessions", s.id));
  }

  const snapsAfter = await getDocs(collection(firestoreClient, "bot_sessions"));
  console.log("Sessions after:", snapsAfter.docs.map((d: any) => ({ id: d.id, ...d.data() })));
}

test().catch(console.error);
