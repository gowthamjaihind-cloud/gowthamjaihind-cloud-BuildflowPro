import os

filepath = "src/server/telegram/index.ts"
with open(filepath, "r") as f:
    text = f.read()

import re
pattern = re.compile(r'if \(!\(global as any\)\.loggedPermissionError\) \{.*?\((global as any\)\.loggedPermissionError = true;\n\s*\})', re.DOTALL)
replacement = """if (!(global as any).loggedPermissionError) {
             console.error("========================================================");
             console.error("🔥 TELEGRAM BOT DISABLED: FIRESTORE PERMISSIONS 🔥");
             console.error("The bot cannot access Firestore because Anonymous Authentication is disabled.");
             console.error("Please enable 'Anonymous' in Firebase Console -> Authentication -> Sign-in method.");
             console.error("Polling is paused until the server is restarted with valid permissions.");
             console.error("========================================================");
             (global as any).loggedPermissionError = true;
          }"""

new_text = pattern.sub(replacement, text)

# Just in case regex doesn't match, I can do a direct string replace
old_str = """          if (!(global as any).loggedPermissionError) {
             console.error("
========================================================");
             console.error("🔥 TELEGRAM BOT DISABLED: FIRESTORE PERMISSIONS 🔥");
             console.error("The bot cannot access Firestore because Anonymous Authentication is disabled.");
             console.error("Please enable 'Anonymous' in Firebase Console -> Authentication -> Sign-in method.");
             console.error("Polling is paused until the server is restarted with valid permissions.");
             console.error("========================================================
");
             (global as any).loggedPermissionError = true;
          }"""

if new_text == text:
    new_text = text.replace(old_str, replacement)

with open(filepath, "w") as f:
    f.write(new_text)

