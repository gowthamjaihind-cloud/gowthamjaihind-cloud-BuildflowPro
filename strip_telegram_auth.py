with open("src/components/EnterpriseAuthView.tsx", "r") as f:
    content = f.read()

import re

# Remove telegram attributes from UserProfile interface if exists
content = re.sub(r'\s*telegramChatId\?:\s*number;', '', content)
content = re.sub(r'\s*telegramLinkedAt\?:\s*string;', '', content)

# Remove telegram related states / functions
content = re.sub(r'  const handleGenerateLinkCode = async \(u: UserProfile\) => \{[\s\S]*?  \};\n\n  const handleUnlinkTelegram = async \(u: UserProfile\) => \{[\s\S]*?  \};\n', '', content)

# Remove telegram configuration panel
config_panel = r'<div className="bg-white rounded-3xl border border-divider shadow-card overflow-hidden">[\s\S]*?</div>\n          </div>\n          <div className="bg-white rounded-3xl border border-divider shadow-card overflow-hidden">'
content = re.sub(config_panel, '<div className="bg-white rounded-3xl border border-divider shadow-card overflow-hidden">', content)

# Remove table headers
content = re.sub(r'\s*<th className="px-8 py-6">Telegram Link</th>', '', content)

# Remove table column
td_col = r'\s*<td className="px-8 py-6">[\s\S]*?</td>\n                  <td className="px-8 py-6">'
content = re.sub(td_col, '\n                  <td className="px-8 py-6">', content)

with open("src/components/EnterpriseAuthView.tsx", "w") as f:
    f.write(content)
