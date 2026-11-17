import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../db";
import { geminiText } from "../ai/gemini";
import { chargeAiUsage, refundAiUsage } from "../ai/usage";
import { parseModelJson, sanitizeAiLogs } from "../bot/aiLog";
import { loadContext as loadLogContext, botLogRequest, BOT_LOG_MODELS } from "../telegram/handlers/aiLog";
import { buildClientView } from "../clientShare/build";
import type { PoContext } from "../command/po";
import { buildActionPrompt, sanitizeAction, actionFor, needsBetterRead, type ParseResult } from "./parse";
import { denial, type Who } from "./permissions";
import { previewLines, blockers, poTotals, type Pending } from "./preview";
import { stockFacts, orderFacts } from "./facts";
import { paymentDirection, methodOf, cleanPayment } from "./receipt";

/**
 * The engine behind "Do it for me" (app) and typed/voice requests in the bot.
 *
 *   prepare  -> reads the request (one AI use), checks the person may do it,
 *               answers a question straight away, or stores the action in
 *               pending_actions and returns a preview
 *   confirm  -> checks again (role, access, the project not read-only) and
 *               only then writes, in the same shape the app's forms write
 *   cancel   -> drops a pending action
 *
 * The Admin SDK bypasses firestore.rules, so permissions.ts is the guard
 * here; it mirrors the rules and is stricter for purchasing and money.
 */

// Requests are read by Flash-Lite first (about 4x cheaper, and quicker); a
// reading too weak to show (parse.ts needsBetterRead) is read again by full
// Flash. One AI use either way.
const LITE_MODELS = ["gemini-2.5-flash-lite", "gemini-flash-lite-latest"];
const FULL_MODELS = ["gemini-2.5-flash", "gemini-flash-latest"];
const PENDING_MS = 30 * 60_000;
const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const base = (orgId: string, projectId: string) => `organizations/${orgId}/projects/${projectId}`;
const noThinking = (model: string, b: any) =>
  model.startsWith("gemini-2.5") ? { ...b, generationConfig: { ...b.generationConfig, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } } } : b;

export type Channel = "app" | "telegram" | "whatsapp";

export async function loadWho(uid: string, orgId: string, projectId: string) {
  const [userSnap, orgSnap, projSnap] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`organizations/${orgId}`).get(),
    db.doc(base(orgId, projectId)).get(),
  ]);
  const user: any = userSnap.data() || {};
  const org: any = orgSnap.data() || {};
  const project: any = projSnap.data() || null;
  const memberRole = (org.members || {})[uid];
  const who: Who = {
    uid,
    role: String(user.role || memberRole || ""),
    isMember: !!memberRole,
    projectAccess: (user.projectAccess || {})[projectId],
    ownsProject: !!project && project.ownerId === uid,
    projectLocked: !!project?.billingLocked,
  };
  return { who, user, org, project };
}

async function poContext(orgId: string, projectId: string): Promise<PoContext & { inventory: any[] }> {
  const [suppliers, inventory] = await Promise.all([
    db.collection(`${base(orgId, projectId)}/suppliers`).limit(300).get(),
    db.collection(`${base(orgId, projectId)}/inventory`).limit(300).get(),
  ]);
  const inv = inventory.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  return {
    today: istToday(),
    vendors: suppliers.docs.map((d) => ({ id: d.id, name: String((d.data() as any).name || "").slice(0, 80) })).filter((v) => v.name),
    materials: inv.map((x) => ({ id: x.id, materialId: String(x.materialId || ""), name: String(x.name || "").slice(0, 80), unit: String(x.unit || ""), rate: Number(x.avgUnitCost || x.unitCost) || 0, hsn: String(x.hsn || ""), gstRate: Number(x.gstRate) || 0 })).filter((m) => m.name),
    inventory: inv,
  };
}

