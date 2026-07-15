with open('server.ts', 'r') as f:
    content = f.read()

content = content.replace('import crypto from "crypto";\n', '')
content = content.replace('import { getFirestore, FieldValue }', 'import { getFirestore }')

with open('server.ts', 'w') as f:
    f.write(content)

print("Done")
