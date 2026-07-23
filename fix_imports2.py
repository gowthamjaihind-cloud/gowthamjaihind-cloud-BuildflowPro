with open("src/server/telegram/handlers/log.ts", "r") as f:
    text = f.read()

text = text.replace('import { db } from "../firebase_client";', 'import { db, storage } from "../firebase_client";\nimport { ref, uploadBytes, getDownloadURL } from "firebase/storage";\nimport { serverTimestamp } from "firebase/firestore";')

with open("src/server/telegram/handlers/log.ts", "w") as f:
    f.write(text)

with open("src/server/telegram/handlers/projects.ts", "r") as f:
    text = f.read()

text = text.replace('import { db } from "../firebase_client";', 'import { db } from "../firebase_client";\nimport { serverTimestamp } from "firebase/firestore";')

with open("src/server/telegram/handlers/projects.ts", "w") as f:
    f.write(text)

with open("src/server/telegram/index.ts", "r") as f:
    text = f.read()

text = text.replace('import * as admin from "firebase-admin";', 'import { db } from "../firebase_client";\nimport { doc, updateDoc } from "firebase/firestore";')
text = text.replace('import { getFirestore } from "firebase-admin/firestore";', '')

with open("src/server/telegram/index.ts", "w") as f:
    f.write(text)