export type PrepareOutcome =
  | { type: "denied"; transcript: string; message: string }
  | { type: "answer"; transcript: string; message: string }
  | { type: "other"; transcript: string; message: string }
  | { type: "log"; transcript: string } // the bot sends these to its own daily-log flow
  | { type: "approvals"; transcript: string; pos: DraftPo[] } // Draft POs the person may approve
  | { type: "pending"; transcript: string; id: string; kind: Pending["kind"]; lines: string[]; blockers: string[]; pending: Pending };

export async function prepareAction(opts: {
  uid: string; orgId: string; projectId: string; channel: Channel; key: string;
  text?: string; audio?: { base64: string; mimeType: string }; logsInline?: boolean;
}): Promise<PrepareOutcome> {
  const { uid, orgId, projectId, key } = opts;
  const { who, project, org } = await loadWho(uid, orgId, projectId);
  if (!project) throw new HttpsError("not-found", "That project was not found.");
  const pre = denial("ask.site", who);
  if (pre) return { type: "denied", transcript: opts.text || "", message: pre };

  const ctx = await poContext(orgId, projectId);
  await chargeAiUsage(orgId, "command");
  let charged = true;
  const refund = async () => { if (charged) { charged = false; await refundAiUsage(orgId, "command"); } };
  try {
    const typed = opts.audio ? null : opts.text || "";
    const parts: any[] = [{ text: buildActionPrompt(ctx, typed) }];
    if (opts.audio) parts.push({ inlineData: { mimeType: opts.audio.mimeType, data: opts.audio.base64 } });
    const read = async (models: string[], budgetMs: number): Promise<ParseResult> => {
      const { text: out } = await geminiText(
        { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } },
        key, budgetMs, { perAttemptMs: 25_000, models, forModel: noThinking },
      );
      return sanitizeAction(parseModelJson(out), ctx, typed);
    };
    let reading: ParseResult | null = null;
    let why: string | null = null;
    try {
      reading = await read(LITE_MODELS, 35_000);
      why = needsBetterRead(reading, !!opts.audio);
    } catch (e) {
      why = "lite failed";
    }
    if (why) {
      // A weak or failed cheap reading: full Flash reads it again. If that
      // fails too, the cheap reading (if any) is still shown for checking.
      console.log("actionPrepare: reading again with Flash:", why);
      try {
        reading = await read(FULL_MODELS, 60_000);
      } catch (e) {
        if (!reading) throw e;
      }
    }
    const { transcript, prepared } = reading!;

    const action = actionFor(prepared);
    if (action) {
      const no = denial(action, who);
      if (no) { await refund(); return { type: "denied", transcript, message: no }; }
    }
    if (prepared.kind === "other") { await refund(); return { type: "other", transcript, message: prepared.reply }; }

    if (prepared.kind === "approve") {
      return { type: "approvals", transcript, pos: await listDraftPos(orgId, projectId, prepared.poNumber) };
    }
    if (prepared.kind === "question") {
      const message = await answerQuestion(prepared, { orgId, projectId, project, ctx, key });
      return { type: "answer", transcript, message };
    }

    if (prepared.kind === "log") {
      // The bot has its own, richer daily-log flow (photos, menus): it takes
      // the words from here. The app gets a preview to confirm.
      await refund();
      if (!opts.logsInline) return { type: "log", transcript };
      const lctx = { ...(await loadLogContext(base(orgId, projectId))), today: istToday() };
      await chargeAiUsage(orgId, "botLog");
      let logs;
      try {
        const req = botLogRequest(transcript, lctx);
        const { text } = await geminiText(req.body, key, 60_000, { perAttemptMs: 25_000, forModel: req.forModel, models: BOT_LOG_MODELS });
        logs = sanitizeAiLogs(parseModelJson(text), lctx);
      } catch (e) {
        await refundAiUsage(orgId, "botLog");
        throw e;
      }
      if (logs.kind !== "logs") {
        await refundAiUsage(orgId, "botLog");
        return { type: "other", transcript, message: "I couldn't match that to a task in this project's schedule. Name the task as it appears in the WBS." };
      }
      return storePending({ uid, orgId, projectId, channel: opts.channel, transcript, pending: { kind: "logs", drafts: logs.drafts }, projectName: project.name, org });
    }

    return storePending({ uid, orgId, projectId, channel: opts.channel, transcript, pending: prepared as Pending, projectName: project.name, org });
  } catch (e) {
    await refund();
    if (e instanceof HttpsError) throw e;
    console.error("prepareAction failed", (e as any)?.diag || e);
    throw new HttpsError("unavailable", "Couldn't understand that just now. Please try again.");
  }
}

