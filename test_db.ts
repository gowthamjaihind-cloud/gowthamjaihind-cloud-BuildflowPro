import { db } from "./src/server/firebase_client";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";

async function run() {
  const sessions = await getDocs(collection(db, "bot_sessions"));
  console.log("Sessions:");
  sessions.docs.forEach(d => console.log(d.id, d.data()));

  const users = await getDocs(collection(db, "users"));
  console.log("Users:");
  users.docs.forEach(d => console.log(d.id, d.data()));
  
  process.exit(0);
}

run().catch(console.error);
