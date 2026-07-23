import re

with open("src/server/telegram/handlers/log.ts", "r") as f:
    text = f.read()

# Replace pickTask
old_pickTask = """export async function pickTask(tg: any, chatId: number, messageId: any, session: any, taskId: string) {
    const base = projPath(session.orgId, session.activeProjectId);
    const snap = await getDoc(doc(db, `${base}/tasks/${taskId}`));
    if (!snap.exists()) {
        await tg.editMessage(chatId, messageId, "That task no longer exists.");
        return;
    }
    const t = snap.data();
    const current = t.progress || 0;
    const logId = doc(collection(db, `${base}/dailyLogs`)).id;
    await setSession(chatId, {
        step: "log:progress",
        draft: {
            ...session.draft,
            logId,
            taskId,
            taskName: t.name,
            currentProgress: current,
            materials: (session.draft && session.draft.taskId === taskId) ? session.draft.materials : [],
            labour: (session.draft && session.draft.taskId === taskId) ? session.draft.labour : [],
            photoUrls: (session.draft && session.draft.taskId === taskId) ? session.draft.photoUrls : [],
        },
    });
    
    const opts = [0, 25, 50, 75, 100];
    const rows = [];
    rows.push(opts.map((v) => ({
        text: v === 100 ? "100 ✓" : String(v),
        callback_data: `p:${v}`,
    })));
    rows.push([{ text: "✖ Cancel", callback_data: "xx" }]);
    
    const d = session.draft || {};
    const dt = d.workDate || todayISO();
    await tg.editMessage(chatId, messageId, `<b>${t.name}</b>\\nDate: ${fmtDate(dt)} · now at <b>${current}%</b>\\n\\n<b>Progress?</b>\\n<i>Tap a number, or type one.</i>`, rows);
}"""

new_pickTask = """export async function pickTask(tg: any, chatId: number, messageId: any, session: any, taskId: string) {
    const base = projPath(session.orgId, session.activeProjectId);
    const snap = await getDoc(doc(db, `${base}/tasks/${taskId}`));
    if (!snap.exists()) {
        await tg.editMessage(chatId, messageId, "That task no longer exists.");
        return;
    }
    const t = snap.data();
    
    const d = session.draft || {};
    const dt = d.workDate || todayISO();
    
    // Check if there is already a log for this task and date
    const logQuery = await getDocs(query(collection(db, `${base}/dailyLogs`), 
        where("taskId", "==", taskId), 
        where("workDate", "==", dt),
        limit(1)
    ));
    
    let logId;
    let existingMaterials = [];
    let existingLabour = [];
    let existingPhotoUrls = [];
    let existingNote = "";
    
    if (!logQuery.empty) {
        const existing = logQuery.docs[0];
        logId = existing.id;
        const eData = existing.data();
        existingMaterials = eData.materials || [];
        existingLabour = eData.labour || [];
        existingPhotoUrls = eData.photoUrls || [];
        existingNote = eData.note || "";
    } else {
        logId = doc(collection(db, `${base}/dailyLogs`)).id;
    }
    
    const current = t.progress || 0;
    
    await setSession(chatId, {
        step: "log:progress",
        draft: {
            ...d,
            workDate: dt,
            logId,
            taskId,
            taskName: t.name,
            currentProgress: current,
            materials: (d.taskId === taskId) ? d.materials : existingMaterials,
            labour: (d.taskId === taskId) ? d.labour : existingLabour,
            photoUrls: (d.taskId === taskId) ? d.photoUrls : existingPhotoUrls,
            note: (d.taskId === taskId) ? d.note : existingNote,
        },
    });
    
    const opts = [0, 25, 50, 75, 100];
    const rows = [];
    rows.push(opts.map((v) => ({
        text: v === 100 ? "100 ✓" : String(v),
        callback_data: `p:${v}`,
    })));
    rows.push([{ text: "◀ Back", callback_data: "dt:pick" }]);
    
    await tg.editMessage(chatId, messageId, `<b>${t.name}</b>\\nDate: ${fmtDate(dt)} · now at <b>${current}%</b>\\n\\n<b>Progress?</b>\\n<i>Tap a number, or type one.</i>`, rows);
}"""

if "logQuery" not in text:
    text = text.replace(old_pickTask, new_pickTask)

with open("src/server/telegram/handlers/log.ts", "w") as f:
    f.write(text)
