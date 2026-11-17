import { HttpsError } from "firebase-functions/v2/https";
import type { ChatId } from "../../bot/channel";
import { whyNot, approvePo } from "../../actions/run";
import { linkBillToPo, postBill, postablePos, type BillCheck } from "../../actions/postBill";
import { tt, normalizeLang } from "../i18n";

/**
 * After the bot reads a bill: post it against its purchase order from the
 * chat, recording the bill AND the goods receipt (actions/postBill.ts). The
 * person sees which items go against which PO line first, and taps Post.
 *
 *   bill:o:<billId>          post it
 *   bill:x:<billId>          leave it for review in the app
 *   bill:p:<billId>:<poId>   use this PO (re-links the items), then show again
 *   bill:a:<billId>:<poId>   approve this Draft PO (Owner/Admin), use it, show again
 *
 * Shared by Telegram and WhatsApp. Managers and site engineers only.
 */

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const errText = (e: any) => (e instanceof HttpsError ? e.message : "That could not be done just now. Please try again.");
const where = (s: any) => ({ uid: String(s?.userId || ""), org: String(s?.orgId || ""), proj: String(s?.activeProjectId || "") });

/** Called right after a bill is read and saved as pending. Silent for people who may not post. */
export async function offerPosting(api: any, chatId: ChatId, session: any, billId: string): Promise<void> {
  const w = where(session);
  if (!w.org || !w.proj || (await whyNot(w.uid, w.org, w.proj, "bill.post"))) return;
  await show(api, chatId, session, await linkBillToPo(w.uid, w.org, w.proj, billId));
}

async function show(api: any, chatId: ChatId, session: any, c: BillCheck) {
  const lang = normalizeLang(session?.lang);
  const w = where(session);
  const head = `📥 <b>${esc(c.invoiceNumber || "Bill")}</b> · ${esc(c.vendorName)} · ${inr(c.grandTotal)}`;
  const later = { text: tt(lang, "billBtnLater"), callback_data: `bill:x:${c.billId}` };

  if (c.poId && (c.poStatus === "Approved" || c.poStatus === "Partially Received") && c.linked.length && !c.over.length) {
    const text = [
      head, "", tt(lang, "billAgainst", { po: esc(c.poNumber) }),
      ...c.linked.map((l) => `• ${esc(l.name)}: ${l.qty} ${esc(l.unit)}${l.poLine && l.poLine !== l.name ? ` → ${esc(l.poLine)}` : ""}`),
      ...(c.notOnPo.length ? ["", tt(lang, "billNotOnPo", { items: esc(c.notOnPo.join(", ")) })] : []),
      "", tt(lang, "billPostHint"),
    ].join("\n");
    await api.sendMessage(chatId, text, [[{ text: tt(lang, "billBtnPost"), callback_data: `bill:o:${c.billId}` }], [later]]);
    return;
  }
  if (c.over.length) {
    await api.sendMessage(chatId, [head, "", ...c.over.map((o) => `⚠️ ${esc(o)}`), "", tt(lang, "billFixInApp")].join("\n"));
    return;
  }
  // No usable PO yet: offer the vendor's open POs, or approving its Draft.
  const { open, drafts } = await postablePos(w.org, w.proj, c.vendorId);
  const canApprove = !(await whyNot(w.uid, w.org, w.proj, "po.approve"));
  const rows: any[][] = [
    ...open.filter((p) => p.id !== c.poId).map((p) => [{ text: `${p.poNumber} · ${p.vendorName}`.slice(0, 60), callback_data: `bill:p:${c.billId}:${p.id}` }]),
    ...(canApprove ? drafts.map((p) => [{ text: tt(lang, "billBtnApproveUse", { po: p.poNumber }), callback_data: `bill:a:${c.billId}:${p.id}` }]) : []),
  ];
  const why = c.poId && c.poStatus === "Draft"
    ? tt(lang, canApprove ? "billPoDraft" : "billPoDraftAsk", { po: esc(c.poNumber) })
    : c.poId && !c.linked.length ? tt(lang, "billNoLines", { po: esc(c.poNumber) }) : tt(lang, "billNoPo");
  await api.sendMessage(chatId, [head, "", why, ...(rows.length ? ["", tt(lang, "billPickPo")] : [])].join("\n"), [...rows, [later]]);
}

export async function handleBillTap(api: any, chatId: ChatId, messageId: any, session: any, data: string): Promise<void> {
  const lang = normalizeLang(session?.lang);
  const w = where(session);
  const [, verb, billId, poId] = data.split(":");
  const say = (t: string) => (messageId != null ? api.editMessage(chatId, messageId, t) : api.sendMessage(chatId, t));
  if (!billId || !w.org || !w.proj) return void (await api.sendMessage(chatId, tt(lang, "noActiveProject")));
  try {
    if (verb === "x") return void (await say(tt(lang, "billLeft")));
    if (verb === "o") {
      const r = await postBill(w.uid, w.org, w.proj, billId);
      return void (await say(tt(lang, "billPosted", { grn: esc(r.grnNumber), po: esc(r.poNumber), total: inr(r.grandTotal) })));
    }
    if (verb === "a" && poId) {
      const a = await approvePo(w.uid, w.org, w.proj, poId);
      await say(tt(lang, "poaDone", { po: esc(a.poNumber), vendor: esc(a.vendorName), total: inr(a.total) }));
    } else if (verb === "p" && poId && messageId != null) {
      await api.editMessage(chatId, messageId, tt(lang, "billLinking"));
    }
    if ((verb === "a" || verb === "p") && poId) await show(api, chatId, session, await linkBillToPo(w.uid, w.org, w.proj, billId, poId));
  } catch (e: any) {
    await api.sendMessage(chatId, `⚠️ ${esc(errText(e))}`);
  }
}