/**
 * A payment receipt read from a photo (ai/invoiceReader.ts says docType
 * "payment"): a payment to a vendor or from the client, depending on who paid
 * whom (receipt.ts), prepared like a typed one: role-checked, previewed, and
 * written only on Confirm. Blocked if its reference is already recorded.
 */
export async function prepareFromReceipt(opts: {
  uid: string; orgId: string; projectId: string; channel: Channel; payment: any; companyName: string; receiptUrl?: string;
}): Promise<PrepareOutcome> {
  const { uid, orgId, projectId } = opts;
  const { who, project, org } = await loadWho(uid, orgId, projectId);
  if (!project) throw new HttpsError("not-found", "That project was not found.");
  const p = cleanPayment(opts.payment, istToday());
  const transcript = "Payment receipt";
  if (!p) return { type: "other", transcript, message: "This looks like a payment receipt, but I couldn't read the amount. Type it instead, e.g. \"Paid ABC Traders 1.45 lakh by UPI on 4/11, ref 4471\"." };
  const b = base(orgId, projectId);
  const vendors = (await db.collection(`${b}/suppliers`).limit(300).get()).docs.map((d) => ({ id: d.id, name: String((d.data() as any).name || "") }));
  const dir = paymentDirection(p, opts.companyName || String(org?.companyName || ""), vendors);
  const amt = `₹${p.amount.toLocaleString("en-IN")}`;
  const ref = p.reference ? `, ref ${p.reference}` : "";
  if (dir.kind === "vendorUnknown") {
    return { type: "other", transcript, message: `Payment receipt: ${amt} paid to ${p.payeeName || "someone"} on ${p.date}${ref}. ${p.payeeName || "They"} is not one of this project's vendors. Add them as a vendor (or say which vendor it was, e.g. "Paid ABC Traders ${amt}"), then send it again.` };
  }
  if (dir.kind === "unknown") {
    return { type: "other", transcript, message: `Payment receipt: ${amt} from ${p.payerName || "?"} to ${p.payeeName || "?"} on ${p.date}${ref}. I couldn't tell whether this is a payment to a vendor or from the client. Type it instead: "Paid <vendor> ${amt}" or "Client paid ${amt}".` };
  }
  const method = methodOf(p.mode);
  const prepared: Pending = dir.kind === "vendor"
    ? { kind: "vendorPayment", vendorId: dir.vendorId, vendorName: dir.vendorName, amount: p.amount, date: p.date, method, reference: p.reference, description: "Payment to Vendor (from receipt)", ...(opts.receiptUrl ? { receiptUrl: opts.receiptUrl } : {}) }
    : { kind: "payment", amount: p.amount, date: p.date, method, reference: p.reference, description: `Client payment${p.payerName ? ` from ${p.payerName}` : ""} (from receipt)`, ...(opts.receiptUrl ? { receiptUrl: opts.receiptUrl } : {}) };
  const no = denial(prepared.kind === "vendorPayment" ? "vendorpay.create" : "payment.create", who);
  if (no) return { type: "denied", transcript, message: no };
  // The same transfer sent twice: its UTR / reference is already recorded.
  if (p.reference) {
    const coll = prepared.kind === "vendorPayment" ? "ledger" : "client_payments";
    const dupe = await db.collection(`${b}/${coll}`).where("referenceNumber", "==", p.reference).limit(1).get();
    if (!dupe.empty) prepared.duplicate = `A payment with reference ${p.reference} is already recorded (${String((dupe.docs[0].data() as any).date || "").slice(0, 10)}, ₹${Number((dupe.docs[0].data() as any).amount || 0).toLocaleString("en-IN")}). Nothing new to record.`;
  }
  return storePending({ uid, orgId, projectId, channel: opts.channel, transcript, pending: prepared, projectName: project.name, org });
}

