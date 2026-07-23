import re
with open("src/components/EnterpriseAuthView.tsx", "r") as f:
    content = f.read()

content = re.sub(
    r'          </div>\s*<div className="bg-surface rounded-\[40px\]',
    r'          </div>\n        </div>\n      )}\n      <div className="bg-surface rounded-[40px]',
    content
)

with open("src/components/EnterpriseAuthView.tsx", "w") as f:
    f.write(content)
