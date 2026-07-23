import os
import re

filepath = "src/server/telegram/handlers/projects.ts"
with open(filepath, "r") as f:
    text = f.read()

text = text.replace('import * as admin from "firebase-admin";', 'import { getFirestore } from "firebase-admin/firestore";')
text = text.replace('const db = admin.firestore();', 'const db = getFirestore();')

with open(filepath, "w") as f:
    f.write(text)
