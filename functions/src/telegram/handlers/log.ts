import * as admin from "firebase-admin";
import { TelegramApi, InlineButton } from "../api";
import { setSession, clearStep, BotSession } from "../session";

const db = admin.firestore();

const projPath = (orgId: string | undefined, projectId: string) =>
  orgId ? `organizations/${orgId}/projects/${projectId}` : `projects/${projectId}`;

const todayISO = () => {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // Asia/Kolkata
  return now.toISOString().split("T")[0];
};

const fmtDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};

export async function startLog(tg: TelegramApi, chatId: number, session: BotSession) {
  if (!session.activeProjectId) {
    await tg.sendMessage(chatId, "No active project. Send /projects to pick one.");
    return;
  }
  const base = projPath(session.orgId, session.activeProjectId);
  const recent = session.recentTaskIds || [];
  const buttons: InlineButton[][] = [];

  for (const tid of recent.slice(0, 3)) {
    const snap = await db.doc(`${base}/tasks/${tid}`).get();
    if (!snap.exists) continue;
    buttons.push([{ text: snap.data()!.name, callback_data: `t:${tid}` }]);
  }
  buttons.push([{ text: "🔍 Browse all tasks", callback_data: "br:0" }]);
  buttons.push([{ text: "✖ Cancel", callback_data: "xx" }]);

  await setSession(chatId, { step: "log:task", draft: {} });
  await tg.sendMessage(
    chatId,
    recent.length ? "<b>What did you work on today?</b>" : "<b>Pick a task</b>",
    buttons
  );
}

export async function browseTasks(
  tg: TelegramApi, chatId: number, messageId: number, session: BotSession, page: number
) {
  const base = projPath(session.orgId, session.activeProjectId!);
  const snap = await db.collection(`${base}/tasks`).orderBy("name").get();
  const tasks = snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name }));

  const PER = 8;
  const slice = tasks.slice(page * PER, page * PER + PER);
  const buttons: InlineButton[][] = slice.map((t) => [
    { text: t.name, callback_data: `t:${t.id}` },
  ]);

  const nav: InlineButton[] = [];
  if (page > 0) nav.push({ text: "◀ Prev", callback_data: `br:${page - 1}` });
  if ((page + 1) * PER < tasks.length) nav.push({ text: "Next ▶", callback_data: `br:${page + 1}` });
  if (nav.length) buttons.push(nav);
  buttons.push([{ text: "✖ Cancel", callback_data: "xx" }]);

  await tg.editMessage(chatId, messageId, "<b>Pick a task</b>", buttons);
}

export async function pickTask(
  tg: TelegramApi, chatId: number, messageId: number, session: BotSession, taskId: string
) {
  const base = projPath(session.orgId, session.activeProjectId!);
  const snap = await db.doc(`${base}/tasks/${taskId}`).get();
  if (!snap.exists) {
    await tg.editMessage(chatId, messageId, "That task no longer exists.");
    return;
  }
  const t = snap.data()!;
  const current = t.progress || 0;

  await setSession(chatId, {
    step: "log:progress",
    draft: {
      taskId,
      taskName: t.name,
      workDate: todayISO(),
      currentProgress: current,
      materials: [],
      labour: [],
    },
  });

  const opts = [current + 5, current + 10, current + 15, current + 20, current + 25, current + 30, 95, 100]
    .filter((v, i, a) => v > current && v <= 100 && a.indexOf(v) === i)
    .slice(0, 8);

  const rows: InlineButton[][] = [];
  for (let i = 0; i < opts.length; i += 4) {
    rows.push(opts.slice(i, i + 4).map((v) => ({
      text: v === 100 ? "100 ✓" : String(v),
      callback_data: `p:${v}`,
    })));
  }
  rows.push([{ text: "✖ Cancel", callback_data: "xx" }]);

  await tg.editMessage(
    chatId, messageId,
    `<b>${t.name}</b>\nToday, ${fmtDate(todayISO())} · now at <b>${current}%</b>\n\n<b>Progress?</b>\n<i>Tap a number, or type one.</i>`,
    rows
  );
}

