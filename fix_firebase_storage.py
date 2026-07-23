with open("src/server/firebase_client.ts", "r") as f:
    text = f.read()

text = text.replace('import { getAuth, signInAnonymously } from "firebase/auth";', 'import { getAuth, signInAnonymously } from "firebase/auth";\nimport { getStorage } from "firebase/storage";')
text = text.replace('export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);', 'export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);\nexport const storage = getStorage(app);')

with open("src/server/firebase_client.ts", "w") as f:
    f.write(text)
