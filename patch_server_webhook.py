with open("server.ts", "r") as f:
    content = f.read()

target = 'if (webhookUrl && !webhookUrl.includes("your-app-domain.com") && !webhookUrl.includes("example.com")) {'
replacement = 'const isProd = process.env.NODE_ENV === "production";\n      if (isProd && webhookUrl && !webhookUrl.includes("your-app-domain.com") && !webhookUrl.includes("example.com")) {'

content = content.replace(target, replacement)

with open("server.ts", "w") as f:
    f.write(content)
