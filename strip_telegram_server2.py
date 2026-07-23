import re

with open("server.ts", "r") as f:
    content = f.read()

# Remove telegram specific endpoints
# First, the big bot initialization block
content = re.sub(r'  // --- Bot Initialization ---[\s\S]*?setupBotHandlers\(bot\);\n\n', '', content)

# Remove the setupBotHandlers function
content = re.sub(r'  function setupBotHandlers\(botInstance.*?\) \{[\s\S]*?\}\n\n', '', content)

# Remove helper functions outside bot block (like createStatusKeyboard)
content = re.sub(r'function createStatusKeyboard.*?\}', '', content, flags=re.DOTALL)
content = re.sub(r'function createVendorKeyboard.*?\}', '', content, flags=re.DOTALL)
content = re.sub(r'function createCategoryKeyboard.*?\}', '', content, flags=re.DOTALL)
content = re.sub(r'function generateSummaryKeyboard.*?\}', '', content, flags=re.DOTALL)

# Remove webhook post endpoints
content = re.sub(r'        app\.post\(\'/api/telegram-webhook\', express\.json\(\), async \(req, res\) => \{[\s\S]*?      \}\);', '', content)

# Remove bot initialization block
content = re.sub(r'  const token = process\.env\.TELEGRAM_BOT_TOKEN;[\s\S]*?bot\?\.startPolling\(\{ restart: true \}\);\n            \}\);\n          \}\n        \}, 5000\);\n      \}\n    \} catch \(e\) \{\n      console\.error\(\"Failed to initialize Telegram bot:\", e\);\n    \}\n  \} else \{\n    console\.warn\(\"No TELEGRAM_BOT_TOKEN provided\. The bot will not run\.\"\);\n  \}', '', content)


with open("server.ts", "w") as f:
    f.write(content)
