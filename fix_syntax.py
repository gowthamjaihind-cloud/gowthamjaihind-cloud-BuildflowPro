import re

with open("src/server/telegram/handlers/log.ts", "r") as f:
    text = f.read()

# 186
text = text.replace('''            note: (d.taskId === taskId && d.note !== undefined) ? d.note : existingNote,
        },
    const opts = [0, 25, 50, 75, 100];''', '''            note: (d.taskId === taskId && d.note !== undefined) ? d.note : existingNote,
        },
    });
    const opts = [0, 25, 50, 75, 100];''')

# 248
text = text.replace('''            pendingMaterial: { materialId: invId, name: item.name, unit: item.unit || "" },
        },
    await tg.editMessage''', '''            pendingMaterial: { materialId: invId, name: item.name, unit: item.unit || "" },
        },
    });
    await tg.editMessage''')

# 260
text = text.replace('''        return [{ text: r.role || r.roleName || r.name || "Role", callback_data: `lr:${d.id}` }];
    rows.push([{ text: "◀ Back", callback_data: "bk" }]);''', '''        return [{ text: r.role || r.roleName || r.name || "Role", callback_data: `lr:${d.id}` }];
    });
    rows.push([{ text: "◀ Back", callback_data: "bk" }]);''')

# 273
text = text.replace('''        draft: { ...(session.draft || {}), pendingLabour: { roleId, roleName } },
    await tg.editMessage''', '''        draft: { ...(session.draft || {}), pendingLabour: { roleId, roleName } },
    });
    await tg.editMessage''')

# 320
text = text.replace('''        createdByUid: session.userId,
        createdByName: session.email || "Telegram Bot",
        createdAt: new Date().toISOString(),
    const recent = [''', '''        createdByUid: session.userId,
        createdByName: session.email || "Telegram Bot",
        createdAt: new Date().toISOString(),
    });
    const recent = [''')

with open("src/server/telegram/handlers/log.ts", "w") as f:
    f.write(text)
