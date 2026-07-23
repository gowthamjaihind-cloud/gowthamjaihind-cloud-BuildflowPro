import re
with open("firestore.rules", "r") as f:
    text = f.read()

text = text.replace(
    "return request.auth != null && request.auth.token.role in ['Admin', 'Project Manager', 'Project Director'];",
    "return request.auth != null && (request.auth.token.role in ['Admin', 'Project Manager', 'Project Director', 'Owner'] || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['Admin', 'Project Manager', 'Project Director', 'Owner']);"
)

text = text.replace(
    "return request.auth != null && request.auth.token.role == 'Site Engineer';",
    "return request.auth != null && (request.auth.token.role == 'Site Engineer' || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'Site Engineer');"
)

with open("firestore.rules", "w") as f:
    f.write(text)
