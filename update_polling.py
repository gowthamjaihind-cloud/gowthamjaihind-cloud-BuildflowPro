with open("src/server/telegram/index.ts", "r") as f:
    text = f.read()
    
text = text.replace('import { getSession', 'import { authPromise } from "../firebase_client";\nimport { getSession')
text = text.replace('export async function startPolling() {', 'export async function startPolling() {\n  await authPromise;\n')

with open("src/server/telegram/index.ts", "w") as f:
    f.write(text)
