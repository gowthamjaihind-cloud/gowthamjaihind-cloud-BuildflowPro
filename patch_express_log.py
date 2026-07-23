import os
import re

filepath = "src/server/telegram/handlers/log.ts"
with open(filepath, "r") as f:
    text = f.read()

# Replace imports
text = text.replace('import * as admin from "firebase-admin";', 
    'import { db } from "../../firebase_client";\nimport { collection, doc, getDoc, getDocs, query, orderBy, limit, setDoc } from "firebase/firestore";\nimport * as admin from "firebase-admin";')

# We still need admin for storage (handlePhoto), let's see. Wait, firebase_admin is initialized in server.ts but handlePhoto needs it. We can keep admin imported.

# Convert db.doc(...).get() to getDoc(doc(db, ...))
text = re.sub(r'await db\.doc\(`(.*?)`\)\.get\(\)', r'await getDoc(doc(db, `\1`))', text)

# Convert db.collection(...).orderBy(...).limit(...).get()
text = re.sub(r'await db\.collection\(`(.*?)`\)\.orderBy\("(.*?)"\)\.limit\((.*?)\)\.get\(\)', r'await getDocs(query(collection(db, `\1`), orderBy("\2"), limit(\3)))', text)

# Convert db.collection(...).orderBy(...).get()
text = re.sub(r'await db\.collection\(`(.*?)`\)\.orderBy\("(.*?)"\)\.get\(\)', r'await getDocs(query(collection(db, `\1`), orderBy("\2")))', text)

# Convert db.collection(...).limit(...).get()
text = re.sub(r'await db\.collection\(`(.*?)`\)\.limit\((.*?)\)\.get\(\)', r'await getDocs(query(collection(db, `\1`), limit(\2)))', text)

# Convert db.collection(...).doc().id
text = re.sub(r'db\.collection\(`(.*?)`\)\.doc\(\)\.id', r'doc(collection(db, `\1`)).id', text)

# Convert db.collection(...).doc(...).set(...)
text = re.sub(r'await db\.collection\(`(.*?)`\)\.doc\((.*?)\)\.set\({', r'await setDoc(doc(db, `\1/${\2}`), {', text)

# Wait, the fallback try-catch in startLog has:
text = re.sub(r'await db\.collection\(`(.*?)`\)\n            \.orderBy\("workDate", "desc"\)\n            \.limit\(1\)\n            \.get\(\)', 
r'await getDocs(query(collection(db, `\1`), orderBy("workDate", "desc"), limit(1)))', text)

with open(filepath, "w") as f:
    f.write(text)
