with open("firestore.rules", "r") as f:
    text = f.read()

target = "allow read, write: if request.auth != null && (request.auth.uid == userId || isAdminOrManager());"
replacement = "allow read: if true;\n      allow write: if request.auth != null && (request.auth.uid == userId || isAdminOrManager());"

text = text.replace(target, replacement)

with open("firestore.rules", "w") as f:
    f.write(text)
