import re
with open("src/components/EnterpriseAuthView.tsx", "r") as f:
    content = f.read()

# Replace handleUnlink in EnterpriseAuthView
new_handle_unlink = """  const handleUnlink = async () => {
    try {
      const response = await fetch('/api/telegram-unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.uid })
      });
      if (!response.ok) throw new Error('Failed to unlink');
      
      // Still update local firestore for UI consistency just in case, though API does it
      await updateDoc(doc(db, "users", user!.uid), {
        telegramChatId: null,
        telegramLinkedAt: null
      });
      toast.success("Telegram account unlinked");
    } catch (e) {
      console.error(e);
      toast.error("Failed to unlink account");
    }
  };"""

content = re.sub(
    r'const handleUnlink = async \(\) => \{[\s\S]*?toast\.success\("Telegram account unlinked"\);\s*\}\s*catch[^\}]*\}\s*\};',
    new_handle_unlink,
    content
)

with open("src/components/EnterpriseAuthView.tsx", "w") as f:
    f.write(content)

