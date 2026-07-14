const fs = require('fs');
let code = fs.readFileSync('src/components/EnterpriseAuthView.tsx', 'utf8');

// Add setDoc to imports
code = code.replace('updateDoc,\n  query,', 'setDoc,\n  updateDoc,\n  query,');

// Remove botSessions state
code = code.replace(/const \[botSessions, setBotSessions\] = useState<[^>]+>\(\[\]\);\n/, '');

// Remove editingBotPin state
code = code.replace(/const \[editingBotPin, setEditingBotPin\] = useState<string>\(""\);\n/, '');

// Remove unsubBotSessions
code = code.replace(/const unsubBotSessions = onSnapshot\([\s\S]*?handleFirestoreError\(error, OperationType\.LIST, "bot_sessions"\);\n      },\n    \);\n/, '');
code = code.replace(/unsubBotSessions\(\);\n/, '');

// Remove botPin from handleUpdateRole
code = code.replace(/botPin: editingBotPin \|\| "",\n/g, '');

// Replace handleDisconnectBot and handleRevokeUnregistered with handleGenerateLinkCode and handleUnlinkTelegram
const newHandlers = `  const handleGenerateLinkCode = async (u: UserProfile) => {
    if (currentUser.role !== "Admin") return;
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    try {
      await setDoc(doc(db, "bot_link_codes", code), {
        email: u.email,
        userId: u.uid,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        used: false
      });
      window.alert(\`Generated one-time link code for \${u.displayName || u.email}:\\n\\n\${code}\\n\\nThey must send: /link \${code}\`);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, "bot_link_codes");
    }
  };

  const handleUnlinkTelegram = async (u: UserProfile) => {
    if (currentUser.role !== "Admin") return;
    try {
      await updateDoc(doc(db, "users", u.uid), {
        telegramChatId: null,
        telegramLinkedAt: null,
      });
      setUsers(users.map(user => user.uid === u.uid ? { ...user, telegramChatId: undefined, telegramLinkedAt: undefined } : user));
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, "users");
    }
  };`;

code = code.replace(/  const handleDisconnectBot = async [\s\S]*?handleFirestoreError\(err, OperationType\.DELETE, "bot_sessions"\);\n    }\n  };\n/, newHandlers + '\n');

// Update columns
code = code.replace(/<th className="px-8 py-6">Telegram Bot PIN<\/th>/, '<th className="px-8 py-6">Telegram Link</th>');

// Update editingBotPin in table
code = code.replace(/<td className="px-8 py-6">\s*\{editingUserId === u\.uid \? \([\s\S]*?\) : u\.botPin \? \([\s\S]*?\) : \([\s\S]*?\}\s*<\/td>/, `<td className="px-8 py-6">
                    {u.telegramChatId ? (
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-sm tracking-widest text-[#34C759] bg-[#34C759]/10 px-3 py-1.5 rounded-lg border border-[#34C759]/20 w-fit">
                          Linked
                        </span>
                        {currentUser.role === "Admin" && (
                          <button onClick={() => handleUnlinkTelegram(u)} className="text-xs text-rose-500 hover:underline w-fit">Unlink</button>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <span className="text-ink-muted italic text-sm">
                          Not linked
                        </span>
                        {currentUser.role === "Admin" && (
                          <button onClick={() => handleGenerateLinkCode(u)} className="text-xs text-primary font-bold hover:underline w-fit">Generate Code</button>
                        )}
                      </div>
                    )}
                  </td>`);

// Update edit click
code = code.replace(/setEditingBotPin\(u\.botPin \|\| ""\);\n/, '');

// Remove the whole second table
code = code.replace(/<div className="mt-8 bg-surface rounded-\[40px\][\s\S]*?<\/div>\n      <\/div>/, '');

fs.writeFileSync('src/components/EnterpriseAuthView.tsx', code);
