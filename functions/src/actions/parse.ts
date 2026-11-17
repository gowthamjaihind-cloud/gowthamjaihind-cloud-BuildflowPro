import { sanitizeCommand, type PoContext, type PoDraft } from "../command/po";

/**
 * One typed or spoken request, read into ONE prepared action. Shared by the
 * app's "Do it for me" and the Telegram/WhatsApp bot. The model chooses only
 * from this project's lists; everything is checked here. Nothing is written:
 * the caller shows a preview, and the action runs only on Confirm (run.ts),
 * after the permission check (permissions.ts). Pure, so it is unit-tested.
 */

export type Prepared =
  | { kind: "po"; draft: PoDraft; unmatched: string[]; missingVendor: boolean }
  | { kind: "payment"; amount: number; date: string; method: string; reference: string; description: string }
  | { kind: "vendor"; name: string; type: "Material" | "Labor" | "Both"; phone: string; gstin: string; contactPerson: string; address: string }
  | { kind: "material"; name: string; unit: string; rate: number; hsn: string; gstRate: number }
  | { kind: "log" } // a daily work report: handed to the daily-log reader (bot/aiLog.ts)
  | { kind: "question"; topic: "stock" | "progress" | "payments" | "orders" | "general"; materialIds: string[]; question: string }
  | { kind: "other"; reply: string };

export interface ParseResult { transcript: string; prepared: Prepared }

