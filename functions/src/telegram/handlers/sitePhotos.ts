import { db } from "../../db";
import { getSession, setSession, type ChatId } from "../session";
import { tt, normalizeLang } from "../i18n";
import { captionSaysInvoice, taskFromCaption } from "../../bot/sitePhotos";
import { uploadLogPhoto, showMenu } from "./log";

/**
 * Photos sent to the bot outside a log step.
 *
 * They used to be read as vendor invoices, every one of them: eight site
 * photos with the caption "Save this in footing task" came back as eight
 * "couldn't read that invoice". Now they are site photos unless the caption
 * says bill/invoice. The engineer picks the task (the caption's task is
 * offered first), and the photos are added to that task's log for the day,
 * or to a new log for it.
 *
 * Telegram sends an album as one update per photo, close together, with the
 * caption on one of them. They are collected in bot_photo_inbox/{chatId}
 * (in a transaction, since the updates arrive at once) and the question is
 * asked once per batch.
 */

const projPath = (orgId: any, projectId: any) => (orgId ? `organizations/${orgId}/projects/${projectId}` : `projects/${projectId}`);
const todayISO = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const BATCH_MS = 10 * 60_000; // a new batch after 10 minutes of quiet
const MAX_PHOTOS = 20;

type Inbox = { photos: { sizes: any }[]; caption: string; group: string; at: number; prompted: boolean; forDraft?: boolean };

/** Add one incoming photo to the chat's inbox. Returns the inbox and whether this photo opened a new batch. */
async function collect(chatId: ChatId, sizes: any, caption: string, group: string, forDraft: boolean): Promise<{ inbox: Inbox; first: boolean }> {
  const ref = db.doc(`bot_photo_inbox/${chatId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.data() as Inbox | undefined;
    const now = Date.now();
    // Same album, or another photo shortly after the first, joins the batch.
    const fresh = !cur || !cur.photos?.length || now - cur.at > BATCH_MS || (group && cur.group && cur.group !== group);
    const base: Inbox = fresh ? { photos: [], caption: "", group: group || "", at: now, prompted: false, forDraft } : cur!;
    const next: Inbox = {
      ...base,
      photos: [...base.photos, { sizes }].slice(0, MAX_PHOTOS),
      caption: base.caption || caption || "",
      group: base.group || group || "",
      at: now,
      prompted: true,
    };
    tx.set(ref, next);
    return { inbox: next, first: !base.prompted };
  });
}

async function takeInbox(chatId: ChatId): Promise<Inbox | null> {
  const ref = db.doc(`bot_photo_inbox/${chatId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    tx.delete(ref);
    return snap.data() as Inbox;
  });
}

async function leafTasks(base: string) {
  const snap = await db.collection(`${base}/tasks`).get();
  const parents = new Set(snap.docs.map((d) => String((d.data() as any).parentId || "")).filter(Boolean));
  return snap.docs
    .filter((d) => !parents.has(d.id))
    .map((d) => ({ id: d.id, name: String((d.data() as any).name || ""), progress: Number((d.data() as any).progress) || 0 }))
    .filter((t) => t.name);
}

/**
 * Webhook side: called for every photo that is not part of a log's "send the
 * photo now" step. Fast: no downloads, no AI.
 * Returns "invoice" when the caller should read it as a bill instead.
 */
export async function receivePhoto(tg: any, chatId: ChatId, session: any, msg: any): Promise<"invoice" | "handled"> {
  const lang = normalizeLang(session?.lang);
  const caption = String(msg.caption || "");
  if (captionSaysInvoice(caption)) return "invoice";
  if (!session.activeProjectId) {
    await tg.sendMessage(chatId, tt(lang, "noActiveProject"));
    return "handled";
  }
  const { inbox, first } = await collect(chatId, msg.photo, caption, String(msg.media_group_id || ""), false);
  if (!first) return "handled";

  // Asked once, on the first photo of the batch. The rest of an album lands
  // while the engineer reads the question, and all of it is used on the tap.
  const base = projPath(session.orgId, session.activeProjectId);
  const tasks = await leafTasks(base);
  const named = inbox.caption ? taskFromCaption(inbox.caption, tasks) : null;
  const rows: any[] = [];
  if (named) rows.push([{ text: tt(lang, "spBtnAddTo", { name: named.name }), callback_data: `sp:t:${named.id}` }]);
  for (const tid of (session.recentTaskIds || []).slice(0, 3)) {
    const t = tasks.find((x) => x.id === tid);
    if (t && t.id !== named?.id) rows.push([{ text: t.name, callback_data: `sp:t:${t.id}` }]);
  }
  rows.push([{ text: tt(lang, "spBtnOtherTask"), callback_data: "sp:br:0" }]);
  rows.push([{ text: tt(lang, "spBtnInvoice"), callback_data: "sp:inv" }]);
  rows.push([{ text: tt(lang, "btnCancel"), callback_data: "sp:x" }]);
  await tg.sendMessage(chatId, tt(lang, named ? "spAskNamed" : "spAsk", { name: named?.name || "" }), rows);
  return "handled";
}

/** Webhook side: an album sent while a log is waiting for "send the photo now". */
export async function receiveDraftAlbumPhoto(chatId: ChatId, msg: any): Promise<boolean> {
  const { first } = await collect(chatId, msg.photo, "", String(msg.media_group_id || ""), true);
  return first;
}

