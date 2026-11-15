import * as admin from "firebase-admin";
import { sameDayLogs, whoSaved } from "../../bot/duplicateLog";
import * as crypto from "crypto";
import { getSession, setSession, clearStep, type ChatId } from "../session";
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
export async function showTaskPicker(tg: any, chatId: ChatId, messageId: any, session: any) {
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

export async function startLog(tg: any, chatId: ChatId, session: any) {
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
export async function browseTasks(tg: any, chatId: ChatId, messageId, session, page) {
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
export async function pickTask(tg: any, chatId: ChatId, messageId, session, taskId) {
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
const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Logs already saved for the draft's task on the draft's day (not the draft itself). */
async function sameDayLogsFor(session: any, d: any) {
    if (!d.taskId || !d.workDate || !session.activeProjectId) return [];
    try {
        const base = projPath(session.orgId, session.activeProjectId);
        const snap = await db.collection(`${base}/dailyLogs`).where("taskId", "==", d.taskId).where("workDate", "==", d.workDate).limit(10).get();
        return sameDayLogs(snap.docs.map((x) => ({ id: x.id, ...(x.data() as any) })), d.taskId, d.workDate, d.logId);
    } catch (e) {
        // A warning is a courtesy: never let it stop the menu from showing.
        console.error("same-day log check failed", e);
        return [];
    }
}

export async function showMenu(tg: any, chatId: ChatId, messageId, session) {
    const lang = normalizeLang(session?.lang);
    const d = session.draft || {};
    const mats = (d.materials || []).length;
    const lab = (d.labour || []).length;
    const equip = (d.equipment || []).length;
    const photos = (d.photoUrls || []).length;
    const batch = d.batchTotal > 1 ? ` · ${tt(lang, "aiBatchOf", { i: d.batchIndex, n: d.batchTotal })}` : "";
    let text = `<b>${d.taskName}</b>${batch}\n${fmtDate(d.workDate)} · ${d.currentProgress}% → <b>${d.progressPercent}%</b>\n`;
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
    // Same task, same day, already logged: most often the same report sent
    // twice. Saving is still allowed, but only after being told.
    const dupes = await sameDayLogsFor(session, d);
    if (dupes.length) {
        text += "\n\n" + tt(lang, dupes.length > 1 ? "dupWarningMany" : "dupWarning", {
            date: fmtDate(d.workDate),
            pct: Number(dupes[0].progressPercent) || 0,
            who: esc(whoSaved(dupes[0])),
            n: dupes.length,
        });
    }
    const rows = [
        [{ text: tt(lang, dupes.length ? "btnSaveAnyway" : "btnSave"), callback_data: "sv" }],
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
export async function pickMaterial(tg: any, chatId: ChatId, messageId, session) {
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
export async function askMaterialQty(tg: any, chatId: ChatId, messageId, session, invId) {
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
export async function pickLabourRole(tg: any, chatId: ChatId, messageId, session) {
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
export async function askHeadcount(tg: any, chatId: ChatId, messageId, session, roleId) {
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
export async function pickEquipment(tg: any, chatId: ChatId, messageId, session) {
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
export async function askEquipmentUnit(tg: any, chatId: ChatId, messageId, session, equipmentId) {
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
export async function askEquipmentQty(tg: any, chatId: ChatId, messageId, session, unit) {
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
// `photoRef` is whatever the channel uses to identify an image -- Telegram
// passes its array of renditions, WhatsApp a single media id. The handler
// never inspects it; `api.fetchPhotoBytes` does.
/**
 * Fetch one photo from the chat and store it under the log, using the SAME
 * path and URL form as the web app ({projectPath}/dailyLogs/{logId}/photo_*.jpg
 * with a download token): the dailyLogs Cloud Function's deletePhotos()
 * parses "/o/" out of that URL, and a signed URL would leave photos orphaned.
 */
export async function uploadLogPhoto(api: any, base: string, logId: string, photoRef: any, idx: number): Promise<{ ok: true; url: string } | { ok: false; reason: "fetch" | "download" }> {
    // Channel-neutral: TelegramApi resolves a file_id, WhatsAppApi a media id.
    const got = await api.fetchPhotoBytes(photoRef);
    if (!got.ok) return got;
    const storagePath = `${base}/dailyLogs/${logId}/photo_${Date.now()}_${idx}.jpg`;
    const bucket = admin.storage().bucket();
    const token = crypto.randomUUID();
    await bucket.file(storagePath).save(got.buffer, {
        metadata: { contentType: "image/jpeg", metadata: { firebaseStorageDownloadTokens: token } },
    });
    return { ok: true, url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}` };
}
export async function handlePhoto(api: any, chatId: ChatId, session, photoRef: any) {
    const lang = normalizeLang(session?.lang);
    const d = session.draft || {};
    if (!d.logId) {
        await api.sendMessage(chatId, tt(lang, "startLogBeforePhoto"));
        return;
    }
    const base = projPath(session.orgId, session.activeProjectId);
    const up = await uploadLogPhoto(api, base, d.logId, photoRef, (d.photoUrls || []).length);
    if (!up.ok) {
        await api.sendMessage(chatId, tt(lang, (up as any).reason === "fetch" ? "cantFetchPhoto" : "cantDownloadPhoto"));
        return;
    }
    const url = (up as any).url as string;
    const photoUrls = [...(d.photoUrls || []), url];
    await setSession(chatId, { draft: { ...d, photoUrls } });
    const s = await getSession(chatId);
    await showMenu(api, chatId, null, s);
}
/**
 * One typed message can carry several logs (handlers/aiLog.ts). They are shown
 * one at a time; after the current one is saved or skipped this brings up the
 * next. Returns false when there is no next one. Each log gets its own id
 * only when it becomes current, so a skipped one leaves nothing behind.
 */
export async function showNextPendingDraft(api: any, chatId: ChatId, session: any, lead: string): Promise<boolean> {
    const pending: any[] = Array.isArray(session?.pendingDrafts) ? session.pendingDrafts : [];
    if (!pending.length) return false;
    const [next, ...rest] = pending;
    const base = projPath(session.orgId, session.activeProjectId);
    await setSession(chatId, {
        step: "log:menu",
        draft: { ...next, logId: db.collection(`${base}/dailyLogs`).doc().id },
        pendingDrafts: rest,
    });
    if (lead) await api.sendMessage(chatId, lead);
    await showMenu(api, chatId, null, await getSession(chatId));
    return true;
}

export async function saveLog(tg: any, chatId: ChatId, messageId, session) {
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
        // How it was entered: typed as a sentence and read by AI, or tapped
        // through the buttons. Lets the office tell the two apart later.
        entryMethod: d.viaAi ? "ai-text" : "buttons",
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
        summary += tt(lang, "loggedLabour", { n: d.labour.reduce((s: number, l: any) => s + (Number(l.headcount) || 0), 0) });
    // clearStep above removed the queue from Firestore; the copy read with
    // this session is what carries on to the next log from the same message.
    if (messageId) await tg.editMessage(chatId, messageId, summary);
    else await tg.sendMessage(chatId, summary);
    await showNextPendingDraft(tg, chatId, session, "");
}

export async function showToday(tg: any, chatId: ChatId, session: any) {
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

/**
 * Free text that belongs to whatever step the log flow is waiting on.
 *
 * Extracted from the Telegram router so the WhatsApp lane runs the SAME
 * validation rather than a second copy that drifts -- "enter 0 to 100",
 * "quantity must be greater than zero" and the headcount rule are product
 * behaviour, not transport behaviour.
 *
 * Returns true when the text was consumed by a step, false when the caller
 * should fall through to its own "did not understand" reply.
 */
export async function handleStepText(api: any, chatId: ChatId, session: any, text: string): Promise<boolean> {
    const lang = normalizeLang(session?.lang);
    const step = session.step;
    if (step === "log:progress") {
        const pct = parseInt(text, 10);
        if (isNaN(pct) || pct < 0 || pct > 100) {
            await api.sendMessage(chatId, tt(lang, "enter0to100"));
            return true;
        }
        await setSession(chatId, {
            draft: { ...(session.draft || {}), progressPercent: pct },
        });
        const s = await getSession(chatId);
        await showMenu(api, chatId, null, s);
        return true;
    }
    if (step === "log:material_qty") {
        const qty = parseFloat(text);
        if (isNaN(qty) || qty <= 0) {
            await api.sendMessage(chatId, tt(lang, "enterQtyGt0"));
            return true;
        }
        const d = session.draft || {};
        const materials = [...(d.materials || []), { ...d.pendingMaterial, quantity: qty }];
        const rest = { ...d };
        delete rest.pendingMaterial;
        await setSession(chatId, { draft: { ...rest, materials } });
        const s = await getSession(chatId);
        await showMenu(api, chatId, null, s);
        return true;
    }
    if (step === "log:equipment_qty") {
        const qty = parseFloat(text);
        if (isNaN(qty) || qty <= 0) {
            await api.sendMessage(chatId, tt(lang, "enterQtyGt0"));
            return true;
        }
        const d = session.draft || {};
        const pe = d.pendingEquipment || {};
        const equipment = [
            ...(d.equipment || []),
            { equipmentId: pe.equipmentId, name: pe.name, unit: pe.unit || "hours", quantity: qty },
        ];
        const rest = { ...d };
        delete rest.pendingEquipment;
        await setSession(chatId, { draft: { ...rest, equipment } });
        const s = await getSession(chatId);
        await showMenu(api, chatId, null, s);
        return true;
    }
    if (step === "log:labour_count") {
        const n = parseInt(text, 10);
        if (isNaN(n) || n <= 0) {
            await api.sendMessage(chatId, tt(lang, "enterHeadcountGt0"));
            return true;
        }
        const d = session.draft || {};
        const labour = [...(d.labour || []), { ...d.pendingLabour, headcount: n }];
        const rest = { ...d };
        delete rest.pendingLabour;
        await setSession(chatId, { draft: { ...rest, labour } });
        const s = await getSession(chatId);
        await showMenu(api, chatId, null, s);
        return true;
    }
    if (step === "log:note") {
        await setSession(chatId, { draft: { ...(session.draft || {}), note: text } });
        const s = await getSession(chatId);
        await showMenu(api, chatId, null, s);
        return true;
    }
    return false;
}
