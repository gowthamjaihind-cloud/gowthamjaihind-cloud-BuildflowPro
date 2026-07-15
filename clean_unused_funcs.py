import re

with open('server.ts', 'r') as f:
    content = f.read()

content = re.sub(r'function getRelativeDateLabel.*?^\s*\}\n', '', content, flags=re.MULTILINE | re.DOTALL)
content = re.sub(r'function getProgressOptions.*?^\s*\}\n', '', content, flags=re.MULTILINE | re.DOTALL)

with open('server.ts', 'w') as f:
    f.write(content)
print("Done")
