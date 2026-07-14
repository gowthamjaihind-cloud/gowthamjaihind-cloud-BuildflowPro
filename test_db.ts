import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const adminApp = initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
  db.collection("users").get().then((snap) => {
    console.log("Users in db:", snap.docs.length);
    snap.docs.forEach(d => console.log(d.id, d.data().email));
    process.exit(0);
  });
} catch (e) { console.error(e) }
