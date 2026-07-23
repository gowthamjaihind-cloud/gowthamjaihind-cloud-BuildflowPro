import re

with open("firestore.rules", "r") as f:
    text = f.read()

text = text.replace(
    "match /projects/{projectId} {\n      allow read, write: if true;",
    "match /projects/{projectId} {\n      allow read: if true;\n      allow write: if request.auth != null;"
)

with open("firestore.rules", "w") as f:
    f.write(text)
