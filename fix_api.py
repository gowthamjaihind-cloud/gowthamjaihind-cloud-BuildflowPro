with open("src/server/telegram/api.ts", "r") as f:
    text = f.read()

text = text.replace('      if (method === "getUpdates" && json.description && json.description.includes("Conflict")) {\n        // Ignore expected conflicts from multiple dev instances\n      } else {', '      if (method === "getUpdates" && json.description && json.description.includes("Conflict")) {\n        return { result: [] };\n      } else {')

with open("src/server/telegram/api.ts", "w") as f:
    f.write(text)
