import os

filepath = "src/server/telegram/index.ts"
with open(filepath, "r") as f:
    text = f.read()

text = text.replace('console.error("\\n========================================================");', 'console.error("\\n========================================================");')

# actually, it has a literal newline in the file:
text = text.replace('console.error("\\n', 'console.error("')
text = text.replace('========================================================\\n");', '========================================================");')

# just manually replace the newlines inside the quotes with proper escapes or remove them.
import re
text = re.sub(r'console\.error\("\n(.*?)"\);', r'console.error("\n\1");', text)

with open(filepath, "w") as f:
    f.write(text)
