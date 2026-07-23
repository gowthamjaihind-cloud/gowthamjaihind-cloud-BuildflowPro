import { auth, db } from "./src/server/firebase_client";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";

async function run() {
  try {
    const cred = await createUserWithEmailAndPassword(auth, "bot@system.local", "botpassword123!");
    console.log("Created bot user:", cred.user.uid);
  } catch (e: any) {
    if (e.code === 'auth/email-already-in-use') {
      console.log("User already exists, signing in...");
      const cred = await signInWithEmailAndPassword(auth, "bot@system.local", "botpassword123!");
      console.log("Signed in bot user:", cred.user.uid);
    } else {
      console.error("Auth error:", e.code, e.message);
    }
  }
  process.exit(0);
}
run();
