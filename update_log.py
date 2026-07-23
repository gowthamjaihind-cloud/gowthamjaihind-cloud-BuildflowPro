import re

with open("src/server/telegram/handlers/log.ts", "r") as f:
    text = f.read()

# We need to replace `startLog` and `showTaskPicker` and `pickTask` entirely.
# Let's find where they are.
start_idx = text.find("export async function showTaskPicker")
end_idx = text.find("export async function showMenu")

new_flow = """
export async function startLog(tg: any, chatId: number, session: any) {
    if (!session.activeProjectId) {
        await tg.sendMessage(chatId, "No active project. Send /projects to pick one.");
        return;
    }
    const draft = { workDate: todayISO() };
    await setSession(chatId, { step: "log:date", draft });
    
    await showDatePicker(tg, chatId, null, session);
}

export async function showDatePicker(tg: any, chatId: number, messageId: any, session: any) {
    const today = todayISO();
    const rows = [
        [{ text: `✅ Today (${fmtDate(today)})`, callback_data: `dt:${today}` }],
        [{ text: "📅 Choose Previous Date", callback_data: "dt:pick" }],
        [{ text: "✖ Cancel", callback_data: "xx" }]
    ];
    
    const text = "<b>Daily Progress</b>\nSelect the date for this log:";
    if (messageId) {
        await tg.editMessage(chatId, messageId, text, rows);
    } else {
        await tg.sendMessage(chatId, text, rows);
    }
}

export async function pickCustomDate(tg: any, chatId: number, messageId: any) {
    const rows = [];
    const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    for (let i = 1; i <= 6; i++) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const iso = d.toISOString().split("T")[0];
        rows.push([{ text: fmtDate(iso), callback_data: `dt:${iso}` }]);
    }
    rows.push([{ text: "◀ Back", callback_data: "dt:back" }]);
    await tg.editMessage(chatId, messageId, "<b>Select Date</b>", rows);
}

export async function confirmTask(tg: any, chatId: number, messageId: any, session: any, workDate: string) {
    const base = projPath(session.orgId, session.activeProjectId);
    
    // update session draft with workDate
    const d = session.draft || {};
    await setSession(chatId, { draft: { ...d, workDate } });
    
    try {
        const lastLogSnap = await getDocs(query(collection(db, `${base}/dailyLogs`),
            orderBy("createdAt", "desc"),
            limit(1)
        ));
        
        if (!lastLogSnap.empty) {
            const lastLog = lastLogSnap.docs[0].data();
            const taskId = lastLog.taskId;
            
            const taskSnap = await getDoc(doc(db, `${base}/tasks/${taskId}`));
            if (taskSnap.exists()) {
                const taskName = taskSnap.data().name;
                const msgText = `<b>Date:</b> ${fmtDate(workDate)}\n\nLast updated task:\n<b>${taskName}</b>\n\nContinue with this task?`;
                const buttons = [
                    [{ text: `✅ Continue — ${taskName}`, callback_data: `ct:${taskId}` }],
                    [{ text: "🔁 Change task", callback_data: "dt:changetask" }],
                    [{ text: "✖ Cancel", callback_data: "xx" }]
                ];
                await setSession(chatId, { step: "log:task" });
                if (messageId) {
                    await tg.editMessage(chatId, messageId, msgText, buttons);
                } else {
                    await tg.sendMessage(chatId, msgText, buttons);
                }
                return;
            }
        }
    } catch (e) {
        console.error("Task query error:", e);
    }

    // fallback to browse directly
    await showTaskPicker(tg, chatId, messageId, session);
}

export async function showTaskPicker(tg: any, chatId: number, messageId: any, session: any) {
    const base = projPath(session.orgId, session.activeProjectId);
    const recent = session.recentTaskIds || [];
    const buttons = [];
    for (const tid of recent.slice(0, 3)) {
        const snap = await getDoc(doc(db, `${base}/tasks/${tid}`));
        if (!snap.exists()) continue;
        buttons.push([{ text: snap.data().name, callback_data: `t:${tid}` }]);
    }
    buttons.push([{ text: "🔍 Browse all tasks", callback_data: "br:0" }]);
    buttons.push([{ text: "✖ Cancel", callback_data: "xx" }]);
    await setSession(chatId, { step: "log:task" });
    
    const text = recent.length ? "<b>What did you work on today?</b>" : "<b>Pick a task</b>";
    if (messageId) {
        await tg.editMessage(chatId, messageId, text, buttons);
    } else {
        await tg.sendMessage(chatId, text, buttons);
    }
}

export async function browseTasks(tg: any, chatId: number, messageId: any, session: any, page: number) {
    const base = projPath(session.orgId, session.activeProjectId);
    const snap = await getDocs(query(collection(db, `${base}/tasks`), orderBy("name")));
    const tasks = snap.docs.map((d) => ({ id: d.id, name: d.data().name }));
    const PER = 8;
    const slice = tasks.slice(page * PER, page * PER + PER);
    const buttons = slice.map((t) => [
        { text: t.name, callback_data: `t:${t.id}` },
    ]);
    const nav = [];
    if (page > 0)
        nav.push({ text: "◀ Prev", callback_data: `br:${page - 1}` });
    if ((page + 1) * PER < tasks.length)
        nav.push({ text: "Next ▶", callback_data: `br:${page + 1}` });
    if (nav.length)
        buttons.push(nav);
    buttons.push([{ text: "✖ Cancel", callback_data: "xx" }]);
    await tg.editMessage(chatId, messageId, "<b>Pick a task</b>", buttons);
}

export async function pickTask(tg: any, chatId: number, messageId: any, session: any, taskId: string) {
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
            materials: [],
            labour: [],
            photoUrls: [],
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
    await tg.editMessage(chatId, messageId, `<b>${t.name}</b>\nDate: ${fmtDate(dt)} · now at <b>${current}%</b>\n\n<b>Progress?</b>\n<i>Tap a number, or type one.</i>`, rows);
}
"""

text = text[:start_idx] + new_flow + text[end_idx:]

with open("src/server/telegram/handlers/log.ts", "w") as f:
    f.write(text)
