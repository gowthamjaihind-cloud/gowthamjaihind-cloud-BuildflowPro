import re

with open("src/components/EnterpriseAuthView.tsx", "r") as f:
    text = f.read()

# Import deleteField
text = re.sub(
    r'import \{[\s\S]*?\} from "\.\.\/firebase";',
    r'\g<0>\nimport { deleteField } from "firebase/firestore";',
    text
)

# Add unlinkBot function below generateLinkCode
unlink_func = """
  const unlinkBot = async (uid: string) => {
    try {
      await updateDoc(doc(db, "users", uid), {
        telegramChatId: deleteField(),
        telegramLinkedAt: deleteField()
      });
    } catch (err: any) {
      console.error("Error unlinking:", err);
      alert("Failed to unlink bot");
    }
  };
"""

# Insert before `const generateLinkCode`
text = text.replace("const generateLinkCode =", unlink_func.strip() + "\n\n  const generateLinkCode =")

# Add the Unlink button in the UI
# Find this chunk:
#                       {u.telegramChatId ? (
#                         <span className="text-[#34C759] bg-[#34C759]/10 px-3 py-1.5 rounded-lg border border-[#34C759]/20 flex items-center gap-1.5 w-fit font-bold text-sm">
#                           <CheckCircle2 className="w-4 h-4" /> Linked
#                         </span>
#                       ) : (

target_ui = """                      {u.telegramChatId ? (
                        <span className="text-[#34C759] bg-[#34C759]/10 px-3 py-1.5 rounded-lg border border-[#34C759]/20 flex items-center gap-1.5 w-fit font-bold text-sm">
                          <CheckCircle2 className="w-4 h-4" /> Linked
                        </span>
                      ) : ("""

replacement_ui = """                      {u.telegramChatId ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[#34C759] bg-[#34C759]/10 px-3 py-1.5 rounded-lg border border-[#34C759]/20 flex items-center gap-1.5 w-fit font-bold text-sm">
                            <CheckCircle2 className="w-4 h-4" /> Linked
                          </span>
                          <button
                            onClick={() => unlinkBot(u.uid)}
                            disabled={currentUser.role !== "Admin" && currentUser.role !== "Owner"}
                            className="text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                            title="Unlink Bot"
                          >
                            Unlink
                          </button>
                        </div>
                      ) : ("""

text = text.replace(target_ui, replacement_ui)

with open("src/components/EnterpriseAuthView.tsx", "w") as f:
    f.write(text)

print("done")
