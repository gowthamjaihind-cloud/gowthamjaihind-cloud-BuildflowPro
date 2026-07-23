import re

with open("firestore.rules", "r") as f:
    text = f.read()

# organizations
text = text.replace("match /organizations/{orgId} {\n      allow read: if true;", "match /organizations/{orgId} {\n      allow read: if request.auth != null;")

# projects
text = text.replace("match /projects/{projectId} {\n      allow read: if true;\n      allow write: if request.auth != null;", "match /projects/{projectId} {\n      allow read, write: if request.auth != null;")

text = text.replace("match /projects/{projectId} {\n        allow read: if true;", "match /projects/{projectId} {\n        allow read: if request.auth != null;")

# dailyLogs
text = text.replace(
    "match /dailyLogs/{logId} {\n          allow read: if true;\n          allow create: if true;",
    "match /dailyLogs/{logId} {\n          allow read: if request.auth != null;\n          allow create: if request.auth != null && (isSiteEngineer() || isAdminOrManager());"
)
text = text.replace(
    "match /{path=**}/dailyLogs/{logId} {\n      allow read: if true;\n      allow create: if true;",
    "match /{path=**}/dailyLogs/{logId} {\n      allow read: if request.auth != null;\n      allow create: if request.auth != null && (isSiteEngineer() || isAdminOrManager());"
)

# tasks
text = text.replace(
    "match /{collection}/{docId} {\n          allow read, write: if true",
    "match /{collection}/{docId} {\n          allow read, write: if request.auth != null"
)

with open("firestore.rules", "w") as f:
    f.write(text)

