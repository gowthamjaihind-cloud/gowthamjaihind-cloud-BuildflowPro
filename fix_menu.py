import re

with open("src/server/telegram/handlers/log.ts", "r") as f:
    text = f.read()

# Fix pickTask to not overwrite materials if same task
text = text.replace('''            currentProgress: current,
            materials: [],
            labour: [],
            photoUrls: [],''', '''            currentProgress: current,
            materials: (session.draft && session.draft.taskId === taskId) ? session.draft.materials : [],
            labour: (session.draft && session.draft.taskId === taskId) ? session.draft.labour : [],
            photoUrls: (session.draft && session.draft.taskId === taskId) ? session.draft.photoUrls : [],''')

# Add Edit Progress button to showMenu
text = text.replace('[{ text: "✅ Save", callback_data: "sv" }],', '''[{ text: "✅ Save", callback_data: "sv" }],
        [{ text: "✏️ Edit Progress", callback_data: `ct:${d.taskId}` }],''')

# Add "Update another task" after saving
text = text.replace('''    let summary = `✅ <b>Logged</b>\\n\\n${d.taskName} — ${d.progressPercent}%`;
    if ((d.materials || []).length)
        summary += `\\n📦 ${d.materials.length} material(s)`;
    if ((d.labour || []).length)
        summary += `\\n👷 ${d.labour.length} labour`;
    await tg.editMessage(chatId, messageId, summary);''', '''    let summary = `✅ <b>Logged</b>\\n\\n${d.taskName} — ${d.progressPercent}%`;
    if ((d.materials || []).length)
        summary += `\\n📦 ${d.materials.length} material(s)`;
    if ((d.labour || []).length)
        summary += `\\n👷 ${d.labour.length} labour`;
        
    const buttons = [
        [{ text: "➕ Update another task", callback_data: "dt:changetask" }]
    ];
    await tg.editMessage(chatId, messageId, summary, buttons);''')

with open("src/server/telegram/handlers/log.ts", "w") as f:
    f.write(text)
