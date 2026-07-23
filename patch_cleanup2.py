import re

with open("src/components/EnterpriseAuthView.tsx", "r") as f:
    content = f.read()

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

new_cleanup_button = """<h2 className="text-xl font-bold flex items-center gap-3">
            <Users className="w-6 h-6 text-primary" /> Identity & Authorization
          </h2>
          <button 
            onClick={async () => {
              try {
                // Delete bot link codes & sessions
                const bRef = collection(db, 'bot_link_codes');
                const bSnap = await getDocs(bRef);
                bSnap.forEach(d => deleteDoc(d.ref));
                
                const sRef = collection(db, 'bot_sessions');
                const sSnap = await getDocs(sRef);
                sSnap.forEach(d => deleteDoc(d.ref));

                // Query all projects
                const pRef = collection(db, 'projects');
                const pSnap = await getDocs(pRef);
                
                for (const proj of pSnap.docs) {
                    const logsRef = collection(db, `projects/${proj.id}/dailyLogs`);
                    const logsSnap = await getDocs(logsRef);
                    
                    for (const log of logsSnap.docs) {
                        const data = log.data();
                        
                        // Wait, the bot logs we saw in the screenshot have "materials", "labour" in the UI.
                        // Wait, the bot in server.ts created a dailyLog with createdBy = 'Telegram Bot' or uploadedBy = 'Telegram Bot'?
                        // Let's check server.ts to see what it saved.
                        // In server.ts:
                        // uploadedBy: 'Telegram Bot',
                        // createdByUid: 'telegram_bot'
                        
                        if (data.uploadedBy === 'Telegram Bot' || data.createdByUid === 'telegram_bot' || (data.notes && data.notes.includes('Telegram Bot'))) {
                            
                            // Rollback task costs
                            if (data.items && data.items.length > 0) {
                                for (const item of data.items) {
                                    if (item.taskId) {
                                        const taskRef = doc(db, `projects/${proj.id}/tasks`, item.taskId);
                                        const taskSnap = await getDoc(taskRef);
                                        if (taskSnap.exists()) {
                                            const taskData = taskSnap.data();
                                            const matCost = (item.materials || []).reduce((acc, m) => acc + (m.totalPrice || 0), 0);
                                            const labCost = item.laborCost || 0;
                                            
                                            await updateDoc(taskRef, {
                                                actualMaterialCost: Math.max(0, (taskData.actualMaterialCost || 0) - matCost),
                                                actualLaborCost: Math.max(0, (taskData.actualLaborCost || 0) - labCost),
                                                actualCost: Math.max(0, (taskData.actualCost || 0) - (matCost + labCost))
                                            });
                                        }
                                    }
                                }
                            }
                            
                            await deleteDoc(log.ref);
                        }
                    }
                    
                    // Also delete labor logs if any
                    const llRef = collection(db, `projects/${proj.id}/labor_logs`);
                    const llSnap = await getDocs(llRef);
                    for (const ll of llSnap.docs) {
                        // The bot in server.ts didn't set uploadedBy in labor_logs but did in others. Let's skip labor logs for now unless they have specific markers.
                    }
                    
                    // documents
                    const docsRef = collection(db, `projects/${proj.id}/documents`);
                    const docsSnap = await getDocs(docsRef);
                    for (const doc of docsSnap.docs) {
                        if (doc.data().uploadedBy === 'Telegram Bot') {
                            await deleteDoc(doc.ref);
                        }
                    }
                }
                
                alert("Bot codes, sessions, logs, and docs cleaned up successfully!");
              } catch(e) {
                alert("Error cleaning up bot data: " + e);
                console.error(e);
              }
            }}
            className="bg-rose-100 text-rose-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-rose-200 transition-colors"
          >
            Clean Telegram Data
          </button>"""

content = content.replace(cleanup_button, new_cleanup_button)

# make sure getDoc, doc, updateDoc are imported
if "getDoc," not in content and "getDoc " not in content:
    content = content.replace("getDocs,", "getDocs, getDoc, doc, updateDoc,")

with open("src/components/EnterpriseAuthView.tsx", "w") as f:
    f.write(content)
