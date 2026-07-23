import re

with open("src/server/telegram/handlers/log.ts", "r") as f:
    text = f.read()

text = text.replace('''            note: (d.taskId === taskId && d.note !== undefined) ? d.note : existingNote,
        },
    
    const opts = [0, 25, 50, 75, 100];''', '''            note: (d.taskId === taskId && d.note !== undefined) ? d.note : existingNote,
        },
    });
    const opts = [0, 25, 50, 75, 100];''')

text = text.replace('''        createdAt: new Date().toISOString(),
    const recent = [''', '''        createdAt: new Date().toISOString(),
    });
    const recent = [''')

with open("src/server/telegram/handlers/log.ts", "w") as f:
    f.write(text)
