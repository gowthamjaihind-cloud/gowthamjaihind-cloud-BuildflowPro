sed -i 's/alert("Failed to delete log");/alert(`Failed to delete log: ${err.message || err}`);/' src/components/ProgressReportsView.tsx
