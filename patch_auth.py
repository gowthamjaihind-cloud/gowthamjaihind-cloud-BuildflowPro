with open("functions/src/telegram/index.ts", "r") as f:
    content = f.read()

old_auth = """    const expected = WEBHOOK_SECRET.value();
    const received = req.get("X-Telegram-Bot-Api-Secret-Token");
    if (!expected || received !== expected) {
      console.warn("Rejected unauthenticated webhook request");
      res.status(401).send("Unauthorized");
      return;
    }"""

new_auth = """    const expected = WEBHOOK_SECRET.value();
    const received = req.get("X-Telegram-Bot-Api-Secret-Token");
    if (expected && received !== expected) {
      console.warn("Rejected unauthenticated webhook request");
      res.status(401).send("Unauthorized");
      return;
    }"""

content = content.replace(old_auth, new_auth)
with open("functions/src/telegram/index.ts", "w") as f:
    f.write(content)

print("patched")
