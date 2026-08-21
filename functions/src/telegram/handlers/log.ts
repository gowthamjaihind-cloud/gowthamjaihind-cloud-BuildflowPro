import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { getSession, setSession, clearStep } from "../session";
import { db } from "../../db";
import { tt, normalizeLang } from "../i18n";
const projPath = (orgId, projectId) => orgId ? `organizations/${orgId}/projects/${projectId}` : `projects/${projectId}`;
const todayISO = () => {
    const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // Asia/Kolkata
    return now.toISOString().split("T")[0];
};
const fmtDate = (iso) => {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};
export async function showTaskPicker(tg: any, chatId: number, messageId: any, session: any) {
    const lang = normalizeLang(session?.lang);
    const base = projPath(session.orgId, session.activeProjectId);
    const recent = session.recentTaskIds || [];
    const buttons = [];
    for (const tid of recent.slice(0, 3)) {
        const snap = await db.doc(`${base}/tasks/${tid}`).get();
        if (!snap.exists) continue;
        buttons.push([{ text: snap.data().name, callback_data: `t:${tid}` }]);
    }
    buttons.push([{ text: tt(lang, "btnBrowseAll"), callback_data: "br:0" }]);
    buttons.push([{ text: tt(lang, "btnCancel"), callback_data: "xx" }]);
    await setSession(chatId, { step: "log:task", draft: {} });

    const text = recent.length ? tt(lang, "whatWorkedToday") : tt(lang, "pickTask");
    if (messageId) {
        await tg.editMessage(chatId, messageId, text, buttons);
    } else {
        await tg.sendMessage(chatId, text, buttons);
    }
}

