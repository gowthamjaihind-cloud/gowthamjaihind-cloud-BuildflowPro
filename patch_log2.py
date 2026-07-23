import os
import re

filepath = "functions/src/telegram/handlers/log.ts"
with open(filepath, "r") as f:
    text = f.read()

# Add export for showTaskPicker if not there
if "export { showTaskPicker };" not in text:
    text = text.replace("export { saveLog };", "export { saveLog };\nexport { showTaskPicker };")

# Regex to match the old startLog
startLog_pattern = re.compile(r'export async function startLog\(tg: any, chatId: number, session\) \{.*?\n\}', re.DOTALL)

new_code = """export async function showTaskPicker(tg: any, chatId: number, messageId: any, session: any) {
    const base = projPath(session.orgId, session.activeProjectId);
    const recent = session.recentTaskIds || [];
    const buttons = [];
    for (const tid of recent.slice(0, 3)) {
        const snap = await db.doc(`${base}/tasks/${tid}`).get();
        if (!snap.exists) continue;
        buttons.push([{ text: snap.data().name, callback_data: `t:${tid}` }]);
    }
    buttons.push([{ text: "🔍 Browse all tasks", callback_data: "br:0" }]);
    buttons.push([{ text: "✖ Cancel", callback_data: "xx" }]);
    await setSession(chatId, { step: "log:task", draft: {} });
    
    const text = recent.length ? "<b>What did you work on today?</b>" : "<b>Pick a task</b>";
    if (messageId) {
        await tg.editMessage(chatId, messageId, text, buttons);
    } else {
        await tg.sendMessage(chatId, text, buttons);
    }
}

export async function startLog(tg: any, chatId: number, session: any) {
    if (!session.activeProjectId) {
        await tg.sendMessage(chatId, "No active project. Send /projects to pick one.");
        return;
    }
    const base = projPath(session.orgId, session.activeProjectId);

    try {
        const lastLogSnap = await db.collection(`${base}/dailyLogs`)
            .orderBy("workDate", "desc")
            .limit(1)
            .get();
        
        if (!lastLogSnap.empty) {
            const lastLog = lastLogSnap.docs[0].data();
            const taskId = lastLog.taskId;
            
            const taskSnap = await db.doc(`${base}/tasks/${taskId}`).get();
            if (taskSnap.exists) {
                const taskName = taskSnap.data().name;
                const formattedDate = fmtDate(todayISO());
                const msgText = `<b>Log progress</b>\\n<i>Today, ${formattedDate}</i>\\n\\nContinue with your last task?`;
                const buttons = [
                    [{ text: `✅ Continue — ${taskName}`, callback_data: `ct:${taskId}` }],
                    [{ text: "🔁 Different task", callback_data: "dt" }],
                    [{ text: "✖ Cancel", callback_data: "xx" }]
                ];
                await setSession(chatId, { step: "log:task", draft: {} });
                await tg.sendMessage(chatId, msgText, buttons);
                return;
            }
        }
    } catch (e) {
        // Fall back to normal picker if index is missing or other errors occur
    }

    await showTaskPicker(tg, chatId, null, session);
}"""

if startLog_pattern.search(text):
    text = startLog_pattern.sub(new_code, text)
    print("Replaced startLog")
else:
    print("Could not find startLog")

with open(filepath, "w") as f:
    f.write(text)
