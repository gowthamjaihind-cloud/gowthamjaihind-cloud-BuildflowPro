with open("firestore.rules", "r") as f:
    text = f.read()

rule_to_find = 'match /users/{userId} {\n      allow read, write: if request.auth != null && (request.auth.uid == userId || isAdminOrManager());\n    }'
rule_replacement = 'match /users/{userId} {\n      allow read, write: if request.auth != null && (request.auth.uid == userId || isAdminOrManager());\n      allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly([\'telegramChatId\', \'telegramLinkedAt\']);\n    }'

text = text.replace(rule_to_find, rule_replacement)

with open("firestore.rules", "w") as f:
    f.write(text)
