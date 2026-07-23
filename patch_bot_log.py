import os

filepath = "src/server/telegram/index.ts"
with open(filepath, "r") as f:
    text = f.read()

# We need to replace the `/log` block with a call to `startLog`
# And add `startLog` and `showTaskPicker`

