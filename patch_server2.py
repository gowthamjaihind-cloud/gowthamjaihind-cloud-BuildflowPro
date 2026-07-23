with open("server.ts", "r") as f:
    content = f.read()

target = """const dbOptions: FirebaseFirestore.Settings = {
  ignoreUndefinedProperties: true
};

if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") {
  dbOptions.databaseId = firebaseConfig.firestoreDatabaseId;
}

db = getFirestore(dbOptions);"""

replacement = """const dbOptions: FirebaseFirestore.Settings = {
  ignoreUndefinedProperties: true
};

if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") {
  dbOptions.databaseId = firebaseConfig.firestoreDatabaseId;
}

db = getFirestore();
db.settings(dbOptions);"""

content = content.replace(target, replacement)

with open("server.ts", "w") as f:
    f.write(content)
