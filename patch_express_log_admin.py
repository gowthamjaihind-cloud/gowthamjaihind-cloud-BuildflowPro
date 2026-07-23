import os

filepath = "src/server/telegram/handlers/log.ts"

# Let's just copy it back from functions/src/telegram/handlers/log.ts
# and modify only what we need to.

os.system("cp functions/src/telegram/handlers/log.ts src/server/telegram/handlers/log.ts")

with open(filepath, "r") as f:
    text = f.read()

# Make sure we import admin properly, already there.
# Ensure no duplicates exports.
# In the decompiled log.ts, we had:
# export { startLog };
# export { browseTasks };
# ...
# And then `export async function startLog` later. This causes `Cannot redeclare exported variable 'startLog'`.
# We need to remove the top `export { ... }` block!

lines = text.split("\n")
new_lines = []
for line in lines:
    if line.startswith("export {"):
        continue
    new_lines.append(line)

text = "\n".join(new_lines)

with open(filepath, "w") as f:
    f.write(text)

