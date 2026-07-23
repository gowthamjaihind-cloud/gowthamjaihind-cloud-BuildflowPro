import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

const app = initializeApp({
  projectId: firebaseConfig.projectId,
  appId: firebaseConfig.appId,
  apiKey: firebaseConfig.apiKey,
});
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

signInAnonymously(auth).then(async (cred) => {
  console.log("Anon success", cred.user.uid);
  try {
    await setDoc(doc(db, "users", cred.user.uid), { role: "Admin", uid: cred.user.uid });
    console.log("SetDoc success");
    const d = await getDoc(doc(db, "users", cred.user.uid));
    console.log("GetDoc success", d.data());
    process.exit(0);
  } catch(e) {
    console.error("Firestore error:", e);
    process.exit(1);
  }
}).catch(e => { console.error("Anon failed:", e.code); process.exit(1); });
