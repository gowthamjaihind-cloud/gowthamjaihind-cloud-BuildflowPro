import re

with open("src/components/TelegramIntegration.tsx", "r") as f:
    text = f.read()

target1 = """  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);"""

replacement1 = """  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [displayCode, setDisplayCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);"""

target2 = """      let foundCode = null;
      let foundExpiry = null;
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.expiresAt > now) {
          foundCode = data.code;
          foundExpiry = data.expiresAt;
        }
      });
      setActiveCode(foundCode);
      setExpiresAt(foundExpiry);"""

replacement2 = """      let foundCode = null;
      let foundExpiry = null;
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.expiresAt > now) {
          foundCode = docSnap.id;
          foundExpiry = data.expiresAt;
        }
      });
      if (foundCode) {
        const rawCode = foundCode.replace("-", "");
        const dCode = `${rawCode.slice(0,4)}-${rawCode.slice(4,8)}`;
        setActiveCode(rawCode);
        setDisplayCode(dCode);
        setExpiresAt(foundExpiry);
      }"""

target3 = """      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let randomString = "";
      for (let i = 0; i < 8; i++) {
        randomString += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const code = `${randomString.slice(0,4)}-${randomString.slice(4,8)}`;
      
      const now = Date.now();
      const expiry = now + 15 * 60 * 1000; // 15 mins
      const data = {
        code,
        userId: currentUser.uid,
        email: currentUser.email,
        createdAt: now,
        expiresAt: expiry,
        used: false,
      };
      if (currentUser.currentOrgId) {
        (data as any).orgId = currentUser.currentOrgId;
      }
      await setDoc(doc(db, "bot_link_codes", code), data);
      
      setActiveCode(code);
      setExpiresAt(expiry);"""

replacement3 = """      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
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
      setExpiresAt(expiry);"""

target4 = """    if (activeCode) {
      navigator.clipboard.writeText(`/link ${activeCode}`);
    }"""

replacement4 = """    if (displayCode) {
      navigator.clipboard.writeText(`/link ${displayCode}`);
    }"""

target5 = """            <code className="flex-1 font-mono text-lg font-bold text-slate-800 text-center">
              /link {activeCode}
            </code>"""

replacement5 = """            <code className="flex-1 font-mono text-lg font-bold text-slate-800 text-center">
              /link {displayCode}
            </code>"""

text = text.replace(target1, replacement1)
text = text.replace(target2, replacement2)
text = text.replace(target3, replacement3)
text = text.replace(target4, replacement4)
text = text.replace(target5, replacement5)

with open("src/components/TelegramIntegration.tsx", "w") as f:
    f.write(text)

print("done")
