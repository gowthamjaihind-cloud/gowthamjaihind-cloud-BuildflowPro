const fs = require('fs');

const path = 'src/components/TelegramIntegration.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  `  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [displayCode, setDisplayCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);`,
  `  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);`
);

content = content.replace(
  `  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);`,
  `  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [displayCode, setDisplayCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);`
);

const oldGenCode = `      // Generate random 8-character alphanumeric code XXXX-XXXX
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let randomString = "";
      for (let i = 0; i < 8; i++) {
        randomString += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const code = \`\${randomString.slice(0,4)}-\${randomString.slice(4,8)}\`;
      
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
      setExpiresAt(expiry);`;

const newGenCode = `      // Generate random 8-character alphanumeric code XXXX-XXXX
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let randomString = "";
      for (let i = 0; i < 8; i++) {
        randomString += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const rawCode = randomString;
      const dCode = \`\${rawCode.slice(0,4)}-\${rawCode.slice(4,8)}\`;
      
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
      setExpiresAt(expiry);`;

const codeStartIdx = content.indexOf('// Generate random 8-character');
const codeEndIdx = content.indexOf('setActiveCode(code);') + 'setActiveCode(code);'.length;
const nextLineIdx = content.indexOf('\n', codeEndIdx);
const codeEndIdx2 = content.indexOf('setExpiresAt(expiry);', codeEndIdx) + 'setExpiresAt(expiry);'.length;

const blockToReplace = content.substring(codeStartIdx, codeEndIdx2);

if (codeStartIdx !== -1 && blockToReplace.includes('bot_link_codes')) {
    content = content.replace(blockToReplace, newGenCode);
} else {
    console.log("Could not find block to replace:", blockToReplace);
}

fs.writeFileSync(path, content);
console.log('done fixing generation');
