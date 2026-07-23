import os
import re

filepath = "src/server/telegram/index.ts"
with open(filepath, "r") as f:
    text = f.read()

# In Express, /log is at:
#  if (text === "/log") {
#    if (!session.activeProjectId) {
#      await tg.sendMessage(chatId, "No active project set. Send /projects first.");
#      return;
#    }
#    
#    const projBasePath = await getProjectBasePath(session.activeProjectId, session.orgId);
#    const tasksSnap = await getDocs(query(collection(db, `${projBasePath}/tasks`)));
#    const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((t:any) => t.status !== "Completed");
#    
#    if (tasks.length === 0) {
#      await tg.sendMessage(chatId, "No active tasks to log.");
#      return;
#    }
#    
#    const buttons = tasks.slice(0, 50).map(t => [{ text: (t as any).name, callback_data: `task_${t.id}` }]);
#    await tg.sendMessage(chatId, "Select task to log:", buttons);
#    return;
#  }

# We replace this with a startLog-like implementation.

new_log_handler = """  if (text === "/log") {
    if (!session.activeProjectId) {
      await tg.sendMessage(chatId, "No active project set. Send /projects first.");
      return;
    }
    
    const projBasePath = await getProjectBasePath(session.activeProjectId, session.orgId);

    try {
        const lastLogSnap = await getDocs(query(collection(db, `${projBasePath}/dailyLogs`)));
        const sortedLogs = lastLogSnap.docs
            .map(d => d.data())
            .sort((a, b) => b.workDate.localeCompare(a.workDate));
        
        if (sortedLogs.length > 0) {
            const lastLog = sortedLogs[0];
            const taskId = lastLog.taskId;
            
            const taskSnap = await getDoc(doc(db, `${projBasePath}/tasks/${taskId}`));
            if (taskSnap.exists()) {
                const taskName = taskSnap.data().name;
                
                const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
                const todayISO = now.toISOString().split("T")[0];
                const d = new Date(todayISO + "T00:00:00Z");
                const formattedDate = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
                
                const msgText = `<b>Log progress</b>\\n<i>Today, ${formattedDate}</i>\\n\\nContinue with your last task?`;
                const buttons = [
                    [{ text: `✅ Continue — ${taskName}`, callback_data: `task_${taskId}` }],
                    [{ text: "🔁 Different task", callback_data: "dt" }],
                    [{ text: "✖ Cancel", callback_data: "xx" }]
                ];
                await tg.sendMessage(chatId, msgText, buttons);
                return;
            }
        }
    } catch (e) {
        // Fall back to normal picker
    }

    await showTaskPicker(tg, chatId, null, session, projBasePath);
    return;
  }"""

# Need to add showTaskPicker function
new_showTaskPicker = """async function showTaskPicker(tg: TelegramApi, chatId: number, messageId: any, session: any, projBasePath: string) {
    const tasksSnap = await getDocs(query(collection(db, `${projBasePath}/tasks`)));
    const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((t:any) => t.status !== "Completed");
    
    if (tasks.length === 0) {
      const msg = "No active tasks to log.";
      if (messageId) await tg.editMessage(chatId, messageId, msg);
      else await tg.sendMessage(chatId, msg);
      return;
    }
    
    const buttons = tasks.slice(0, 50).map(t => [{ text: (t as any).name, callback_data: `task_${t.id}` }]);
    buttons.push([{ text: "✖ Cancel", callback_data: "xx" }]);
    const msgText = "Select task to log:";
    if (messageId) {
        await tg.editMessage(chatId, messageId, msgText, buttons);
    } else {
        await tg.sendMessage(chatId, msgText, buttons);
    }
}"""

log_pattern = re.compile(r'  if \(text === "/log"\) \{.*?    return;\n  \}', re.DOTALL)
text = log_pattern.sub(new_log_handler, text)

if "async function showTaskPicker" not in text:
    text += "\n" + new_showTaskPicker

# Add dt and xx to cb handling
cb_pattern = re.compile(r'    if \(data\.startsWith\("proj_"\)\) \{')
cb_replacement = """    if (data === "dt") {
      const projBasePath = await getProjectBasePath(session.activeProjectId, session.orgId);
      await showTaskPicker(tg, chatId, cb.message.message_id, session, projBasePath);
      return;
    } else if (data === "xx") {
      await clearStep(chatId);
      await tg.editMessage(chatId, cb.message.message_id, "Cancelled.");
      return;
    } else if (data.startsWith("proj_")) {"""

text = cb_pattern.sub(cb_replacement, text)

with open(filepath, "w") as f:
    f.write(text)
