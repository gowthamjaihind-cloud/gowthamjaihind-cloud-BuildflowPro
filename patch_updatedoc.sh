sed -i 's/await updateDoc(logRef, updates);/await setDoc(logRef, updates, { merge: true });/' src/hooks/useDailyLogs.ts
sed -i 's/await updateDoc(logRef, {/await setDoc(logRef, {/' src/components/DailyLogEntryScreen.tsx
sed -i '/photoUrls:/!b;n;s/          });/          }, { merge: true });/' src/components/DailyLogEntryScreen.tsx