async function storePending(o: { uid: string; orgId: string; projectId: string; channel: Channel; transcript: string; pending: Pending; projectName: string; org: any }): Promise<PrepareOutcome> {
  if (o.pending.kind === "vendorPayment") {
    o.pending.balanceBefore = Number((await db.doc(`${base(o.orgId, o.projectId)}/suppliers/${o.pending.vendorId}`).get()).data()?.outstandingBalance) || 0;
  }
  let vendorGstin = "";
  if (o.pending.kind === "po" && o.pending.draft.vendorId) {
    vendorGstin = String((await db.doc(`${base(o.orgId, o.projectId)}/suppliers/${o.pending.draft.vendorId}`).get()).data()?.gstin || "");
  }
  const ref = db.collection("pending_actions").doc();
  await ref.set({
    uid: o.uid, orgId: o.orgId, projectId: o.projectId, channel: o.channel, transcript: o.transcript,
    pending: JSON.parse(JSON.stringify(o.pending)), status: "pending",
    createdAt: Date.now(), expireAt: new Date(Date.now() + PENDING_MS),
  });
  return {
    type: "pending", transcript: o.transcript, id: ref.id, kind: o.pending.kind, pending: o.pending,
    lines: previewLines(o.pending, String(o.projectName || "this project"), { buyerGstin: o.org?.gstin, vendorGstin }),
    blockers: blockers(o.pending),
  };
}

async function answerQuestion(q: Extract<import("./parse").Prepared, { kind: "question" }>, c: { orgId: string; projectId: string; project: any; ctx: PoContext & { inventory: any[] }; key: string }): Promise<string> {
  const b = base(c.orgId, c.projectId);
  const facts: Record<string, unknown> = { project: c.project?.name, today: c.ctx.today };
  const want = (t: string) => q.topic === t || q.topic === "general";
  if (want("stock")) facts.stock = stockFacts(c.ctx.inventory, q.materialIds);
  if (want("progress") || want("payments")) {
    const [tasks, estimates, payments] = await Promise.all([
      want("progress") ? db.collection(`${b}/tasks`).get() : null,
      q.topic === "payments" ? db.collection(`${b}/estimates`).get() : null,
      q.topic === "payments" ? db.collection(`${b}/client_payments`).get() : null,
    ]);
    const view = buildClientView({
      sections: { progress: want("progress"), photos: false, updates: false, payments: q.topic === "payments" },
      showHeadcount: false, today: c.ctx.today, company: {}, project: c.project,
      tasks: tasks ? tasks.docs.map((d) => ({ id: d.id, ...d.data() })) : [], logs: [],
      estimates: estimates ? estimates.docs.map((d) => d.data()) : [], payments: payments ? payments.docs.map((d) => d.data()) : [],
    });
    if (view.progress) facts.progress = { ...view.progress, phases: view.progress.phases.slice(0, 15) };
    if (view.payments) facts.payments = { ...view.payments, history: view.payments.history.slice(0, 10) };
  }
  if (q.topic === "orders") facts.openPurchaseOrders = orderFacts((await db.collection(`${b}/purchase_orders`).limit(200).get()).docs.map((d) => d.data()));

  const prompt = `Answer a site team's question about their construction project using ONLY these facts. Be brief and exact: numbers with units, rupees as ₹ with Indian grouping. If the facts don't contain the answer, say so and where in the app to look. Answer in the language of the question. Plain text, at most 8 short lines.

QUESTION: ${q.question}

FACTS (JSON): ${JSON.stringify(facts).slice(0, 12000)}`;
  const { text } = await geminiText(
    { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 800 } },
    c.key, 40_000, { perAttemptMs: 20_000, models: ["gemini-2.5-flash-lite", "gemini-flash-lite-latest", "gemini-2.5-flash"], forModel: noThinking },
  );
  return String(text || "").trim().slice(0, 2000) || "I couldn't find that in this project's data.";
}

