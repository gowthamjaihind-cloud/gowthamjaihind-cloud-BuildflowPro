import re

with open("src/server/telegram/handlers/log.ts", "r") as f:
    text = f.read()

# Fix literal newlines in strings
text = text.replace('<b>Daily Progress</b>\nSelect the date', '<b>Daily Progress</b>\\nSelect the date')
text = text.replace('Date:</b> ${fmtDate(workDate)}\n\nLast updated task:\n<b>${taskName}</b>\n\nContinue', 'Date:</b> ${fmtDate(workDate)}\\n\\nLast updated task:\\n<b>${taskName}</b>\\n\\nContinue')
text = text.replace('<b>${t.name}</b>\nDate: ${fmtDate(dt)} · now at <b>${current}%</b>\n\n<b>Progress?</b>\n<i>Tap a number', '<b>${t.name}</b>\\nDate: ${fmtDate(dt)} · now at <b>${current}%</b>\\n\\n<b>Progress?</b>\\n<i>Tap a number')

with open("src/server/telegram/handlers/log.ts", "w") as f:
    f.write(text)
