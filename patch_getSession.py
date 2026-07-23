with open("server.ts", "r") as f:
    content = f.read()

target = """    const getSession = async (chatId: number) => {
      try {
        if (sessionCache.has(chatId)) {
          return sessionCache.get(chatId);
        }
        const doc = await db.collection("bot_sessions").doc(chatId.toString()).get();
        if (doc.exists) {
          const data = doc.data();
          sessionCache.set(chatId, data);
          return data;
        }
        return null;
      } catch (e) {
        console.error("Session fetch error:", e);
        return null;
      }
    };"""

replacement = """    const getSession = async (chatId: number) => {
      try {
        let data: any = null;
        if (sessionCache.has(chatId)) {
          data = sessionCache.get(chatId);
        } else {
          const doc = await db.collection("bot_sessions").doc(chatId.toString()).get();
          if (doc.exists) {
            data = doc.data();
            sessionCache.set(chatId, data);
          }
        }
        
        if (data && data.userId) {
          const userDoc = await db.collection("users").doc(data.userId).get();
          if (!userDoc.exists || userDoc.data()?.telegramChatId !== chatId) {
            await db.collection("bot_sessions").doc(chatId.toString()).delete().catch(()=> {});
            sessionCache.delete(chatId);
            return null;
          }
        } else if (data && data.email) {
            const usersSnap = await db.collection("users").where("email", "==", data.email).get();
            const userDoc = usersSnap.docs[0];
            if (!userDoc || userDoc.data()?.telegramChatId !== chatId) {
                await db.collection("bot_sessions").doc(chatId.toString()).delete().catch(()=> {});
                sessionCache.delete(chatId);
                return null;
            } else {
                data.userId = userDoc.id;
                await db.collection("bot_sessions").doc(chatId.toString()).update({ userId: userDoc.id }).catch(()=> {});
                sessionCache.set(chatId, data);
            }
        }

        return data;
      } catch (e) {
        console.error("Session fetch error:", e);
        return null;
      }
    };"""

content = content.replace(target, replacement)
with open("server.ts", "w") as f:
    f.write(content)

