import os

filepath = "src/server/telegram/index.ts"
with open(filepath, "r") as f:
    text = f.read()

# Add try/catch around polling or fix the crash
text = text.replace(
    "bot.start({", 
    "bot.start({\n  onStart: (botInfo) => console.log('Bot started:', botInfo.username),\n"
)
text = text.replace(
    "bot.catch((err) => {",
    "bot.catch((err) => {\n  if (err.message.includes('Missing or insufficient permissions')) {\n    console.error('Bot Error: Missing or insufficient permissions. Please enable Anonymous Authentication in Firebase Console.');\n    return;\n  }"
)

with open(filepath, "w") as f:
    f.write(text)
