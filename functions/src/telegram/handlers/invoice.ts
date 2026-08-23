import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { db } from "../../db";
import { readAndMatchInvoice } from "../../ai/invoiceReader";
import { tt, normalizeLang } from "../i18n";

const projPath = (orgId: any, projectId: any) =>
  orgId ? `organizations/${orgId}/projects/${projectId}` : `projects/${projectId}`;

const inr = (n: number) => `₹${(Number(n) || 0).toLocaleString("en-IN")}`;

// A photo sent outside the /log flow is treated as a vendor GST invoice: the
// bot reads it, matches the PO, and saves a PENDING draft bill for the office
// to review and post in the app. It never posts to the ledger from Telegram —
// the money transaction stays in one place (the web app).
export async function handleInvoicePhoto(
  tg: any,
  chatId: number,
  session: any,
  photoSizes: any[],
  key: string,
) {
  const lang = normalizeLang(session?.lang);
  if (!session.activeProjectId) {
    await tg.sendMessage(chatId, tt(lang, "invSetProjectFirst"));
    return;
  }

  await tg.sendMessage(chatId, tt(lang, "invReading"));

  const base = projPath(session.orgId, session.activeProjectId);

  // Download the largest rendition from Telegram.
  const largest = photoSizes[photoSizes.length - 1];
  const filePath = await tg.getFile(largest.file_id);
  if (!filePath) {
    await tg.sendMessage(chatId, tt(lang, "cantFetchPhoto"));
    return;
  }
  const dl = await fetch(`https://api.telegram.org/file/bot${tg.botToken}/${filePath}`);
  if (!dl.ok) {
    await tg.sendMessage(chatId, tt(lang, "cantDownloadPhoto"));
    return;
  }
  const buffer = Buffer.from(await dl.arrayBuffer());
  const base64 = buffer.toString("base64");

  let result: any;
  try {
    result = await readAndMatchInvoice(base64, "image/jpeg", session.orgId, session.activeProjectId, key);
  } catch (e: any) {
    console.error("Invoice read failed:", e);
    // Surface the friendly quota message; otherwise a generic read failure.
    const msg = e?.code === "resource-exhausted" && e?.message
      ? `🚫 ${e.message}`
      : tt(lang, "invReadFailed");
    await tg.sendMessage(chatId, msg);
    return;
  }

  const billId = db.collection(`${base}/vendor_bills`).doc().id;

  // Store the image for audit.
  let sourceFileUrl: string | undefined;
  try {
    const bucket = admin.storage().bucket();
    const token = crypto.randomUUID();
    const storagePath = `${base}/vendor_bills/${billId}/invoice.jpg`;
    await bucket.file(storagePath).save(buffer, {
      metadata: { contentType: "image/jpeg", metadata: { firebaseStorageDownloadTokens: token } },
    });
    sourceFileUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
  } catch (e) {
    console.error("Invoice image upload failed:", e);
  }

  const bill = result.bill;
  await db.doc(`${base}/vendor_bills/${billId}`).set({
    ...bill,
    id: billId,
    projectId: session.activeProjectId,
    status: "pending_review",
    flags: result.flags || [],
    sourceFileUrl,
    extractionConfidence: result.confidence,
    createdVia: "telegram",
    createdByUid: session.userId || "telegram-bot",
    createdByName: session.email || "Telegram",
    createdAt: new Date().toISOString(),
  });

  let msg =
    `${tt(lang, "invSavedHeader")}\n\n` +
    `${tt(lang, "invVendor")}: <b>${bill.vendorName || "—"}</b>\n` +
    `${tt(lang, "invInvoice")}: ${bill.invoiceNumber || "—"}\n` +
    `${tt(lang, "invTotal")}: <b>${inr(bill.grandTotal)}</b>\n` +
    `${tt(lang, "invPO")}: ${bill.poNumber || tt(lang, "invNotMatched")}\n` +
    `${tt(lang, "invMatch")}: ${bill.matchStatus}`;
  if ((result.flags || []).length) {
    msg += `\n\n⚠️ ${result.flags.slice(0, 3).join("\n⚠️ ")}`;
  }
  msg += `\n\n${tt(lang, "invReviewPost")}`;
  await tg.sendMessage(chatId, msg);
}
