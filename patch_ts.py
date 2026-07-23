import os

filepath = "src/server/telegram/index.ts"
with open(filepath, "r") as f:
    text = f.read()

text = text.replace("global.loggedPermissionError", "(global as any).loggedPermissionError")

with open(filepath, "w") as f:
    f.write(text)
