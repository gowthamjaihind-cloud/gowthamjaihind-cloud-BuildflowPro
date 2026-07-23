import glob
for file in glob.glob("src/server/telegram/*.ts"):
    with open(file, "r") as f:
        text = f.read()
    
    text = text.replace('const db = getFirestore();\n', '')
    text = text.replace('db.collection', 'getFirestore().collection')
    text = text.replace('db.runTransaction', 'getFirestore().runTransaction')

    with open(file, "w") as f:
        f.write(text)