const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const money = (v: unknown) => {
  const n = Math.round(Number(v) * 100) / 100;
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const METHODS = ["Bank Transfer", "Cheque", "Cash", "UPI"];
const GST = [0, 0.25, 3, 5, 12, 18, 28];

export function buildActionPrompt(ctx: PoContext, text: string | null): string {
  const list = (rows: string[]) => (rows.length ? rows.join("\n") : "(none)");
  return `You turn a construction company's typed or spoken request into ONE action in their project management app.
The request may be in English, Tamil, Hindi, or a mix (written in any script, or spoken).
${text === null ? "The request is the attached audio. Write what was said, in its original language, as \"transcript\"." : `REQUEST: ${clip(text, 1500)}`}
Today is ${ctx.today}. Dates are day first in India ("5/12" is 5 December). Amounts are rupees; "1.5 lakh" = 150000, "2 crore" = 20000000, "50k" = 50000.

VENDORS (id | name):
${list(ctx.vendors.map((v) => `${v.id} | ${v.name}`))}

MATERIALS (id | name | unit | usual rate):
${list(ctx.materials.map((m) => `${m.id} | ${m.name} | ${m.unit} | ${m.rate || "?"}`))}

Choose "intent":
- "create_po": order/buy/raise a PO for materials. Fill "vendorId" (from VENDORS, by meaning and spelling; null if none), "items" [{"itemId" from MATERIALS, "qty" in its unit, "rate" only if a price per unit is said else null}], "expectedDeliveryDate" (YYYY-MM-DD, not before today, or null), "notes". Materials that match nothing go in "unmatched".
- "client_payment": money RECEIVED from the client/owner for this project. Fill "amount", "date" (YYYY-MM-DD, today if not said, never in the future), "method" (one of ${METHODS.join(", ")}), "reference" (cheque/UTR/transaction number or ""), "description".
- "add_vendor": add a new vendor/supplier/subcontractor. Fill "vendor": {"name","type" ("Material", "Labor" or "Both"),"phone","gstin","contactPerson","address"} ("" for anything not said).
- "add_material": add a new material to the project's inventory. Fill "material": {"name","unit" (bag, kg, MT, cft, cum, sqft, rmt, nos, litre, load),"rate" (or 0),"hsn" (or ""),"gstRate" (${GST.join(", ")}, or 0)}.
- "daily_log": a report of work done today on site (progress %, labour, materials used, equipment). Fill nothing else.
- "question": the user asks about this project's data. Fill "topic": "stock" (material quantities left), "progress" (schedule, % done, delays), "payments" (client payments, balance), "orders" (purchase orders and deliveries), or "general"; "materialIds" for any materials named; "question" restated briefly in English.
- "other": anything else. Put a one-sentence "reply" saying what you can do: purchase orders, client payments, new vendors and materials, daily logs, and questions about stock, progress, payments and orders.
Never invent an id.

Answer with JSON only:
{"intent":"...","transcript":"","vendorId":null,"items":[],"expectedDeliveryDate":null,"notes":"","unmatched":[],"amount":0,"date":null,"method":"","reference":"","description":"","vendor":{},"material":{},"topic":"","materialIds":[],"question":"","reply":""}`;
}

export function sanitizeAction(raw: any, ctx: PoContext, typedText: string | null): ParseResult {
  const transcript = typedText ?? clip(raw?.transcript, 1500);
  const out = (prepared: Prepared): ParseResult => ({ transcript, prepared });
  const intent = String(raw?.intent || "");

  if (intent === "create_po") {
    const r = sanitizeCommand({ ...raw, intent: "create_po" }, ctx, typedText);
    if (r.kind === "po") return out({ kind: "po", draft: r.draft, unmatched: r.unmatched, missingVendor: r.missingVendor });
  }
  if (intent === "client_payment") {
    const amount = money(raw.amount);
    const d = String(raw.date || "");
    const date = /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= ctx.today ? d : ctx.today;
    if (amount) {
      return out({
        kind: "payment",
        amount,
        date,
        method: METHODS.includes(raw.method) ? raw.method : "Bank Transfer",
        reference: clip(raw.reference, 60),
        description: clip(raw.description, 200) || "Client payment",
      });
    }
    return out({ kind: "other", reply: "How much was received? For example: \"Received 2 lakh from the client by UPI today, ref 4471\"." });
  }
  if (intent === "add_vendor") {
    const v = raw.vendor || {};
    const name = clip(v.name, 80);
    const gstin = clip(v.gstin, 15).toUpperCase();
    if (name) {
      return out({
        kind: "vendor",
        name,
        type: ["Material", "Labor", "Both"].includes(v.type) ? v.type : "Material",
        phone: clip(v.phone, 20).replace(/[^\d+ ]/g, ""),
        gstin: /^[0-9]{2}[A-Z0-9]{13}$/.test(gstin) ? gstin : "",
        contactPerson: clip(v.contactPerson, 60),
        address: clip(v.address, 200),
      });
    }
  }
  if (intent === "add_material") {
    const m = raw.material || {};
    const name = clip(m.name, 80);
    if (name) {
      const hsn = clip(m.hsn, 8).replace(/\D/g, "");
      return out({
        kind: "material",
        name,
        unit: clip(m.unit, 12) || "nos",
        rate: money(m.rate),
        hsn: [4, 6, 8].includes(hsn.length) ? hsn : "",
        gstRate: GST.includes(Number(m.gstRate)) ? Number(m.gstRate) : 0,
      });
    }
  }
  if (intent === "daily_log") return out({ kind: "log" });
  if (intent === "question") {
    const topics = ["stock", "progress", "payments", "orders", "general"] as const;
    const ids = new Set(ctx.materials.map((m) => m.id));
    return out({
      kind: "question",
      topic: (topics as readonly string[]).includes(raw.topic) ? raw.topic : "general",
      materialIds: (Array.isArray(raw.materialIds) ? raw.materialIds : []).map(String).filter((x: string) => ids.has(x)).slice(0, 10),
      question: clip(raw.question, 300) || transcript.slice(0, 300),
    });
  }
  return out({
    kind: "other",
    reply: clip(raw?.reply, 300) || "I can prepare purchase orders, record client payments, add vendors and materials, log daily work, and answer questions about stock, progress, payments and orders. For example: \"Order 100 bags of cement from Vaigai Traders\".",
  });
}

/** Which permission each prepared action needs (permissions.ts). */
export function actionFor(p: Prepared): import("./permissions").Action | null {
  switch (p.kind) {
    case "po": return "po.create";
    case "payment": return "payment.create";
    case "vendor": return "vendor.create";
    case "material": return "material.create";
    case "log": return "log.create";
    case "question": return p.topic === "payments" || p.topic === "orders" ? "ask.money" : "ask.site";
    default: return null;
  }
}
