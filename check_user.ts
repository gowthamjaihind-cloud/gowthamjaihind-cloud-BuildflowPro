import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
initializeApp({
    credential: applicationDefault(),
    projectId: config.projectId
});
const db = getFirestore();

async function check() {
    const snap = await db.collection('users').where('email', '==', 'gowtham.jaihind@gmail.com').get();
    snap.forEach(doc => console.log(doc.data()));
}
check().catch(console.error);
