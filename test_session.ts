import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const adminApp = initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
  db.collection("bot_sessions").doc("123").get().then((snap) => {
    console.log("Session:", snap.data());
    process.exit(0);
  });
} catch (e) {}
