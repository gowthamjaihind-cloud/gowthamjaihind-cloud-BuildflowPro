with open("src/components/EnterpriseAuthView.tsx", "r") as f:
    content = f.read()

content = content.replace(
    '          </div>\n      <div className="bg-surface rounded-[40px]',
    '          </div>\n        </div>\n      )}\n      <div className="bg-surface rounded-[40px]'
)

with open("src/components/EnterpriseAuthView.tsx", "w") as f:
    f.write(content)
