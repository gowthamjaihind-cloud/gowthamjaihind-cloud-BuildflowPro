const fs = require('fs');
let code = fs.readFileSync('src/components/ProgressReportsView.tsx', 'utf8');
const modalCode = `      {logToDelete && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-panel w-full max-w-sm rounded-3xl p-6 shadow-2xl relative">
            <h3 className="text-xl font-bold text-ink mb-2 text-center">
              Delete Log Entry?
            </h3>
            <p className="text-sm font-medium text-ink-muted text-center mb-8">
              This will update the task's progress, dates, and material/labour
              rollups. This action cannot be undone.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setLogToDelete(null)}
                className="py-3.5 px-6 rounded-2xl font-bold bg-panel hover:bg-divider text-ink transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteLog}
                className="py-3.5 px-6 rounded-2xl font-bold bg-red-500 hover:bg-red-600 text-white transition shadow-[0_4px_20px_rgba(239,68,68,0.3)] cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};`;
code = code.replace(/    <\/div>\n  \);\n\};\n?/g, modalCode);
fs.writeFileSync('src/components/ProgressReportsView.tsx', code);
