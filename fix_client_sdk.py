import os
import re

def process_file(filepath):
    with open(filepath, "r") as f:
        text = f.read()

    text = text.replace('import { getFirestore } from "firebase-admin/firestore";\nimport { getStorage } from "firebase-admin/storage";', 'import { doc, getDoc, collection, query, getDocs, setDoc, orderBy, limit, addDoc, updateDoc } from "firebase/firestore";\nimport { db } from "../firebase_client";')
    text = text.replace('import { getFirestore } from "firebase-admin/firestore";', 'import { doc, getDoc, collection, query, getDocs, setDoc, orderBy, limit, addDoc, updateDoc } from "firebase/firestore";\nimport { db } from "../firebase_client";')
    text = text.replace('const getDb = () => getFirestore();', '')
    text = text.replace('const getBucket = () => getStorage().bucket();', '')

    with open(filepath, "w") as f:
        f.write(text)

process_file("src/server/telegram/handlers/log.ts")
process_file("src/server/telegram/handlers/projects.ts")
process_file("src/server/telegram/index.ts")
