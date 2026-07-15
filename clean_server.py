import re

with open('server.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
skip = False

for i, line in enumerate(lines):
    if line.startswith('import TelegramBot'):
        continue
    if '// --- Telegram Bot Logic ---' in line:
        skip = True
    if '// --- Native Express Middleware ---' in line:
        skip = False
    
    if skip:
        continue
    
    new_lines.append(line)

content = "".join(new_lines)

# Remove the botActive from health endpoint
content = re.sub(r'botActive:\s*!!bot', '', content)
content = re.sub(r'res\.json\(\{\s*status:\s*"ok",\s*\}\);', 'res.json({ status: "ok" });', content)

# Remove the /api/bot-ping endpoint
ping_pattern = re.compile(r'\s*app\.get\("/api/bot-ping", async \(req, res\) => \{.*?(?=\s*app\.get\("/api/firebase-info")', re.DOTALL)
content = ping_pattern.sub('\n', content)

with open('server.ts', 'w') as f:
    f.write(content)

print("Done")
