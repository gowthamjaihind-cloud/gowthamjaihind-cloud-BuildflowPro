with open("src/server/telegram/handlers/projects.ts", "r") as f:
    text = f.read()

text = text.replace('import { serverTimestamp, deleteField } from "firebase/firestore";\\nimport { doc, getDoc, collection, query, getDocs, setDoc, orderBy, limit, addDoc, updateDoc } from "firebase/firestore";', 
'import { serverTimestamp, deleteField, doc, getDoc, collection, query, getDocs, setDoc, orderBy, limit, addDoc, updateDoc, where } from "firebase/firestore";')

text = text.replace('''    let projectsQuery = db.collection("projects");
    if (session.orgId) {
        projectsQuery = db.collection(`organizations/${session.orgId}/projects`);
    }
    const snap = await projectsQuery.where("status", "in", ["Active", "Planning"]).get();''', 
'''    const path = session.orgId ? `organizations/${session.orgId}/projects` : "projects";
    const snap = await getDocs(query(collection(db, path), where("status", "in", ["Active", "Planning"])));''')

with open("src/server/telegram/handlers/projects.ts", "w") as f:
    f.write(text)
