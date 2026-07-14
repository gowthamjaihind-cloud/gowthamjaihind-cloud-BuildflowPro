import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/schedule/ProjectDailyLogsTab.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'taskId={null} // Null triggers the task selector inside the modal',
  'taskId={null}\n          initialDate={selectedDate}'
);

fs.writeFileSync(file, content, 'utf8');

const file2 = path.join(process.cwd(), 'src/components/DailyLogEntryScreen.tsx');
let content2 = fs.readFileSync(file2, 'utf8');

if (!content2.includes('initialDate?: string')) {
  content2 = content2.replace(
    'editLog?: DailyLogEntry;',
    'editLog?: DailyLogEntry;\n  initialDate?: string;'
  );
  
  content2 = content2.replace(
    'taskId,\n  editLog,\n  onClose,',
    'taskId,\n  editLog,\n  initialDate,\n  onClose,'
  );

  content2 = content2.replace(
    'editLog?.workDate ||',
    'editLog?.workDate || initialDate ||'
  );

  fs.writeFileSync(file2, content2, 'utf8');
}
console.log("Fixed dates");
