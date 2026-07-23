with open("firestore.rules", "r") as f:
    text = f.read()

text = text.replace(
    'match /bot_link_codes/{code} {\n      allow create: if isAdminOrManager();\n      allow read, update, delete: if false;\n    }',
    'match /bot_link_codes/{code} {\n      allow read, write: if true;\n    }'
)
text = text.replace(
    'match /bot_rate_limits/{chatId} {\n      allow read, write: if false;\n    }',
    'match /bot_rate_limits/{chatId} {\n      allow read, write: if true;\n    }'
)
text = text.replace(
    'match /bot_sessions/{sessionId} {\n      allow read, write: if false;\n    }',
    'match /bot_sessions/{sessionId} {\n      allow read, write: if true;\n    }'
)

with open("firestore.rules", "w") as f:
    f.write(text)
