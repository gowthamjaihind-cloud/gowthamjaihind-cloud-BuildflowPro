import { db } from "../../db";
import { getSession, setSession, type ChatId } from "../session";
import { tt, normalizeLang } from "../i18n";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { captionSaysInvoice, taskFromCaption, parsePhotoKind, PHOTO_KIND_PROMPT, type PhotoKind } from "../../bot/sitePhotos";
import { parseModelJson } from "../../bot/aiLog";
import { geminiText } from "../../ai/gemini";
import { recordBotError } from "../botErrors";
import { uploadLogPhoto, showMenu } from "./log";
import { BOT_LOG_MODELS } from "./aiLog";
import { handleInvoicePhoto } from "./invoice";

/**
 * Photos sent to the bot outside a log step.
 *
 * They used to be read as vendor invoices, every one of them: eight site
 * photos with the caption "Save this in footing task" came back as eight
 * "couldn't read that invoice". Now each batch is sorted first:
 * - a caption that says bill/invoice: read as bills;
 * - a caption that names a task: site photos for that task;
 * - otherwise the AI looks at each photo: a site photo, a bill (read by the
 *   invoice reader), or another document (a drawing, permit, report...),
 *   which is filed in the project's Documents.
 * For site photos the engineer picks the task (the caption's task first),
 * and they go on that task's log for the day, or a new log for it.
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
export async function receivePhoto(tg: any, chatId: ChatId, session: any, msg: any): Promise<"invoice" | "classify" | "handled"> {
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
  // meanwhile, and all of it is used.
  const tasks = await leafTasks(projPath(session.orgId, session.activeProjectId));
  const named = inbox.caption ? taskFromCaption(inbox.caption, tasks) : null;
  if (named) {
    // "Save this in footing task": plainly site photos, no need to look.
    await askTask(tg, chatId, session, named, tasks);
    return "handled";
  }
  await tg.sendMessage(chatId, tt(lang, "spLooking"));
  return "classify";
}

async function askTask(tg: any, chatId: ChatId, session: any, named: { id: string; name: string } | null, tasksIn?: { id: string; name: string }[]) {
  const lang = normalizeLang(session?.lang);
  const tasks = tasksIn || (await leafTasks(projPath(session.orgId, session.activeProjectId)));
  const rows: any[] = [];
  if (named) rows.push([{ text: tt(lang, "spBtnAddTo", { name: named.name }), callback_data: `sp:t:${named.id}` }]);
  for (const tid of (session.recentTaskIds || []).slice(0, 3)) {
    const t = tasks.find((x) => x.id === tid);
    if (t && t.id !== named?.id) rows.push([{ text: t.name, callback_data: `sp:t:${t.id}` }]);
  }
  rows.push([{ text: tt(lang, "spBtnOtherTask"), callback_data: "sp:br:0" }]);
  rows.push([{ text: tt(lang, "spBtnInvoice"), callback_data: "sp:inv" }, { text: tt(lang, "spBtnDocument"), callback_data: "sp:doc" }]);
  rows.push([{ text: tt(lang, "btnCancel"), callback_data: "sp:x" }]);
  await tg.sendMessage(chatId, tt(lang, named ? "spAskNamed" : "spAsk", { name: named?.name || "" }), rows);
}

/** Ask the AI what one photo shows. A failure counts as a site photo, which asks before saving anything. */
async function classifyOne(api: any, sizes: any, key: string): Promise<PhotoKind & { buffer?: Buffer }> {
  const got = await api.fetchPhotoBytes(sizes);
  if (!got.ok) return { kind: "site", category: "", title: "" };
  try {
    const body = {
      contents: [{ role: "user", parts: [{ text: PHOTO_KIND_PROMPT }, { inlineData: { mimeType: got.mimeType || "image/jpeg", data: got.buffer.toString("base64") } }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    };
    const forModel = (model: string, b: any) =>
      model.startsWith("gemini-2.5") ? { ...b, generationConfig: { ...b.generationConfig, maxOutputTokens: 256, thinkingConfig: { thinkingBudget: 0 } } } : b;
    const { text } = await geminiText(body, key, 40_000, { perAttemptMs: 15_000, forModel, models: BOT_LOG_MODELS });
    return { ...parsePhotoKind(parseModelJson(text)), buffer: got.buffer };
  } catch (e) {
    await recordBotError("photoKind", e);
    return { kind: "site", category: "", title: "", buffer: got.buffer };
  }
}

/** Store a photo in the project's Documents, as the web app's Document Vault does. */
async function saveDocument(base: string, session: any, buffer: Buffer, category: string, title: string) {
  const storagePath = `${base}/documents/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.jpg`;
  const bucket = admin.storage().bucket();
  const token = crypto.randomUUID();
  await bucket.file(storagePath).save(buffer, { metadata: { contentType: "image/jpeg", metadata: { firebaseStorageDownloadTokens: token } } });
  await db.collection(`${base}/documents`).add({
    name: title,
    type: "Image",
    category,
    accessLevel: "Internal",
    tags: ["telegram"],
    url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`,
    storagePath,
    projectId: session.activeProjectId,
    uploadedBy: session.userId || "",
    uploadedAt: new Date().toISOString(),
    createdVia: "telegram",
  });
}

/**
 * Queue side: sort the batch. Bills go to the invoice reader, documents to
 * Documents, and site photos stay in the inbox for the task question.
 */
export async function classifyBatch(api: any, chatId: ChatId, key: string, waitMs = 5000) {
  // Let the rest of an album arrive first.
  if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
  const session = await getSession(chatId);
  const lang = normalizeLang(session?.lang);
  const ref = db.doc(`bot_photo_inbox/${chatId}`);
  const inbox = (await ref.get()).data() as Inbox | undefined;
  if (!inbox?.photos?.length) return;
  const base = projPath(session.orgId, session.activeProjectId);

  const kinds = await Promise.all(inbox.photos.map((p) => classifyOne(api, p.sizes, key)));
  const site = inbox.photos.filter((_, i) => kinds[i].kind === "site");
  const bills = inbox.photos.filter((_, i) => kinds[i].kind === "bill");
  const docs = kinds.filter((k) => k.kind === "document" && k.buffer);

  // Only the site photos wait for the task question.
  if (site.length) await ref.set({ ...inbox, photos: site });
  else await ref.delete();

  if (docs.length) {
    const saved: string[] = [];
    for (const d of docs) {
      try {
        await saveDocument(base, session, d.buffer!, d.category, d.title);
        saved.push(`• ${d.title} (${d.category})`);
      } catch (e) {
        await recordBotError("photoDoc", e);
      }
    }
    if (saved.length) await api.sendMessage(chatId, tt(lang, "spDocsSaved", { n: saved.length }) + "\n" + saved.join("\n"));
  }
  if (bills.length) {
    await api.sendMessage(chatId, tt(lang, "spBillsFound", { n: bills.length }));
    for (const b of bills) await handleInvoicePhoto(api, chatId, session, b.sizes, key);
  }
  if (site.length) await askTask(api, chatId, session, null);
}

/** "It's a document" on the task question: file the waiting photos in Documents as they are. */
export async function asDocuments(api: any, chatId: ChatId, messageId: any, session: any) {
  const lang = normalizeLang(session?.lang);
  const inbox = await takeInbox(chatId);
  if (!inbox?.photos?.length) {
    await api.editMessage(chatId, messageId, tt(lang, "spNothing"));
    return;
  }
  const base = projPath(session.orgId, session.activeProjectId);
  let n = 0;
  for (const p of inbox.photos) {
    const got = await api.fetchPhotoBytes(p.sizes);
    if (!got.ok) continue;
    await saveDocument(base, session, got.buffer, "Others", inbox.caption ? inbox.caption.slice(0, 60) : "Document from Telegram");
    n++;
  }
  await api.editMessage(chatId, messageId, tt(lang, "spDocsSaved", { n }));
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
