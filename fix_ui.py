import re

with open("src/components/EnterpriseAuthView.tsx", "r") as f:
    content = f.read()

# Remove the Telegram Integration section completely
telegram_section = r'      <div className="flex gap-8 mb-8">[\s\S]*?</div>\n      </div>\n      <div className="bg-surface'
content = re.sub(telegram_section, '      <div className="bg-surface', content)

with open("src/components/EnterpriseAuthView.tsx", "w") as f:
    f.write(content)
