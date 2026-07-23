with open("server.ts", "r") as f:
    text = f.read()

if "startPolling();" not in text:
    import_statement = "import { startPolling } from './src/server/telegram';\n"
    text = import_statement + text
    
    poll_statement = """
  // Start Telegram bot polling
  startPolling();
"""
    text = text.replace('app.listen(PORT, "0.0.0.0", () => {', poll_statement + '\n  app.listen(PORT, "0.0.0.0", () => {')

    with open("server.ts", "w") as f:
        f.write(text)
