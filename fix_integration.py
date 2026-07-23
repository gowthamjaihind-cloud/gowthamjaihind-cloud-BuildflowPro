import re

with open("src/components/TelegramIntegration.tsx", "r") as f:
    text = f.read()

# Fix the generateCode part
text = re.sub(
r'''      // Generate random 8-character alphanumeric code XXXX-XXXX[\s\S]*?setExpiresAt\(expiry\);''',
r'''      // Generate random 8-character alphanumeric code XXXX-XXXX
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let randomString = "";
      for (let i = 0; i < 8; i++) {
        randomString += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const rawCode = randomString;
      const dCode = `${rawCode.slice(0,4)}-${rawCode.slice(4,8)}`;
      
      const now = Date.now();
      const expiry = now + 15 * 60 * 1000; // 15 mins

      const data = {
        userId: currentUser.uid,
        email: currentUser.email,
        createdAt: now,
        expiresAt: expiry,
        used: false,
      };

      if (currentUser.currentOrgId) {
        (data as any).orgId = currentUser.currentOrgId;
      }

      await setDoc(doc(db, "bot_link_codes", rawCode), data);
      
      setActiveCode(rawCode);
      setDisplayCode(dCode);
      setExpiresAt(expiry);''', text)

with open("src/components/TelegramIntegration.tsx", "w") as f:
    f.write(text)

print("done")
