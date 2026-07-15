sed -i 's/const \[logToEdit, setLogToEdit\] = useState<DailyLogEntry | null>(null);/const \[logToEdit, setLogToEdit\] = useState<DailyLogEntry | null>(null);\n  const \[logToDelete, setLogToDelete\] = useState<DailyLogEntry | null>(null);/' src/components/ProgressReportsView.tsx

sed -i 's/const handleDeleteLog = async (log: DailyLogEntry) => {/const handleDeleteLog = (log: DailyLogEntry) => {\n    setLogToDelete(log);\n  };\n\n  const confirmDeleteLog = async () => {\n    if (!logToDelete) return;/' src/components/ProgressReportsView.tsx

sed -i 's/if (window.confirm("Are you sure you want to delete this log?")) {/    try {/' src/components/ProgressReportsView.tsx

sed -i 's/await deleteLogMutation.mutateAsync({ id: log.id, oldLog: log });/await deleteLogMutation.mutateAsync({ id: logToDelete.id, oldLog: logToDelete });\n        setLogToDelete(null);/' src/components/ProgressReportsView.tsx

