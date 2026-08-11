import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { db } from "../../db";
import { readAndMatchInvoice } from "../../ai/invoiceReader";

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
  if (!session.activeProjectId) {
    await tg.sendMessage(chatId, "Set your active project first with /projects, then resend the invoice photo.");
    return;
  }

  await tg.sendMessage(chatId, "📄 Reading the invoice…");

  const base = projPath(session.orgId, session.activeProjectId);

  // Download the largest rendition from Telegram.
  const largest = photoSizes[photoSizes.length - 1];
  const filePath = await tg.getFile(largest.file_id);
  if (!filePath) {
    await tg.sendMessage(chatId, "Couldn't fetch that photo. Try again.");
    return;
  }
  const dl = await fetch(`https://api.telegram.org/file/bot${tg.botToken}/${filePath}`);
  if (!dl.ok) {
    await tg.sendMessage(chatId, "Couldn't download that photo. Try again.");
    return;
  }
  const buffer = Buffer.from(await dl.arrayBuffer());
  const base64 = buffer.toString("base64");

  let result: any;
  try {
    result = await readAndMatchInvoice(base64, "image/jpeg", session.orgId, session.activeProjectId, key);
  } catch (e) {
    console.error("Invoice read failed:", e);
    await tg.sendMessage(chatId, "I couldn't read that invoice. Try a clearer, straight-on photo — or add it in the app.");
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
    `📄 <b>Invoice read & saved as a draft</b>\n\n` +
    `Vendor: <b>${bill.vendorName || "—"}</b>\n` +
    `Invoice: ${bill.invoiceNumber || "—"}\n` +
    `Total (incl. GST): <b>${inr(bill.grandTotal)}</b>\n` +
    `PO: ${bill.poNumber || "— not matched —"}\n` +
    `Match: ${bill.matchStatus}`;
  if ((result.flags || []).length) {
    msg += `\n\n⚠️ ${result.flags.slice(0, 3).join("\n⚠️ ")}`;
  }
  msg += `\n\nReview &amp; post it in the app → <b>Procurement → Bills</b>.`;
  await tg.sendMessage(chatId, msg);
}
