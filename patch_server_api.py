with open("server.ts", "r") as f:
    content = f.read()

api_code = """
  app.post("/api/telegram-unlink", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: "Missing userId" });
      
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();
      if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
      
      const chatId = userDoc.data().telegramChatId;
      if (chatId) {
        if (bot) {
          try {
             await bot.sendMessage(chatId, "Your Telegram account has been unlinked from BuildFlow.");
          } catch (e) {
             console.error("Failed to send unlink message:", e);
          }
        }
        await db.collection("bot_sessions").doc(chatId.toString()).delete().catch(()=> {});
      }
      
      await userRef.update({
        telegramChatId: null,
        telegramLinkedAt: null
      });
      
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
"""

if '/api/telegram-unlink' not in content:
    content = content.replace('app.get("/api/health"', api_code + '\\n  app.get("/api/health"')

with open("server.ts", "w") as f:
    f.write(content)
