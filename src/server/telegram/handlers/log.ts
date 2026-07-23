import { doc, getDoc, collection, query, getDocs, setDoc, orderBy, limit, addDoc, updateDoc, where } from "firebase/firestore";
import { db, storage } from "../../firebase_client.ts";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { serverTimestamp } from "firebase/firestore";
import * as crypto from "crypto";
import { getSession, setSession, clearStep } from "../session.ts";

const projPath = (orgId, projectId) => orgId ? `organizations/${orgId}/projects/${projectId}` : `projects/${projectId}`;
const todayISO = () => {
    const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // Asia/Kolkata
    return now.toISOString().split("T")[0];
};
const fmtDate = (iso) => {
    if (!iso) return "Unknown Date";
    const d = new Date(iso + "T00:00:00Z");
    if (isNaN(d.getTime())) return "Unknown Date";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};

export async function startLog(tg: any, chatId: number, session: any) {
    if (!session.activeProjectId) {
        await tg.sendMessage(chatId, "No active project. Send /projects to pick one.");
        return;
    }
    const draft = { workDate: todayISO() };
    
    await showDatePicker(tg, chatId, null, session);
}

export async function showTodayLogs(tg: any, chatId: number, messageId: number | null, session: any) {
    if (!session.activeProjectId) {
        const text = "⚠️ <b>No Active Project Selected</b>\n\nPlease select a project using /projects first.";
        if (messageId) await tg.editMessage(chatId, messageId, text);
        else await tg.sendMessage(chatId, text);
        return;
    }

    const today = todayISO();
    const base = projPath(session.orgId, session.activeProjectId);
    const logsRef = collection(db, `${base}/dailyLogs`);
    const q = query(logsRef, where("workDate", "==", today));
    
    try {
        const snap = await getDocs(q);
        let text = `<b>📊 Today's Site Progress (${fmtDate(today)})</b>\n\n`;

        if (snap.empty) {
            text += `<i>No site logs recorded for today yet.</i>\n\nTap <b>📝 Log Progress</b> to record progress.`;
        } else {
            text += `Found <b>${snap.size}</b> log(s) for today:\n\n`;
            snap.docs.forEach((docSnap, i) => {
                const data = docSnap.data();
                text += `<b>${i + 1}. Task Progress: ${data.progressPercent || 0}%</b>\n`;
                if (data.note) text += `Note: ${data.note}\n`;
                if (data.createdByName) text += `Logged by: ${data.createdByName}\n`;
                text += `\n`;
            });
        }

        const buttons = [
            [{ text: "📝 Log Site Progress", callback_data: "menu:log" }],
            [{ text: "🔙 Main Menu", callback_data: "menu:main" }]
        ];

        if (messageId) {
            await tg.editMessage(chatId, messageId, text, buttons);
        } else {
            await tg.sendMessage(chatId, text, buttons);
        }
    } catch (err) {
        console.error("Error fetching today's logs:", err);
        const text = "❌ Error fetching today's site logs.";
        if (messageId) await tg.editMessage(chatId, messageId, text);
        else await tg.sendMessage(chatId, text);
    }
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
                    [{ text: "◀ Back", callback_data: "dt:back" }]
                ];
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
    buttons.push([{ text: "◀ Back", callback_data: "dt:back" }]);
    
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
    if ((page + 1) * PER < tasks.length)
    if (nav.length)
        buttons.push(nav);
    buttons.push([{ text: "◀ Back", callback_data: "dt:back" }]);
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
            materials: (d.taskId === taskId && d.materials) ? d.materials : existingMaterials,
            labour: (d.taskId === taskId && d.labour) ? d.labour : existingLabour,
            photoUrls: (d.taskId === taskId && d.photoUrls) ? d.photoUrls : existingPhotoUrls,
            note: (d.taskId === taskId && d.note !== undefined) ? d.note : existingNote,
        },
    });
    const opts = [0, 25, 50, 75, 100];
    const rows = [];
    rows.push(opts.map((v) => ({
        text: v === 100 ? "100 ✓" : String(v),
        callback_data: `p:${v}`,
    })));
    rows.push([{ text: "◀ Back", callback_data: "dt:changetask" }]);
    
    await tg.editMessage(chatId, messageId, `<b>${t.name}</b>\nDate: ${fmtDate(dt)} · now at <b>${current}%</b>\n\n<b>Progress?</b>\n<i>Tap a number, or type one.</i>`, rows);
}
export async function showMenu(tg: any, chatId: number, messageId, session) {
    const d = session.draft || {};
    const mats = (d.materials || []).length;
    const lab = (d.labour || []).length;
    const photos = (d.photoUrls || []).length;
    let text = `<b>${d.taskName}</b>\n${fmtDate(d.workDate)} · ${d.currentProgress}% → <b>${d.progressPercent}%</b>\n`;
    if (mats)
        text += `\n📦 ${mats} material${mats > 1 ? "s" : ""}`;
    if (lab)
        text += `\n👷 ${lab} labour`;
    if (photos)
        text += `\n📷 ${photos} photo${photos > 1 ? "s" : ""}`;
    if (d.note)
        text += `\n📝 ${d.note}`;
    const rows = [
        [{ text: "✅ Save", callback_data: "sv" }],
        [{ text: "✏️ Edit Progress", callback_data: `ct:${d.taskId}` }],
        [{ text: "+ Materials", callback_data: "m" }, { text: "+ Labour", callback_data: "l" }],
        [{ text: "+ Photo", callback_data: "ph" }, { text: "+ Note", callback_data: "nt" }],
        [{ text: "◀ Back", callback_data: "dt:changetask" }],
    ];
    if (messageId)
        await tg.editMessage(chatId, messageId, text, rows);
    else
        await tg.sendMessage(chatId, text, rows);
}
export async function pickMaterial(tg: any, chatId: number, messageId, session) {
    const base = projPath(session.orgId, session.activeProjectId);
    const snap = await getDocs(query(collection(db, `${base}/inventory`), orderBy("name"), limit(20)));
    if (snap.empty) {
        await tg.editMessage(chatId, messageId, "No inventory items found for this project.");
        return;
    }
    const rows = snap.docs.map((d) => [
        { text: d.data().name, callback_data: `mi:${d.id}` },
    ]);
    rows.push([{ text: "◀ Back", callback_data: "bk" }]);
    await tg.editMessage(chatId, messageId, "<b>Which material?</b>", rows);
}
export async function askMaterialQty(tg: any, chatId: number, messageId, session, invId) {
    const base = projPath(session.orgId, session.activeProjectId);
    const snap = await getDoc(doc(db, `${base}/inventory/${invId}`));
    if (!snap.exists())
        return;
    const item = snap.data();
    await setSession(chatId, {
        step: "log:material_qty",
        draft: {
            ...(session.draft || {}),
            pendingMaterial: { materialId: invId, name: item.name, unit: item.unit || "" },
        },
    });
    await tg.editMessage(chatId, messageId, `<b>${item.name}</b>\n\nHow much was used? (${item.unit || "qty"})\n<i>Type a number.</i>`);
}
export async function pickLabourRole(tg: any, chatId: number, messageId, session) {
    const base = projPath(session.orgId, session.activeProjectId);
    const snap = await getDocs(query(collection(db, `${base}/labor_rate_cards`), limit(20)));
    if (snap.empty) {
        await tg.editMessage(chatId, messageId, "No labour roles set up. Add them in the web app.");
        return;
    }
    const rows = snap.docs.map((d) => {
        const r = d.data();
        return [{ text: r.role || r.roleName || r.name || "Role", callback_data: `lr:${d.id}` }];
    });
    rows.push([{ text: "◀ Back", callback_data: "bk" }]);
    await tg.editMessage(chatId, messageId, "<b>Which role?</b>", rows);
}
export async function askHeadcount(tg: any, chatId: number, messageId, session, roleId) {
    const base = projPath(session.orgId, session.activeProjectId);
    const snap = await getDoc(doc(db, `${base}/labor_rate_cards/${roleId}`));
    if (!snap.exists())
        return;
    const r = snap.data();
    const roleName = r.role || r.roleName || r.name || "Role";
    await setSession(chatId, {
        step: "log:labour_count",
        draft: { ...(session.draft || {}), pendingLabour: { roleId, roleName } },
    });
    await tg.editMessage(chatId, messageId, `<b>${roleName}</b>\n\nHow many workers?\n<i>Type a number.</i>`);
}
export async function handlePhoto(tg: any, chatId: number, session: any, photoArray: any[]) {
    await tg.sendMessage(chatId, "⏳ Saving photo...");
    const base = projPath(session.orgId, session.activeProjectId);
    const d = session.draft || {};
    
    // get best res
    const p = photoArray.sort((a, b) => b.width - a.width)[0];
    const filePath = await tg.getFile(p.file_id);
    if (!filePath) {
        await tg.sendMessage(chatId, "Couldn't get file.");
        return;
    }
    const url = `https://api.telegram.org/file/bot${tg.botToken}/${filePath}`;
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();

    
    
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:image/jpeg;base64,${base64}`;
    const photoUrls = [...(d.photoUrls || []), dataUrl];
    await setSession(chatId, { draft: { ...d, photoUrls } });
    
    const s = await getSession(chatId);
    await showMenu(tg, chatId, null, s);
}
export async function saveLog(tg: any, chatId: number, messageId, session) {
    const d = session.draft || {};
    const base = projPath(session.orgId, session.activeProjectId);
    // Same payload shape as the web app, so the existing dailyLogs Cloud Function
    // handles task progress and inventory rollups automatically.
    await setDoc(doc(db, `${base}/dailyLogs/${d.logId}`), {
        taskId: d.taskId,
        projectId: session.activeProjectId,
        workDate: d.workDate,
        progressPercent: d.progressPercent,
        markComplete: d.progressPercent === 100,
        materials: d.materials || [],
        labour: d.labour || [],
        note: d.note || "",
        photoUrls: d.photoUrls || [],
        createdVia: "telegram",
        createdByUid: session.userId,
        createdByName: session.email || "Telegram Bot",
        createdAt: new Date().toISOString(),
    });
    const recent = [
        d.taskId,
        ...((session.recentTaskIds || []).filter((t) => t !== d.taskId)),
    ].slice(0, 3);
    await clearStep(chatId);
    let summary = `✅ <b>Logged</b>\n\n${d.taskName} — ${d.progressPercent}%`;
    if ((d.materials || []).length) {
        summary += `\n📦 <b>Materials:</b>`;
        d.materials.forEach(m => {
            summary += `\n- ${m.name}: ${m.quantity} ${m.unit || ''}`;
        });
    }
    if ((d.labour || []).length) {
        summary += `\n👷 <b>Labour:</b>`;
        d.labour.forEach(l => {
            summary += `\n- ${l.roleName || l.role}: ${l.headcount}`;
        });
    }
    
    summary += `\n\nReport generated successfully. The respective WBS and costs are updated.`;
        
    const buttons = [
        [{ text: "➕ Update another task", callback_data: "dt:changetask" }]
    ];
    await tg.editMessage(chatId, messageId, summary, buttons);
}
