import re
with open("src/components/DailyLogEntryScreen.tsx", "r") as f:
    text = f.read()

text = text.replace("      }\n      onClose();", "      }\n      alert(\"Report generated successfully. The respective WBS and costs are updated.\");\n      onClose();")

with open("src/components/DailyLogEntryScreen.tsx", "w") as f:
    f.write(text)
