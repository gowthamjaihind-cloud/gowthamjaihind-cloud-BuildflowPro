with open("src/server/telegram/poll.ts", "r") as f:
    text = f.read()

text = text.replace('tg.call("deleteWebhook", { drop_pending_updates: false }).catch(() => {});\n\n  const poll = async () => {', 'tg.call("deleteWebhook", { drop_pending_updates: false }).catch(() => {}).then(() => {\n  const poll = async () => {')
text = text.replace('poll();\n}', 'poll();\n  });\n}')

with open("src/server/telegram/poll.ts", "w") as f:
    f.write(text)
