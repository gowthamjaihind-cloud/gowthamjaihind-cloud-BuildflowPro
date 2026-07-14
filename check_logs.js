import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

// Read firebase-applet-config.json
const configStr = fs.readFileSync('./firebase-applet-config.json', 'utf8');
const config = JSON.parse(configStr);

initializeApp({
  projectId: config.projectId,
});

const db = getFirestore();

async function check() {
  const snapshot = await db.collection('errorLogs').orderBy('timestamp', 'desc').limit(5).get();
  if (snapshot.empty) {
    console.log("No error logs found.");
    return;
  }
  snapshot.forEach(doc => {
    console.log(doc.id, doc.data());
  });
}
check();
