sed -i 's/<div className="print:hidden flex items-center gap-2">/{canEditOrDeleteLog(user, log) \&\& (\n                        <div className="print:hidden flex items-center gap-2">/' src/components/ProgressReportsView.tsx
sed -i 's/<\/button>\n                        <\/div>/<\/button>\n                        <\/div>\n                        )}/' src/components/ProgressReportsView.tsx
