import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/ProgressReportsView.tsx');
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('import { DailyLogEntryScreen }')) {
  content = content.replace(
    'import { DailyLogEntry, MaterialIssue, DailyLaborLog } from "../types";',
    'import { DailyLogEntry, MaterialIssue, DailyLaborLog } from "../types";\nimport { DailyLogEntryScreen } from "./DailyLogEntryScreen";\nimport { Edit2 } from "lucide-react";'
  );
}

if (!content.includes('const [logToEdit, setLogToEdit] = useState<DailyLogEntry | null>(null);')) {
  content = content.replace(
    'const [selectedDate, setSelectedDate] = useState(',
    'const [logToEdit, setLogToEdit] = useState<DailyLogEntry | null>(null);\n  const [selectedDate, setSelectedDate] = useState('
  );
}

// Now insert the Daily Logs History section
const footerRegex = /\{\/\* Footer \*\/\}/;
const newSection = `
            {/* Daily Logs History */}
            <div className="mt-12 break-before-page">
              <h3 className="text-sm font-black uppercase tracking-widest mb-6 bg-black text-white py-2 px-4 rounded">
                Daily Logs History
              </h3>
              <div className="space-y-4">
                {logs.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No daily logs found for this period.</p>
                ) : (
                  logs.map((log, index) => {
                    const task = tasks.find((t) => t.id === log.taskId);
                    return (
                      <div key={log.id || index} className="border border-gray-200 rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                          <h4 className="text-sm font-bold text-ink mb-1">{task?.name || 'Unknown Task'}</h4>
                          <p className="text-xs text-ink-muted">
                            <span className="font-mono">{log.workDate}</span> • {log.progressPercent}% progress
                            {log.markComplete ? ' (Completed)' : ''}
                          </p>
                          <div className="mt-2 text-xs text-gray-600">
                            {log.materials && log.materials.length > 0 && (
                              <span className="mr-3"><b>Mat:</b> {log.materials.length} items</span>
                            )}
                            {log.labour && log.labour.length > 0 && (
                              <span><b>Lab:</b> {log.labour.reduce((s, l) => s + (l.headcount || 0), 0)} people</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => setLogToEdit(log)}
                          className="print:hidden text-xs font-bold text-ink-muted hover:text-primary flex items-center gap-1.5 px-4 py-2 rounded-xl border border-divider hover:bg-[#F3E8D2] transition-colors whitespace-nowrap"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Edit Log
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Footer */}`;

content = content.replace(footerRegex, newSection);

const renderEndRegex = /<\/div>\s*<\/div>\s*<\/div>\s*\)\;\s*\};/;
const modalSection = `
        </div>
      )}

      {logToEdit && (
        <DailyLogEntryScreen
          projectId={projectId}
          taskId={logToEdit.taskId}
          editLog={logToEdit}
          onClose={() => setLogToEdit(null)}
        />
      )}
    </div>
  );
};`;

content = content.replace(/<\/div>\s*<\/div>\s*\)\;\s*\};/, modalSection);

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed ProgressReportsView.tsx");