/** Run a pending action after Confirm. Checks everything again. */
export async function confirmAction(id: string, uid: string): Promise<{ message: string; poId?: string; poNumber?: string; projectId: string; orgId: string }> {
  const ref = db.doc(`pending_actions/${id}`);
  const snap = await ref.get();
  const p: any = snap.data();
  if (!snap.exists || p.uid !== uid) throw new HttpsError("not-found", "That request was not found. Please ask again.");
  if (p.status !== "pending") throw new HttpsError("failed-precondition", p.status === "done" ? "That was already done." : "That request was cancelled.");
  if (Date.now() - Number(p.createdAt) > PENDING_MS) throw new HttpsError("deadline-exceeded", "That request is more than 30 minutes old. Please ask again.");
  const pending = p.pending as Pending;
  const { who, user, org, project } = await loadWho(uid, p.orgId, p.projectId);
  if (!project) throw new HttpsError("not-found", "That project no longer exists.");
  const action = pending.kind === "logs" ? "log.create" : pending.kind === "po" ? "po.create" : pending.kind === "payment" ? "payment.create" : pending.kind === "vendorPayment" ? "vendorpay.create" : pending.kind === "vendor" ? "vendor.create" : "material.create";
  const no = denial(action, who);
  if (no) throw new HttpsError("permission-denied", no);
  const stop = blockers(pending);
  if (stop.length) throw new HttpsError("failed-precondition", stop.join(" "));

  // Claim it first, so a double tap cannot run it twice.
  const claimed = await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() as any;
    if (cur?.status !== "pending") return false;
    tx.update(ref, { status: "running", confirmedAt: Date.now() });
    return true;
  });
  if (!claimed) throw new HttpsError("failed-precondition", "That was already done.");

  const b = base(p.orgId, p.projectId);
  const by = { createdByUid: uid, createdByName: String(user.displayName || user.email || "Unknown"), createdVia: p.channel || "app" };
  try {
    let result: { message: string; poId?: string; poNumber?: string };
    if (pending.kind === "po") result = await writePo(b, p.projectId, pending, org, by);
    else if (pending.kind === "payment") {
      const r = db.collection(`${b}/client_payments`).doc();
      await r.set({ id: r.id, projectId: p.projectId, date: pending.date, amount: pending.amount, referenceNumber: pending.reference, description: pending.description, paymentMethod: pending.method, ...(pending.receiptUrl ? { receiptUrl: pending.receiptUrl } : {}), ...by, createdAt: new Date().toISOString() });
      result = { message: `Recorded the client payment of ₹${pending.amount.toLocaleString("en-IN")}.` };
    } else if (pending.kind === "vendorPayment") {
      // As the app's "Record payment" (ProcurementView.tsx): a DEBIT in the
      // vendor ledger and the amount off what is owed to them.
      const vendorRef = db.doc(`${b}/suppliers/${pending.vendorId}`);
      await db.runTransaction(async (tx) => {
        const v = await tx.get(vendorRef);
        if (!v.exists) throw new HttpsError("not-found", `${pending.vendorName} is no longer a vendor on this project.`);
        tx.set(db.collection(`${b}/ledger`).doc(), {
          projectId: p.projectId, vendorId: pending.vendorId, date: new Date(`${pending.date}T00:00:00Z`).toISOString(), type: "DEBIT",
          amount: pending.amount, referenceType: "PAYMENT",
          description: [pending.description || "Payment to Vendor", pending.method, pending.reference ? `Ref ${pending.reference}` : ""].filter(Boolean).join(" · "),
          paymentMethod: pending.method, referenceNumber: pending.reference, ...(pending.receiptUrl ? { receiptUrl: pending.receiptUrl } : {}), ...by, createdAt: new Date().toISOString(),
        });
        tx.update(vendorRef, { outstandingBalance: (Number(v.data()?.outstandingBalance) || 0) - pending.amount });
      });
      result = { message: `Recorded the payment of ₹${pending.amount.toLocaleString("en-IN")} to ${pending.vendorName}.` };
    } else if (pending.kind === "vendor") {
      const dupe = await db.collection(`${b}/suppliers`).where("name", "==", pending.name).limit(1).get();
      if (!dupe.empty) throw new HttpsError("already-exists", `${pending.name} is already a vendor on this project.`);
      await db.collection(`${b}/suppliers`).add({ name: pending.name, type: pending.type, contactPerson: pending.contactPerson, email: "", phone: pending.phone, address: pending.address, gstin: pending.gstin, projectId: p.projectId, outstandingBalance: 0, ...by });
      result = { message: `Added ${pending.name} to this project's vendors.` };
    } else if (pending.kind === "material") {
      const dupe = await db.collection(`${b}/inventory`).where("name", "==", pending.name).limit(1).get();
      if (!dupe.empty) throw new HttpsError("already-exists", `${pending.name} is already in this project's inventory.`);
      await db.collection(`${b}/inventory`).add({ projectId: p.projectId, materialId: "", name: pending.name, category: "Material", code: "", hsn: pending.hsn, gstRate: pending.gstRate, quantity: 0, openingQty: 0, unit: pending.unit, unitCost: pending.rate, minThreshold: 0, ...by });
      result = { message: `Added ${pending.name} to this project's inventory.` };
    } else {
      // Daily logs, in the shape the bot's Save writes (telegram/handlers/log.ts).
      const batch = db.batch();
      for (const d of pending.drafts) {
        const r = db.collection(`${b}/dailyLogs`).doc();
        batch.set(r, {
          taskId: d.taskId, projectId: p.projectId, workDate: d.workDate || istToday(), progressPercent: d.progressPercent,
          markComplete: d.progressPercent === 100, materials: d.materials, labour: d.labour, equipment: d.equipment,
          note: d.note || "", photoUrls: [], entryMethod: "ai-text", ...by, createdAt: new Date().toISOString(),
        });
      }
      await batch.commit();
      result = { message: `Saved ${pending.drafts.length} daily log${pending.drafts.length > 1 ? "s" : ""}.` };
    }
    await ref.update({ status: "done", doneAt: Date.now(), ...(result.poId ? { poId: result.poId } : {}) });
    return { ...result, projectId: p.projectId, orgId: p.orgId };
  } catch (e) {
    await ref.update({ status: "pending" }).catch(() => {});
    throw e instanceof HttpsError ? e : new HttpsError("internal", "That could not be saved. Please try again.");
  }
}

