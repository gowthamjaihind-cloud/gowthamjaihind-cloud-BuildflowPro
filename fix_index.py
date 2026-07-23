import os

with open("temp_index.ts", "r") as f:
    text = f.read()

idx = text.find("async function handleUpdate(tg, update)")
handleUpdateCode = text[idx:]

balance = 0
closing_idx = -1
for i, char in enumerate(handleUpdateCode):
    if char == '{':
        balance += 1
    elif char == '}':
        balance -= 1
        if balance == 0:
            closing_idx = i
            break

if closing_idx != -1:
    handleUpdateCode = handleUpdateCode[:closing_idx + 1]

# Now fix the signature
handleUpdateCode = handleUpdateCode.replace("async function handleUpdate(tg, update)", "export async function handleUpdate(tg: TelegramApi, update: any)")

with open("src/server/telegram/index.ts", "a") as f:
    f.write("\n" + handleUpdateCode + "\n")
