with open("src/server/telegram/api.ts", "r") as f:
    text = f.read()

target = """    const json = await res.json();
    if (!json.ok) console.error(`Telegram ${method} failed:`, json.description);
    return json;"""

replacement = """    const json = await res.json();
    if (!json.ok) {
      if (method === "getUpdates" && json.description && json.description.includes("Conflict")) {
        // Ignore expected conflicts from multiple dev instances
      } else {
        console.error(`Telegram ${method} failed:`, json.description);
      }
      throw new Error(json.description || "Unknown Telegram API Error");
    }
    return json;"""

text = text.replace(target, replacement)

with open("src/server/telegram/api.ts", "w") as f:
    f.write(text)
