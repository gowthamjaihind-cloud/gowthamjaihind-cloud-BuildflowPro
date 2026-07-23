import re

with open("src/server/telegram/index.ts", "r") as f:
    text = f.read()

# Add dt: and ct: routing
routing_additions = """
        if (data.startsWith("dt:")) {
            const dtAction = data.slice(3);
            if (dtAction === "pick") {
                await log.pickCustomDate(tg, chatId, messageId);
            } else if (dtAction === "back") {
                await log.showDatePicker(tg, chatId, messageId, session);
            } else if (dtAction === "changetask") {
                await log.showTaskPicker(tg, chatId, messageId, session);
            } else {
                await log.confirmTask(tg, chatId, messageId, session, dtAction);
            }
            return;
        }
        
        if (data.startsWith("ct:")) {
            const taskId = data.slice(3);
            await log.pickTask(tg, chatId, messageId, session, taskId);
            return;
        }
"""

if 'data.startsWith("dt:")' not in text:
    text = text.replace('if (data.startsWith("br:")) {', routing_additions + '\n        if (data.startsWith("br:")) {')
    
with open("src/server/telegram/index.ts", "w") as f:
    f.write(text)