export async function showMenu(
  tg: TelegramApi, chatId: number, messageId: number | null, session: BotSession
) {
  const d: any = session.draft || {};
  const mats = (d.materials || []).length;
  const lab = (d.labour || []).length;
  const photos = (d.photoUrls || []).length;

  let text = `<b>${d.taskName}</b>\n${fmtDate(d.workDate)} · ${d.currentProgress}% → <b>${d.progressPercent}%</b>\n`;
  if (mats) text += `\n📦 ${mats} material${mats > 1 ? "s" : ""}`;
  if (lab) text += `\n👷 ${lab} labour`;
  if (photos) text += `\n📷 ${photos} photo${photos > 1 ? "s" : ""}`;
  if (d.note) text += `\n📝 ${d.note}`;

  const rows: InlineButton[][] = [
    [{ text: "✅ Save", callback_data: "sv" }],
    [{ text: "+ Materials", callback_data: "m" }, { text: "+ Labour", callback_data: "l" }],
    [{ text: "+ Note", callback_data: "nt" }],
    [{ text: "✖ Cancel", callback_data: "xx" }],
  ];

  await setSession(chatId, { step: "log:menu" });
  if (messageId) await tg.editMessage(chatId, messageId, text, rows);
  else await tg.sendMessage(chatId, text, rows);
}

export async function pickMaterial(
  tg: TelegramApi, chatId: number, messageId: number, session: BotSession
) {
  const base = projPath(session.orgId, session.activeProjectId!);
  const snap = await db.collection(`${base}/inventory`).orderBy("name").limit(20).get();
  if (snap.empty) {
    await tg.editMessage(chatId, messageId, "No inventory items found for this project.");
    return;
  }
  const rows: InlineButton[][] = snap.docs.map((d) => [
    { text: (d.data() as any).name, callback_data: `mi:${d.id}` },
  ]);
  rows.push([{ text: "◀ Back", callback_data: "bk" }]);

  await setSession(chatId, { step: "log:material_pick" });
  await tg.editMessage(chatId, messageId, "<b>Which material?</b>", rows);
}

export async function askMaterialQty(
  tg: TelegramApi, chatId: number, messageId: number, session: BotSession, invId: string
) {
  const base = projPath(session.orgId, session.activeProjectId!);
  const snap = await db.doc(`${base}/inventory/${invId}`).get();
  if (!snap.exists) return;
  const item: any = snap.data();

  await setSession(chatId, {
    step: "log:material_qty",
    draft: {
      ...(session.draft || {}),
      pendingMaterial: { materialId: invId, name: item.name, unit: item.unit || "" },
    },
  });

  await tg.editMessage(
    chatId, messageId,
    `<b>${item.name}</b>\n\nHow much was used? (${item.unit || "qty"})\n<i>Type a number.</i>`
  );
}

export async function pickLabourRole(
  tg: TelegramApi, chatId: number, messageId: number, session: BotSession
) {
  const base = projPath(session.orgId, session.activeProjectId!);
  const snap = await db.collection(`${base}/labor_rate_cards`).limit(20).get();
  if (snap.empty) {
    await tg.editMessage(chatId, messageId, "No labour roles set up. Add them in the web app.");
    return;
  }
  const rows: InlineButton[][] = snap.docs.map((d) => {
    const r: any = d.data();
    return [{ text: r.roleName || r.name || "Role", callback_data: `lr:${d.id}` }];
  });
  rows.push([{ text: "◀ Back", callback_data: "bk" }]);

  await setSession(chatId, { step: "log:labour_pick" });
  await tg.editMessage(chatId, messageId, "<b>Which role?</b>", rows);
}

export async function askHeadcount(
  tg: TelegramApi, chatId: number, messageId: number, session: BotSession, roleId: string
) {
  const base = projPath(session.orgId, session.activeProjectId!);
  const snap = await db.doc(`${base}/labor_rate_cards/${roleId}`).get();
  if (!snap.exists) return;
  const r: any = snap.data();
  const roleName = r.roleName || r.name || "Role";

  await setSession(chatId, {
    step: "log:labour_count",
    draft: { ...(session.draft || {}), pendingLabour: { roleId, roleName } },
  });

  await tg.editMessage(chatId, messageId, `<b>${roleName}</b>\n\nHow many workers?\n<i>Type a number.</i>`);
}

export async function saveLog(
  tg: TelegramApi, chatId: number, messageId: number, session: BotSession
) {
  const d: any = session.draft || {};
  const base = projPath(session.orgId, session.activeProjectId!);

  // Same payload shape as the web app, so the existing dailyLogs Cloud Function
  // handles task progress and inventory rollups automatically.
  await db.collection(`${base}/dailyLogs`).add({
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
    createdAt: new Date().toISOString(),
  });

  const recent = [
    d.taskId,
    ...((session.recentTaskIds || []).filter((t: string) => t !== d.taskId)),
  ].slice(0, 3);

  await setSession(chatId, { recentTaskIds: recent });
  await clearStep(chatId);

  let summary = `✅ <b>Logged</b>\n\n${d.taskName} — ${d.progressPercent}%`;
  if ((d.materials || []).length) summary += `\n📦 ${d.materials.length} material(s)`;
  if ((d.labour || []).length) summary += `\n👷 ${d.labour.length} labour`;

  await tg.editMessage(chatId, messageId, summary);
}
