import glob
for file in glob.glob("src/server/telegram/*.ts"):
    with open(file, "r") as f:
        text = f.read()
    
    if "getFirestore" in text and "firebaseConfig" not in text:
        text = text.replace('import { getFirestore, FieldValue } from "firebase-admin/firestore";', 'import { getFirestore, FieldValue } from "firebase-admin/firestore";\nimport firebaseConfig from "../../firebase-applet-config.json" with { type: "json" };')
        text = text.replace('import { getFirestore } from "firebase-admin/firestore";', 'import { getFirestore } from "firebase-admin/firestore";\nimport firebaseConfig from "../../firebase-applet-config.json" with { type: "json" };')
        text = text.replace('getFirestore().collection', 'getFirestore(firebaseConfig.firestoreDatabaseId).collection')
        text = text.replace('getFirestore().runTransaction', 'getFirestore(firebaseConfig.firestoreDatabaseId).runTransaction')

    with open(file, "w") as f:
        f.write(text)
