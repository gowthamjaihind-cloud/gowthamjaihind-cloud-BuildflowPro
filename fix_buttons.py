import re

with open("src/server/telegram/handlers/log.ts", "r") as f:
    text = f.read()

# showTaskPicker: Back to showDatePicker (dt:back)
text = text.replace('buttons.push([{ text: "✖ Cancel", callback_data: "xx" }]);\\n    await setSession(chatId, { step: "log:task" });', 
'buttons.push([{ text: "◀ Back", callback_data: "dt:back" }]);\\n    await setSession(chatId, { step: "log:task" });')

# browseTasks: Back to showTaskPicker (dt:changetask)
text = text.replace('buttons.push([{ text: "✖ Cancel", callback_data: "xx" }]);\\n    await tg.editMessage(chatId, messageId, "<b>Pick a task</b>", buttons);', 
'buttons.push([{ text: "◀ Back", callback_data: "dt:changetask" }]);\\n    await tg.editMessage(chatId, messageId, "<b>Pick a task</b>", buttons);')

# confirmTask: Back to showDatePicker
text = text.replace('[{ text: "✖ Cancel", callback_data: "xx" }]', 
'[{ text: "◀ Back", callback_data: "dt:back" }]')

# pickTask: Back to showTaskPicker (dt:changetask)
text = text.replace('rows.push([{ text: "◀ Back", callback_data: "dt:pick" }]);', 
'rows.push([{ text: "◀ Back", callback_data: "dt:changetask" }]);')
text = text.replace('rows.push([{ text: "✖ Cancel", callback_data: "xx" }]);', 
'rows.push([{ text: "◀ Back", callback_data: "dt:changetask" }]);')

# showMenu: Back to pickTask
text = text.replace('[{ text: "✖ Cancel", callback_data: "xx" }],', 
'[{ text: "◀ Back", callback_data: `dt:changetask` }],')

with open("src/server/telegram/handlers/log.ts", "w") as f:
    f.write(text)
