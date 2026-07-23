import os
import re

def process_file(filepath):
    with open(filepath, "r") as f:
        text = f.read()
    
    text = text.replace('const db = getFirestore();', 'const getDb = () => getFirestore();')
    text = text.replace('const bucket = getStorage().bucket();', 'const getBucket = () => getStorage().bucket();')
    text = text.replace('await getDoc(doc(db,', 'await getDoc(doc(getDb(),')
    text = text.replace('collection(db,', 'collection(getDb(),')
    text = text.replace('await db.collection', 'await getDb().collection')
    text = text.replace('await db.doc', 'await getDb().doc')
    text = text.replace('bucket.file', 'getBucket().file')
    text = text.replace('bucket.name', 'getBucket().name')

    with open(filepath, "w") as f:
        f.write(text)

process_file("src/server/telegram/handlers/log.ts")
process_file("src/server/telegram/handlers/projects.ts")

