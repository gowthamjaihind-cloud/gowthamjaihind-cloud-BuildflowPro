import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

const app = initializeApp({
  projectId: firebaseConfig.projectId,
  appId: firebaseConfig.appId,
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
});
const auth = getAuth(app);

signInAnonymously(auth).then(() => console.log("Anon success")).catch(e => console.error("Anon failed:", e.code));
createUserWithEmailAndPassword(auth, "test@test.com", "test1234").then(() => console.log("Email success")).catch(e => console.error("Email failed:", e.code));

