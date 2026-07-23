import re

with open("src/components/EnterpriseAuthView.tsx", "r") as f:
    text = f.read()

target1 = """  const [showLinkCode, setShowLinkCode] = useState<{code: string, email: string} | null>(null);

  const generateLinkCode = async (uid: string, email: string) => {
    try {
      const q = query(
        collection(db, "bot_link_codes"),
        where("userId", "==", uid),
        where("used", "==", false)
      );
      const snap = await getDocs(q);
      const now = Date.now();
      
      let foundCode = null;

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.expiresAt > now) {
          foundCode = data.code;
        }
      });

      if (foundCode) {
        setShowLinkCode({code: foundCode, email});
        return;
      }
      
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let randomString = "";
      for (let i = 0; i < 8; i++) {
        randomString += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const code = `${randomString.slice(0,4)}-${randomString.slice(4,8)}`;
      
      await setDoc(doc(db, "bot_link_codes", code), {
        userId: uid,
        email,
        createdAt: now,
        expiresAt: now + 15 * 60 * 1000,
        used: false
      });
      
      setShowLinkCode({code, email});
    } catch (e) {"""

replacement1 = """  const [showLinkCode, setShowLinkCode] = useState<{code: string, displayCode: string, email: string} | null>(null);

  const generateLinkCode = async (uid: string, email: string) => {
    try {
      const q = query(
        collection(db, "bot_link_codes"),
        where("userId", "==", uid),
        where("used", "==", false)
      );
      const snap = await getDocs(q);
      const now = Date.now();
      
      let foundCode = null;

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.expiresAt > now) {
          foundCode = docSnap.id;
        }
      });

      if (foundCode) {
        const rawCode = foundCode.replace("-", "");
        const displayCode = `${rawCode.slice(0,4)}-${rawCode.slice(4,8)}`;
        setShowLinkCode({code: rawCode, displayCode, email});
        return;
      }
      
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let randomString = "";
      for (let i = 0; i < 8; i++) {
        randomString += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const rawCode = randomString;
      const displayCode = `${rawCode.slice(0,4)}-${rawCode.slice(4,8)}`;
      
      await setDoc(doc(db, "bot_link_codes", rawCode), {
        userId: uid,
        email,
        createdAt: now,
        expiresAt: now + 15 * 60 * 1000,
        used: false
      });
      
      setShowLinkCode({code: rawCode, displayCode, email});
    } catch (e) {"""

target2 = """            <div className="bg-panel rounded-2xl p-6 mb-6 text-center border border-divider">
              <p className="text-sm font-bold text-ink-muted mb-3 uppercase tracking-wider">Ask them to send:</p>
              <code className="text-3xl font-black text-primary bg-primary/10 px-4 py-2 rounded-xl">
                /link {showLinkCode.code}
              </code>
            </div>"""

replacement2 = """            <div className="bg-panel rounded-2xl p-6 mb-6 text-center border border-divider">
              <p className="text-sm font-bold text-ink-muted mb-3 uppercase tracking-wider">Ask them to send:</p>
              <code className="text-3xl font-black text-primary bg-primary/10 px-4 py-2 rounded-xl">
                /link {showLinkCode.displayCode}
              </code>
            </div>"""

text = text.replace(target1, replacement1)
text = text.replace(target2, replacement2)

with open("src/components/EnterpriseAuthView.tsx", "w") as f:
    f.write(text)

print("done")
