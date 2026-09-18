import type { ChatId } from "../session";
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
  chatId: ChatId,
  session: any,
  photoRef: any,
  key: string,
) {
  const lang = normalizeLang(session?.lang);
  if (!session.activeProjectId) {
    await tg.sendMessage(chatId, tt(lang, "invSetProjectFirst"));
    return;
  }

  await tg.sendMessage(chatId, tt(lang, "invReading"));

  const base = projPath(session.orgId, session.activeProjectId);

  // Channel-neutral: TelegramApi resolves a file_id, WhatsAppApi a media id.
  const got = await tg.fetchPhotoBytes(photoRef);
  if (!got.ok) {
    await tg.sendMessage(chatId, tt(lang, got.reason === "fetch" ? "cantFetchPhoto" : "cantDownloadPhoto"));
    return;
  }
  const base64 = got.buffer.toString("base64");

  let result: any;
  try {
    // Trust the fetched type: Telegram photos are jpeg, but a WhatsApp
    // document is routinely a PDF, and Gemini needs the real mime type.
    result = await readAndMatchInvoice(base64, got.mimeType, session.orgId, session.activeProjectId, key);
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
    // The extension follows the real type. A WhatsApp document is often a
    // PDF, and storing one as .jpg leaves it unopenable for whoever later
    // has to check the bill against the goods receipt.
    const ext = got.mimeType === "application/pdf" ? "pdf" : "jpg";
    const storagePath = `${base}/vendor_bills/${billId}/invoice.${ext}`;
    await bucket.file(storagePath).save(got.buffer, {
      metadata: { contentType: got.mimeType, metadata: { firebaseStorageDownloadTokens: token } },
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
