import { auth } from "./src/server/firebase_client";
import { onAuthStateChanged } from "firebase/auth";

onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("Bot UID:", user.uid);
    process.exit(0);
  }
});
