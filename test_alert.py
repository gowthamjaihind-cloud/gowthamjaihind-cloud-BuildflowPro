import re
with open("src/components/DailyLogEntryScreen.tsx", "r") as f:
    print(f.read().find("alert(\"Report generated successfully. The respective WBS and costs are updated.\");"))
