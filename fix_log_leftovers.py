import re

with open("src/server/telegram/handlers/log.ts", "r") as f:
    text = f.read()

text = text.replace('import crypto from "crypto";', 'import * as crypto from "crypto";')

text = text.replace('const lastLogSnap = await getDb().collection(`${base}/dailyLogs`)', 'const lastLogSnap = await getDocs(query(collection(db, `${base}/dailyLogs`),')
text = text.replace('.orderBy("createdAt", "desc")', 'orderBy("createdAt", "desc"),')
text = text.replace('.limit(1)', 'limit(1)')
text = text.replace('.get();', '));')

text = text.replace('await getDb().collection(`${base}/dailyLogs`).doc(d.logId).set({', 'await setDoc(doc(db, `${base}/dailyLogs/${d.logId}`), {')

# Fix bucket
text = text.replace('const file = getBucket().file(path);', 'const storageRef = ref(storage, path);')
text = text.replace('await file.save(Buffer.from(arrayBuffer), {', 'await uploadBytes(storageRef, new Uint8Array(arrayBuffer), {')
text = text.replace('const publicUrl = `https://storage.googleapis.com/${getBucket().name}/${path}`;', 'const publicUrl = await getDownloadURL(storageRef);')
text = text.replace('contentType: "image/jpeg",', 'contentType: "image/jpeg"')
text = text.replace('});', '});') # no-op

with open("src/server/telegram/handlers/log.ts", "w") as f:
    f.write(text)

with open("src/server/telegram/handlers/projects.ts", "r") as f:
    text = f.read()
text = text.replace('admin.firestore.FieldValue.serverTimestamp()', 'serverTimestamp()')
with open("src/server/telegram/handlers/projects.ts", "w") as f:
    f.write(text)

with open("src/server/telegram/index.ts", "r") as f:
    text = f.read()
text = text.replace('await getFirestore().collection("users").doc(session.userId).update({', 'await updateDoc(doc(db, "users", session.userId), {')
with open("src/server/telegram/index.ts", "w") as f:
    f.write(text)

