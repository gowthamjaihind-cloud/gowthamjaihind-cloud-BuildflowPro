import re

with open("src/components/SettingsView.tsx", "r") as f:
    text = f.read()

# Remove the items from the array
text = re.sub(r'\s*{\s*id: "security"[^}]+},', '', text)
text = re.sub(r'\s*{\s*id: "integrations"[^}]+},', '', text)

# Remove the sections
security_regex = r'\{activeTab === "security" && \([\s\S]*?<\/section>\s*\)\}'
integrations_regex = r'\{activeTab === "integrations" && \([\s\S]*?<\/section>\s*\)\}'

text = re.sub(security_regex, '', text)
text = re.sub(integrations_regex, '', text)

# Remove import
text = re.sub(r'import { TelegramIntegration } from "./TelegramIntegration";\n', '', text)

with open("src/components/SettingsView.tsx", "w") as f:
    f.write(text)

print("done")
