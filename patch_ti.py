import re

with open("src/components/TelegramIntegration.tsx", "r") as f:
    text = f.read()

# Fix import
text = re.sub(
    r'import { db, collection, query, where, getDocs, setDoc, doc } from "../firebase";',
    'import { db, collection, query, where, getDocs, setDoc, doc } from "../firebase";\nimport { updateDoc, deleteField } from "firebase/firestore";',
    text
)

# Add unlinkBot function
unlink_target = """  const copyToClipboard = () => {
    if (displayCode) {
      navigator.clipboard.writeText(`/link ${displayCode}`);
    }
  };"""

unlink_replacement = """  const copyToClipboard = () => {
    if (displayCode) {
      navigator.clipboard.writeText(`/link ${displayCode}`);
    }
  };

  const unlinkBot = async () => {
    try {
      setLoading(true);
      setError(null);
      await updateDoc(doc(db, "users", currentUser.uid), {
        telegramChatId: deleteField(),
        telegramLinkedAt: deleteField()
      });
      // Option: could also remove the bot session, but leaving it is probably fine or we can delete it too
    } catch (err: any) {
      console.error("Error unlinking:", err);
      setError("Failed to unlink bot");
    } finally {
      setLoading(false);
    }
  };"""

text = text.replace(unlink_target, unlink_replacement)

# Fix rendering
render_target = """        {!activeCode && (
          <button
            onClick={generateCode}
            disabled={loading}
            className="px-4 py-2 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isLinked ? "Generate New Link Code" : "Link Telegram Bot"}
          </button>
        )}"""

render_replacement = """        {!activeCode && (
          <div className="flex items-center gap-3">
            {isLinked && (
              <button
                onClick={unlinkBot}
                disabled={loading}
                className="px-4 py-2 bg-red-50 text-red-600 font-semibold rounded-xl hover:bg-red-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Unlink Bot"}
              </button>
            )}
            <button
              onClick={generateCode}
              disabled={loading}
              className="px-4 py-2 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isLinked ? "Generate New Link Code" : "Link Telegram Bot"}
            </button>
          </div>
        )}"""

text = text.replace(render_target, render_replacement)

with open("src/components/TelegramIntegration.tsx", "w") as f:
    f.write(text)

print("done")
