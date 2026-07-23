import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

signInAnonymously(auth).then(async () => {
    const orgs = await getDocs(query(collection(db, "projects"), limit(1)));
    if(!orgs.empty) {
        const snap = await getDocs(query(collection(db, `projects/${orgs.docs[0].id}/labor_rate_cards`), limit(1)));
        if (!snap.empty) {
            console.log(snap.docs[0].data());
        } else {
            console.log("no labor rate cards found in project " + orgs.docs[0].id);
        }
    }
    process.exit(0);
});
