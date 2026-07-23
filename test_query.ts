import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs, query, orderBy } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

signInAnonymously(auth).then(async (cred) => {
  try {
    const snap = await getDocs(query(collection(db, "projects/test_proj/tasks"), orderBy("name")));
    console.log("Docs:", snap.size);
    process.exit(0);
  } catch(e) {
    console.error("Firestore error:", e);
    process.exit(1);
  }
});
