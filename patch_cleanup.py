import re

with open("src/components/EnterpriseAuthView.tsx", "r") as f:
    content = f.read()

# I will add a cleanup button below the "Identity & Authorization" header
header = r'<h2 className="text-xl font-bold flex items-center gap-3">\n            <Users className="w-6 h-6 text-primary" /> Identity & Authorization\n          </h2>'

cleanup_button = """<h2 className="text-xl font-bold flex items-center gap-3">
            <Users className="w-6 h-6 text-primary" /> Identity & Authorization
          </h2>
          <button 
            onClick={async () => {
              try {
                const bRef = collection(db, 'bot_link_codes');
                const bSnap = await getDocs(bRef);
                bSnap.forEach(d => deleteDoc(d.ref));
                
                const sRef = collection(db, 'bot_sessions');
                const sSnap = await getDocs(sRef);
                sSnap.forEach(d => deleteDoc(d.ref));
                
                // Note: dailyLogs and documents with uploadedBy="Telegram Bot"
                // are harder to query without an index if we use collectionGroup, 
                // but we can query project by project.
                alert("Bot codes and sessions cleaned up.");
              } catch(e) {
                alert("Error cleaning up bot data: " + e);
              }
            }}
            className="bg-rose-100 text-rose-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-rose-200 transition-colors"
          >
            Clean Telegram Data
          </button>"""

content = content.replace(header, cleanup_button)

with open("src/components/EnterpriseAuthView.tsx", "w") as f:
    f.write(content)

