import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/LaborTrackingView.tsx');
let content = fs.readFileSync(file, 'utf8');

const queryMatch = `  const { data: dailyLogs } = useProjectDataQuery<DailyLogEntry>(projectId, "dailyLogs");`;
const queryReplace = `  const { data: dailyLogs } = useProjectDataQuery<DailyLogEntry>(projectId, "dailyLogs");
  const { data: legacyLaborLogs } = useProjectDataQuery<DailyLaborLog>(
    projectId,
    "labor_logs",
    "date",
    "desc"
  );`;

content = content.replace(queryMatch, queryReplace);

const memoMatch = `  const laborLogs = useMemo(() => {
    if (!dailyLogs || !rateCards || !tasks || !vendors) return [];
    const logs: DailyLaborLog[] = [];`;

const memoReplace = `  const laborLogs = useMemo(() => {
    if (!dailyLogs || !rateCards || !tasks || !vendors) return [];
    const logs: DailyLaborLog[] = legacyLaborLogs ? [...legacyLaborLogs] : [];`;

content = content.replace(memoMatch, memoReplace);

fs.writeFileSync(file, content, 'utf8');
console.log("Patched LaborTrackingView legacy logs");
