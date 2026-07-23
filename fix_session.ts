import { db } from "./src/server/firebase_client";
import { doc, updateDoc, setDoc } from "firebase/firestore";

async function run() {
  await setDoc(doc(db, "bot_sessions", "551085277"), {
    chatId: 551085277,
    userId: "havpOEUkVkSXtSWZbJWHEQpsqQH2",
    email: "gowtham.jaihind@gmail.com",
    linkedAt: Date.now(),
    lastSeenAt: Date.now()
  }, { merge: true });

  await updateDoc(doc(db, "users", "havpOEUkVkSXtSWZbJWHEQpsqQH2"), {
    telegramChatId: 551085277,
    telegramLinkedAt: Date.now()
  });

  console.log("Fixed session & user");
  process.exit(0);
}
run().catch(console.error);
