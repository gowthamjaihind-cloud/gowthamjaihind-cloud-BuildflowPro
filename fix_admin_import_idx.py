import os
import re

filepath = "src/server/telegram/index.ts"
with open(filepath, "r") as f:
    text = f.read()

text = text.replace('import * as admin from "firebase-admin";', 'import { getFirestore } from "firebase-admin/firestore";')
text = text.replace('await admin.firestore()', 'await getFirestore()')

with open(filepath, "w") as f:
    f.write(text)