async function writePo(b: string, projectId: string, p: Extract<Pending, { kind: "po" }>, org: any, by: Record<string, string>) {
  const vendorSnap = await db.doc(`${b}/suppliers/${p.draft.vendorId}`).get();
  if (!vendorSnap.exists) throw new HttpsError("not-found", "That vendor is no longer on this project.");
  const vendor: any = vendorSnap.data();
  const t = poTotals(p, org?.gstin, vendor.gstin);
  const lineItems = p.draft.items.map((i, k) => ({
    itemId: i.itemId, materialId: i.materialId || "", name: i.name, orderedQty: i.orderedQty, unit: i.unit, rate: i.rate,
    amount: i.orderedQty * i.rate, receivedQty: 0, gstRate: t.lines[k].gstRate, cgst: t.lines[k].cgst, sgst: t.lines[k].sgst, igst: t.lines[k].igst, lineTotal: t.lines[k].total,
    ...(String(i.hsn || "").trim() ? { hsn: String(i.hsn).trim() } : {}),
  }));
  const orderDate = istToday();
  const counterRef = db.doc(`${b}/system/poCounter`);
  const poRef = db.collection(`${b}/purchase_orders`).doc();
  let poNumber = "";
  await db.runTransaction(async (tx) => {
    const n = (Number((await tx.get(counterRef)).data()?.count) || 0) + 1;
    poNumber = `PO-${orderDate.slice(0, 4)}-${String(n).padStart(4, "0")}`;
    tx.set(poRef, {
      id: poRef.id, poNumber, projectId, vendorId: p.draft.vendorId, vendorName: vendor.name, status: "Draft", orderDate,
      expectedDeliveryDate: p.draft.expectedDeliveryDate || null, lineItems, charges: { loading: 0, transport: 0, other: 0 },
      totalAmount: t.grandTotal, taxMode: t.hasGst ? "gst-itemized" : null, vendorGSTIN: vendor.gstin || null, buyerGSTIN: org?.gstin || null,
      interState: t.interState, chargesGstRate: 0, subtotalTaxable: t.subtotalTaxable, totalCGST: t.totalCGST, totalSGST: t.totalSGST,
      totalIGST: t.totalIGST, totalTax: t.totalTax, notes: p.draft.notes || "", ...by, createdAt: new Date().toISOString(),
    });
    tx.set(counterRef, { count: n }, { merge: true });
    // HSN/GST the preview corrected or suggested (and the person confirmed):
    // saved to the material, so the next order has them.
    for (const i of p.draft.items) {
      if (i.taxSource && i.hsn) tx.update(db.doc(`${b}/inventory/${i.itemId}`), { hsn: i.hsn, gstRate: i.gstRate });
    }
  });
  return { message: `Created ${poNumber} for ${vendor.name}, total ₹${t.grandTotal.toLocaleString("en-IN")}, as a Draft.`, poId: poRef.id, poNumber };
}