/** The task list for "Another task", 8 to a page. */
export async function browse(tg: any, chatId: ChatId, messageId: any, session: any, page: number) {
  const lang = normalizeLang(session?.lang);
  const tasks = (await leafTasks(projPath(session.orgId, session.activeProjectId)))
    .sort((a, b) => Number(a.progress >= 100) - Number(b.progress >= 100) || a.name.localeCompare(b.name));
  const PER = 8;
  const rows: any[] = tasks.slice(page * PER, page * PER + PER).map((t) => [{ text: t.name, callback_data: `sp:t:${t.id}` }]);
  const nav: any[] = [];
  if (page > 0) nav.push({ text: tt(lang, "btnPrev"), callback_data: `sp:br:${page - 1}` });
  if ((page + 1) * PER < tasks.length) nav.push({ text: tt(lang, "btnNext"), callback_data: `sp:br:${page + 1}` });
  if (nav.length) rows.push(nav);
  rows.push([{ text: tt(lang, "btnCancel"), callback_data: "sp:x" }]);
  await tg.editMessage(chatId, messageId, tt(lang, "pickTask"), rows);
}

export async function cancel(tg: any, chatId: ChatId, messageId: any, session: any) {
  await takeInbox(chatId);
  await tg.editMessage(chatId, messageId, tt(normalizeLang(session?.lang), "cancelled"));
}

/** The photos were a bill after all: hand each to the invoice reader. */
export async function asInvoices(chatId: ChatId): Promise<any[]> {
  const inbox = await takeInbox(chatId);
  return (inbox?.photos || []).map((p) => p.sizes);
}

/**
 * Queue side (uploads take a while): put the batch on the task's log for
 * today if there is one, otherwise start a new log for it with the photos
 * attached and the usual Save menu.
 */
export async function attachToTask(tg: any, chatId: ChatId, messageId: any, session: any, taskId: string) {
  const lang = normalizeLang(session?.lang);
  const inbox = await takeInbox(chatId);
  if (!inbox?.photos?.length) {
    await tg.editMessage(chatId, messageId, tt(lang, "spNothing"));
    return;
  }
  const base = projPath(session.orgId, session.activeProjectId);
  const taskSnap = await db.doc(`${base}/tasks/${taskId}`).get();
  if (!taskSnap.exists) {
    await tg.editMessage(chatId, messageId, tt(lang, "taskGone"));
    return;
  }
  const task: any = taskSnap.data();
  const today = todayISO();
  await tg.editMessage(chatId, messageId, tt(lang, "spSaving", { n: inbox.photos.length, name: task.name }));

  const todays = await db.collection(`${base}/dailyLogs`).where("taskId", "==", taskId).where("workDate", "==", today).get();
  const existing = todays.docs.sort((a, b) => String((b.data() as any).createdAt || "").localeCompare(String((a.data() as any).createdAt || "")))[0];
  const logId = existing ? existing.id : db.collection(`${base}/dailyLogs`).doc().id;
  const startIdx = existing ? ((existing.data() as any).photoUrls || []).length : 0;

  const urls: string[] = [];
  let failed = 0;
  for (let i = 0; i < inbox.photos.length; i++) {
    try {
      const up = await uploadLogPhoto(tg, base, logId, inbox.photos[i].sizes, startIdx + i);
      if (up.ok) urls.push((up as any).url);
      else failed++;
    } catch (e) {
      console.error("site photo upload failed", e);
      failed++;
    }
  }
  if (!urls.length) {
    await tg.sendMessage(chatId, tt(lang, "cantDownloadPhoto"));
    return;
  }
  const failNote = failed ? "\n" + tt(lang, "spSomeFailed", { n: failed }) : "";

  if (existing) {
    const { FieldValue } = await import("firebase-admin/firestore");
    await existing.ref.update({ photoUrls: FieldValue.arrayUnion(...urls) });
    await tg.sendMessage(chatId, tt(lang, "spAddedToLog", { n: urls.length, name: task.name }) + failNote);
    return;
  }
  // No log for this task today: a new one carrying the photos, progress kept
  // as it is, saved only when the engineer presses Save.
  const current = Number(task.progress) || 0;
  await setSession(chatId, {
    step: "log:menu",
    draft: {
      logId, taskId, taskName: task.name, workDate: today,
      currentProgress: current, progressPercent: current,
      materials: [], labour: [], equipment: [], photoUrls: urls,
    },
  });
  await tg.sendMessage(chatId, tt(lang, "spNewLog", { n: urls.length, name: task.name }) + failNote);
  await showMenu(tg, chatId, null, await getSession(chatId));
}

/** Queue side: an album sent during a log's photo step, added to the draft in one go. */
export async function attachAlbumToDraft(tg: any, chatId: ChatId) {
  // Let the rest of the album arrive before taking the batch.
  await new Promise((r) => setTimeout(r, 6000));
  const session = await getSession(chatId);
  const lang = normalizeLang(session?.lang);
  const inbox = await takeInbox(chatId);
  const d = session?.draft || {};
  if (!inbox?.photos?.length || !d.logId) return;
  const base = projPath(session.orgId, session.activeProjectId);
  const urls: string[] = [];
  for (let i = 0; i < inbox.photos.length; i++) {
    try {
      const up = await uploadLogPhoto(tg, base, d.logId, inbox.photos[i].sizes, (d.photoUrls || []).length + i);
      if (up.ok) urls.push((up as any).url);
    } catch (e) {
      console.error("draft album upload failed", e);
    }
  }
  if (!urls.length) {
    await tg.sendMessage(chatId, tt(lang, "cantDownloadPhoto"));
    return;
  }
  await setSession(chatId, { draft: { ...d, photoUrls: [...(d.photoUrls || []), ...urls] } });
  await showMenu(tg, chatId, null, await getSession(chatId));
}
