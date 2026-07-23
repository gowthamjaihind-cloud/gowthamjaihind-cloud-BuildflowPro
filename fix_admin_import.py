import os
import re

filepath = "src/server/telegram/handlers/log.ts"
with open(filepath, "r") as f:
    text = f.read()

text = text.replace('import * as admin from "firebase-admin";', 'import { getFirestore } from "firebase-admin/firestore";\nimport { getStorage } from "firebase-admin/storage";')
text = text.replace('const db = admin.firestore();', 'const db = getFirestore();')
text = text.replace('const bucket = admin.storage().bucket();', 'const bucket = getStorage().bucket();')
text = text.replace('import * as crypto from "crypto";', 'import crypto from "crypto";')

with open(filepath, "w") as f:
    f.write(text)
