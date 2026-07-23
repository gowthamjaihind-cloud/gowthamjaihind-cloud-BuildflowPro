with open("server.ts", "r") as f:
    text = f.read()

text = text.replace("import { startPolling } from './src/server/telegram';\n", "")
text = text.replace("  startPolling();\n", "")

with open("server.ts", "w") as f:
    f.write(text)
