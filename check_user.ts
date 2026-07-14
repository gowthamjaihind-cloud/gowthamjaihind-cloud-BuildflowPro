import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

// @ts-ignore
import serviceAccount from './service-account.json' assert { type: 'json' };

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function check() {
  const users = await db.collection('users').where('email', '==', 'gowtham.jaihind@gmail.com').get();
  users.forEach(doc => {
    console.log(doc.id, doc.data());
  });
}
check();
