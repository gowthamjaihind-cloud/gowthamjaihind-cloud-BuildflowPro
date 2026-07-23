import glob
for file in glob.glob("src/server/telegram/*.ts"):
    with open(file, "r") as f:
        text = f.read()
    
    text = text.replace('import * as admin from "firebase-admin";\nconst db = admin.firestore();', 'import { getFirestore, FieldValue } from "firebase-admin/firestore";\nconst db = getFirestore();')
    text = text.replace('admin.firestore.FieldValue.delete()', 'FieldValue.delete()')

    with open(file, "w") as f:
        f.write(text)