export async function startLog(tg: any, chatId: number, session: any) {
    const lang = normalizeLang(session?.lang);
    if (!session.activeProjectId) {
        await tg.sendMessage(chatId, tt(lang, "noActiveProject"));
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
                const msgText = tt(lang, "logProgressContinue", { date: formattedDate });
                const buttons = [
                    [{ text: tt(lang, "btnContinueTask", { name: taskName }), callback_data: `ct:${taskId}` }],
                    [{ text: tt(lang, "btnDifferentTask"), callback_data: "dt" }],
                    [{ text: tt(lang, "btnCancel"), callback_data: "xx" }]
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
}
export async function browseTasks(tg: any, chatId: number, messageId, session, page) {
    const lang = normalizeLang(session?.lang);
    const base = projPath(session.orgId, session.activeProjectId);
    const snap = await db.collection(`${base}/tasks`).orderBy("name").get();
    const tasks = snap.docs.map((d) => ({ id: d.id, name: d.data().name }));
    const PER = 8;
    const slice = tasks.slice(page * PER, page * PER + PER);
    const buttons = slice.map((t) => [
        { text: t.name, callback_data: `t:${t.id}` },
    ]);
    const nav = [];
    if (page > 0)
        nav.push({ text: tt(lang, "btnPrev"), callback_data: `br:${page - 1}` });
    if ((page + 1) * PER < tasks.length)
        nav.push({ text: tt(lang, "btnNext"), callback_data: `br:${page + 1}` });
    if (nav.length)
        buttons.push(nav);
    buttons.push([{ text: tt(lang, "btnCancel"), callback_data: "xx" }]);
    await tg.editMessage(chatId, messageId, tt(lang, "pickTask"), buttons);
}
export async function pickTask(tg: any, chatId: number, messageId, session, taskId) {
    const lang = normalizeLang(session?.lang);
    const base = projPath(session.orgId, session.activeProjectId);
    const snap = await db.doc(`${base}/tasks/${taskId}`).get();
    if (!snap.exists) {
        await tg.editMessage(chatId, messageId, tt(lang, "taskGone"));
        return;
    }
    const t = snap.data();
    const current = t.progress || 0;
    const logId = db.collection(`${base}/dailyLogs`).doc().id;
    await setSession(chatId, {
        step: "log:progress",
        draft: {
            logId,
            taskId,
            taskName: t.name,
            workDate: todayISO(),
            currentProgress: current,
            materials: [],
            labour: [],
            equipment: [],
            photoUrls: [],
        },
    });
    const opts = [current + 5, current + 10, current + 15, current + 20, current + 25, current + 30, 95, 100]
        .filter((v, i, a) => v > current && v <= 100 && a.indexOf(v) === i)
        .slice(0, 8);
    const rows = [];
    for (let i = 0; i < opts.length; i += 4) {
        rows.push(opts.slice(i, i + 4).map((v) => ({
            text: v === 100 ? "100 ✓" : String(v),
            callback_data: `p:${v}`,
        })));
    }
    rows.push([{ text: tt(lang, "btnCancel"), callback_data: "xx" }]);
    await tg.editMessage(chatId, messageId, tt(lang, "progressPrompt", {
        name: t.name,
        date: fmtDate(todayISO()),
        current,
    }), rows);
}
export async function showMenu(tg: any, chatId: number, messageId, session) {
    const lang = normalizeLang(session?.lang);
    const d = session.draft || {};
    const mats = (d.materials || []).length;
    const lab = (d.labour || []).length;
    const equip = (d.equipment || []).length;
    const photos = (d.photoUrls || []).length;
    let text = `<b>${d.taskName}</b>\n${fmtDate(d.workDate)} · ${d.currentProgress}% → <b>${d.progressPercent}%</b>\n`;
    if (mats)
        text += "\n" + tt(lang, "menuMaterials", { n: mats });
    if (lab)
        text += "\n" + tt(lang, "menuLabour", { n: lab });
    if (equip)
        text += "\n" + tt(lang, "menuEquipment", { n: equip });
    if (photos)
        text += "\n" + tt(lang, "menuPhotos", { n: photos });
    if (d.note)
        text += "\n" + tt(lang, "menuNote", { note: d.note });
    const rows = [
        [{ text: tt(lang, "btnSave"), callback_data: "sv" }],
        [{ text: tt(lang, "btnAddMaterials"), callback_data: "m" }, { text: tt(lang, "btnAddLabour"), callback_data: "l" }],
        [{ text: tt(lang, "btnAddEquipment"), callback_data: "e" }, { text: tt(lang, "btnAddPhoto"), callback_data: "ph" }],
        [{ text: tt(lang, "btnAddNote"), callback_data: "nt" }],
        [{ text: tt(lang, "btnCancel"), callback_data: "xx" }],
    ];
    await setSession(chatId, { step: "log:menu" });
    if (messageId)
        await tg.editMessage(chatId, messageId, text, rows);
    else
        await tg.sendMessage(chatId, text, rows);
}
export async function pickMaterial(tg: any, chatId: number, messageId, session) {
    const lang = normalizeLang(session?.lang);
    const base = projPath(session.orgId, session.activeProjectId);
    const snap = await db.collection(`${base}/inventory`).orderBy("name").limit(20).get();
    if (snap.empty) {
        await tg.editMessage(chatId, messageId, tt(lang, "noInventory"));
        return;
    }
    const rows = snap.docs.map((d) => [
        { text: d.data().name, callback_data: `mi:${d.id}` },
    ]);
    rows.push([{ text: tt(lang, "btnBack"), callback_data: "bk" }]);
    await setSession(chatId, { step: "log:material_pick" });
    await tg.editMessage(chatId, messageId, tt(lang, "whichMaterial"), rows);
}
export async function askMaterialQty(tg: any, chatId: number, messageId, session, invId) {
    const base = projPath(session.orgId, session.activeProjectId);
    const snap = await db.doc(`${base}/inventory/${invId}`).get();
    if (!snap.exists)
        return;
    const item = snap.data();
    const lang = normalizeLang(session?.lang);
    await setSession(chatId, {
        step: "log:material_qty",
        draft: {
            ...(session.draft || {}),
            pendingMaterial: { materialId: invId, name: item.name, unit: item.unit || "" },
        },
    });
    await tg.editMessage(chatId, messageId, tt(lang, "materialQtyPrompt", {
        name: item.name,
        unit: item.unit || "qty",
    }));
}
export async function pickLabourRole(tg: any, chatId: number, messageId, session) {
    const lang = normalizeLang(session?.lang);
    const base = projPath(session.orgId, session.activeProjectId);
    const snap = await db.collection(`${base}/labor_rate_cards`).limit(20).get();
    if (snap.empty) {
        await tg.editMessage(chatId, messageId, tt(lang, "noLabourRoles"));
        return;
    }
    const rows = snap.docs.map((d) => {
        const r = d.data();
        return [{ text: r.roleName || r.name || "Role", callback_data: `lr:${d.id}` }];
    });
    rows.push([{ text: tt(lang, "btnBack"), callback_data: "bk" }]);
    await setSession(chatId, { step: "log:labour_pick" });
    await tg.editMessage(chatId, messageId, tt(lang, "whichRole"), rows);
}
export async function askHeadcount(tg: any, chatId: number, messageId, session, roleId) {
    const base = projPath(session.orgId, session.activeProjectId);
    const snap = await db.doc(`${base}/labor_rate_cards/${roleId}`).get();
    if (!snap.exists)
        return;
    const r = snap.data();
    const lang = normalizeLang(session?.lang);
    const roleName = r.roleName || r.name || "Role";
    await setSession(chatId, {
        step: "log:labour_count",
        draft: { ...(session.draft || {}), pendingLabour: { roleId, roleName } },
    });
    await tg.editMessage(chatId, messageId, tt(lang, "headcountPrompt", { role: roleName }));
}
export async function pickEquipment(tg: any, chatId: number, messageId, session) {
    const lang = normalizeLang(session?.lang);
    const base = projPath(session.orgId, session.activeProjectId);
    const snap = await db.collection(`${base}/equipment`).limit(20).get();
    if (snap.empty) {
        await tg.editMessage(chatId, messageId, tt(lang, "noEquipment"));
        return;
    }
    const rows = snap.docs.map((d) => {
        const e = d.data();
        const label = e.ownership ? `${e.name} (${e.ownership})` : e.name;
        return [{ text: label, callback_data: `ei:${d.id}` }];
    });
    rows.push([{ text: tt(lang, "btnBack"), callback_data: "bk" }]);
    await setSession(chatId, { step: "log:equipment_pick" });
    await tg.editMessage(chatId, messageId, tt(lang, "whichEquipment"), rows);
}
export async function askEquipmentUnit(tg: any, chatId: number, messageId, session, equipmentId) {
    const base = projPath(session.orgId, session.activeProjectId);
    const snap = await db.doc(`${base}/equipment/${equipmentId}`).get();
    if (!snap.exists)
        return;
    const e = snap.data();
    const lang = normalizeLang(session?.lang);
    await setSession(chatId, {
        step: "log:equipment_unit",
        draft: { ...(session.draft || {}), pendingEquipment: { equipmentId, name: e.name } },
    });
    await tg.editMessage(chatId, messageId, tt(lang, "measuredIn", { name: e.name }), [
        [{ text: tt(lang, "btnHours"), callback_data: "eu:hours" }, { text: tt(lang, "btnDays"), callback_data: "eu:days" }],
        [{ text: tt(lang, "btnBack"), callback_data: "bk" }],
    ]);
}
export async function askEquipmentQty(tg: any, chatId: number, messageId, session, unit) {
    const lang = normalizeLang(session?.lang);
    const d = session.draft || {};
    const pe = d.pendingEquipment || {};
    await setSession(chatId, {
        step: "log:equipment_qty",
        draft: { ...d, pendingEquipment: { ...pe, unit } },
    });
    const unitWord = unit === "days" ? tt(lang, "btnDays") : tt(lang, "btnHours");
    await tg.editMessage(chatId, messageId, tt(lang, "equipmentQtyPrompt", {
        name: pe.name,
        unit: unitWord.toLowerCase(),
    }));
}
export async function handlePhoto(tg: any, chatId: number, session, photoSizes) {
    const lang = normalizeLang(session?.lang);
    const d = session.draft || {};
    if (!d.logId) {
        await tg.sendMessage(chatId, tt(lang, "startLogBeforePhoto"));
        return;
    }
    // Telegram sends several resolutions — the last one is the largest.
    const largest = photoSizes[photoSizes.length - 1];
    const filePath = await tg.getFile(largest.file_id);
    if (!filePath) {
        await tg.sendMessage(chatId, tt(lang, "cantFetchPhoto"));
        return;
    }
    // Download the image bytes from Telegram.
    const res = await fetch(`https://api.telegram.org/file/bot${tg.botToken}/${filePath}`);
    if (!res.ok) {
        await tg.sendMessage(chatId, tt(lang, "cantDownloadPhoto"));
        return;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    // Upload to Firebase Storage, using the SAME path convention as the web app:
    //   {projectPath}/dailyLogs/{logId}/photo_{ts}.jpg
    const base = projPath(session.orgId, session.activeProjectId);
    const idx = (d.photoUrls || []).length;
    const storagePath = `${base}/dailyLogs/${d.logId}/photo_${Date.now()}_${idx}.jpg`;
    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);
    // CRITICAL: set a download token so the resulting URL matches the format that
    // getDownloadURL() produces in the web app. The dailyLogs Cloud Function's
    // deletePhotos() parses "/o/" out of that URL — a signed URL would NOT match and
    // photos would be orphaned in the bucket forever.
    const token = crypto.randomUUID();
    await file.save(buffer, {
        metadata: {
            contentType: "image/jpeg",
            metadata: { firebaseStorageDownloadTokens: token },
        },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
        `${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
    const photoUrls = [...(d.photoUrls || []), url];
    await setSession(chatId, { draft: { ...d, photoUrls } });
    const s = await getSession(chatId);
    await showMenu(tg, chatId, null, s);
}
export async function saveLog(tg: any, chatId: number, messageId, session) {
    const lang = normalizeLang(session?.lang);
    const d = session.draft || {};
    const base = projPath(session.orgId, session.activeProjectId);
    // Same payload shape as the web app, so the existing dailyLogs Cloud Function
    // handles task progress and inventory rollups automatically.
    await db.collection(`${base}/dailyLogs`).doc(d.logId).set({
        taskId: d.taskId,
        projectId: session.activeProjectId,
        workDate: d.workDate,
        progressPercent: d.progressPercent,
        markComplete: d.progressPercent === 100,
        materials: d.materials || [],
        labour: d.labour || [],
        equipment: d.equipment || [],
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
    await setSession(chatId, { recentTaskIds: recent });
    await clearStep(chatId);
    let summary = tt(lang, "loggedSummary", { name: d.taskName, pct: d.progressPercent });
    if ((d.materials || []).length)
        summary += tt(lang, "loggedMaterials", { n: d.materials.length });
    if ((d.labour || []).length)
        summary += tt(lang, "loggedLabour", { n: d.labour.length });
    await tg.editMessage(chatId, messageId, summary);
}

export async function showToday(tg: any, chatId: number, session: any) {
    const lang = normalizeLang(session?.lang);
    if (!session.activeProjectId) {
        await tg.sendMessage(chatId, tt(lang, "noActiveProject"));
        return;
    }
    const base = projPath(session.orgId, session.activeProjectId);
    const today = todayISO();

    const snap = await db.collection(`${base}/dailyLogs`)
        .where("workDate", "==", today)
        .get();

    if (snap.empty) {
        await tg.sendMessage(chatId, tt(lang, "todayNothing", { date: fmtDate(today) }));
        return;
    }

    const logs = snap.docs.map((d) => d.data());

    // Resolve task names (deduped) — logs store taskId, not the name.
    const taskIds = Array.from(new Set(logs.map((l) => l.taskId).filter(Boolean)));
    const taskNames = new Map<string, string>();
    await Promise.all(taskIds.map(async (tid) => {
        const t = await db.doc(`${base}/tasks/${tid}`).get();
        if (t.exists) taskNames.set(tid, t.data()!.name || "Task");
    }));

    let text = tt(lang, "todayHeader", { date: fmtDate(today), n: logs.length });
    for (const l of logs) {
        const name = taskNames.get(l.taskId) || "Task";
        text += `\n• <b>${name}</b> — ${l.progressPercent ?? 0}%`;
        const extras = [];
        if ((l.materials || []).length) extras.push(`📦 ${l.materials.length}`);
        if ((l.labour || []).length) extras.push(`👷 ${l.labour.length}`);
        if ((l.photoUrls || []).length) extras.push(`📷 ${l.photoUrls.length}`);
        if (extras.length) text += `  ${extras.join("  ")}`;
        if (l.note) text += `\n  📝 ${l.note}`;
        if (l.createdByName) text += `\n  <i>${tt(lang, "todayBy", { name: l.createdByName })}</i>`;
    }
    await tg.sendMessage(chatId, text);
}
