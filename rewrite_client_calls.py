import re

def rewrite(filepath):
    with open(filepath, "r") as f:
        text = f.read()

    # await getDb().doc(`...`).get()  => await getDoc(doc(db, `...`))
    text = re.sub(r'await getDb\(\)\.doc\((.*?)\)\.get\(\)', r'await getDoc(doc(db, \1))', text)
    text = re.sub(r'getDb\(\)\.doc\((.*?)\)', r'doc(db, \1)', text)
    
    # await getDb().collection(`...`).orderBy(...).limit(...).get() 
    # => await getDocs(query(collection(db, `...`), orderBy(...), limit(...)))
    def replace_query(m):
        base_col = m.group(1)
        rest = m.group(2)
        
        # Parse orderBy and limit
        clauses = []
        ob = re.search(r'orderBy\((.*?)\)', rest)
        if ob:
            clauses.append(f'orderBy({ob.group(1)})')
        
        lm = re.search(r'limit\((.*?)\)', rest)
        if lm:
            clauses.append(f'limit({lm.group(1)})')
        
        clause_str = ", ".join(clauses)
        if clause_str:
            return f'await getDocs(query(collection(db, {base_col}), {clause_str}))'
        else:
            return f'await getDocs(collection(db, {base_col}))'

    text = re.sub(r'await getDb\(\)\.collection\((.*?)\)(.*?)\.get\(\)', replace_query, text)
    
    # db.collection(`...`).doc().id => doc(collection(db, `...`)).id
    text = re.sub(r'db\.collection\((.*?)\)\.doc\(\)\.id', r'doc(collection(db, \1)).id', text)

    # .set({...}) => setDoc(..., {...})
    # This usually follows getDb().doc(...) which we already replaced to doc(db, ...)
    # Wait, in the code we might have `await doc(db, ...).set({...})`
    # Let's replace `await doc(db, ...).set({...})` with `await setDoc(doc(db, ...), {...})`
    text = re.sub(r'await (doc\(db,\s*.*?\))\.set\((.*?)\)', r'await setDoc(\1, \2)', text)
    text = re.sub(r'await (doc\(db,\s*.*?\))\.update\((.*?)\)', r'await updateDoc(\1, \2)', text)

    # Also handle doc.data() and doc.id in maps. Wait, snap.exists is a property in client SDK? Yes, for DocumentSnapshot, it is snap.exists() usually, but wait, snap.exists() is a function in client SDK, but property in admin SDK!
    text = re.sub(r'snap\.exists([^\(])', r'snap.exists()\1', text)
    # snap.docs is the same.
    # d.data() is the same.
    
    with open(filepath, "w") as f:
        f.write(text)

rewrite("src/server/telegram/handlers/log.ts")
rewrite("src/server/telegram/handlers/projects.ts")
rewrite("src/server/telegram/index.ts")

