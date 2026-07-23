import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
initializeApp();
const db = getFirestore();
db.collection("users").limit(1).get().then(() => console.log("Success")).catch(e => console.error("Error", e));
