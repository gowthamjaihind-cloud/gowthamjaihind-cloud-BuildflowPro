import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getStorage } from "firebase/storage";
import firebaseConfig from "../../firebase-applet-config.json" with { type: "json" };

const app = initializeApp({
  projectId: firebaseConfig.projectId,
  appId: firebaseConfig.appId,
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
});

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);
export const auth = getAuth(app);

export const authPromise = signInAnonymously(auth).then(async (credential) => {
  const uid = credential.user.uid;
  try {
    await setDoc(doc(db, "users", uid), {
      role: "Admin",
      email: "telegram-bot@system",
      displayName: "Telegram Bot",
      uid: uid
    }, { merge: true });
    console.log("Bot successfully authenticated anonymously and initialized as Admin:", uid);
  } catch (err) {
    console.error("Failed to initialize Bot Admin profile:", err);
  }
}).catch((error) => {
  if (error.code === 'auth/admin-restricted-operation') {
    console.error("\n========================================================");
    console.error("🔥 ACTION REQUIRED: TELEGRAM BOT FIRESTORE ACCESS 🔥");
    console.error("The Telegram bot needs Anonymous Authentication to access Firestore.");
    console.error("Please enable 'Anonymous' in Firebase Console -> Authentication -> Sign-in method.");
    console.error("========================================================\n");
  } else {
    console.error("Firebase Anonymous Auth Error (Telegram Backend):", error);
  }
});
