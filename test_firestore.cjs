const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

async function run() {
  const users = await db.collection('users').where('email', '==', 'gowtham.jaihind@gmail.com').get();
  users.forEach(doc => console.log(doc.id, doc.data()));
}
run();
