/**
 * Does a typed bot message look like a request for the action engine
 * (actions/run.ts: a purchase order, a client payment, a new vendor or
 * material, or a question about the project's data) rather than a work report?
 *
 * Work reports keep their own reader (bot/aiLog.ts), which is quick and does
 * one AI call. Requests go to the engine, which also recognises work reports
 * and hands them back -- so a report that lands here by mistake costs one
 * extra AI call and still gets logged, while a request that missed this check
 * would be read as a log and fail. Hence the generous match.
 *
 * Pure, so it is tested without Firestore.
 */
const REQUEST_WORDS = new RegExp(
  "\\b(" + [
    "po", "p\\.o", "purchase", "order", "orders", "raise",
    "vendor", "vendors", "supplier", "suppliers",
    "client paid", "paid us", "payment", "payments", "received from", "advance", "cheque", "upi", "neft", "rtgs",
    "add material", "new material", "add item", "new item",
    "stock", "inventory", "left", "balance", "outstanding", "pending", "how much", "how many",
  ].join("|") + ")\\b",
  "i",
);

const QUESTION_START = /^(how|what|when|which|where|who|why|is|are|do|does|did|can|show|list|tell|give)\b/i;

export function looksLikeRequest(text: string): boolean {
  const t = String(text || "").trim();
  if (!t || t.startsWith("/") || t.length < 4) return false;
  if (t.endsWith("?") || QUESTION_START.test(t)) return true;
  return REQUEST_WORDS.test(t);
}
