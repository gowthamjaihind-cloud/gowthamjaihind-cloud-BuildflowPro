import os
import re

filepath = "functions/src/telegram/index.ts"
with open(filepath, "r") as f:
    text = f.read()

# I need to add `dt` and `ct:` routes. Let's find `if (data === "xx")`
# Or better, just insert it inside the `if (cb)` block.

replacement = """        if (data === "dt") {
            await log.showTaskPicker(tg, chatId, messageId, session);
            return;
        }
        if (data.startsWith("ct:")) {
            const taskId = data.substring(3);
            await log.pickTask(tg, chatId, messageId, session, taskId);
            return;
        }
        if (data === "xx") {"""

text = text.replace('if (data === "xx") {', replacement)

with open(filepath, "w") as f:
    f.write(text)
