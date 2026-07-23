import re

with open("src/server/telegram/handlers/log.ts", "r") as f:
    text = f.read()

# Fix pickLabourRole
text = text.replace('return [{ text: r.roleName || r.name || "Role", callback_data: `lr:${d.id}` }];', 
'return [{ text: r.role || r.roleName || r.name || "Role", callback_data: `lr:${d.id}` }];')

# Fix askHeadcount
text = text.replace('const roleName = r.roleName || r.name || "Role";', 
'const roleName = r.role || r.roleName || r.name || "Role";')

with open("src/server/telegram/handlers/log.ts", "w") as f:
    f.write(text)