export interface DraftPo { id: string; poNumber: string; vendorName: string; total: number; orderDate: string; createdByName: string }

/** Draft POs in a project, newest first; `poNumber` narrows it ("12" matches PO-2026-0012). */
export async function listDraftPos(orgId: string, projectId: string, poNumber = ""): Promise<DraftPo[]> {
  const snap = await db.collection(`${base(orgId, projectId)}/purchase_orders`).where("status", "==", "Draft").limit(50).get();
  const want = poNumber.replace(/\D/g, "").replace(/^0+/, "");
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((p) => !want || String(p.poNumber || "").replace(/\D/g, "").replace(/^0+/, "").endsWith(want))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 8)
    .map((p) => ({ id: p.id, poNumber: String(p.poNumber || ""), vendorName: String(p.vendorName || ""), total: Number(p.totalAmount) || 0, orderDate: String(p.orderDate || ""), createdByName: String(p.createdByName || "") }));
}

/** null when this person may do `action` in the project, else why not. */
export async function whyNot(uid: string, orgId: string, projectId: string, action: import("./permissions").Action): Promise<string | null> {
  const { who, project } = await loadWho(uid, orgId, projectId);
  if (!project) return "That project was not found.";
  return denial(action, who);
}

/** Approve a Draft PO, exactly as the app's "Approve Order" does. */
export async function approvePo(uid: string, orgId: string, projectId: string, poId: string): Promise<{ poNumber: string; vendorName: string; total: number }> {
  const { who, user, project } = await loadWho(uid, orgId, projectId);
  if (!project) throw new HttpsError("not-found", "That project was not found.");
  const no = denial("po.approve", who);
  if (no) throw new HttpsError("permission-denied", no);
  const ref = db.doc(`${base(orgId, projectId)}/purchase_orders/${poId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That purchase order no longer exists.");
    const po: any = snap.data();
    if (po.status !== "Draft") throw new HttpsError("failed-precondition", `${po.poNumber} is already ${String(po.status).toLowerCase()}.`);
    tx.update(ref, {
      status: "Approved", approvedByUid: uid, approvedByName: String(user.displayName || user.email || "Unknown"),
      approvedAt: new Date().toISOString(),
    });
    return { poNumber: String(po.poNumber || ""), vendorName: String(po.vendorName || ""), total: Number(po.totalAmount) || 0 };
  });
}

export async function cancelAction(id: string, uid: string) {
  const ref = db.doc(`pending_actions/${id}`);
  const p: any = (await ref.get()).data();
  if (!p || p.uid !== uid) return;
  if (p.status === "pending") await ref.update({ status: "cancelled" });
}
