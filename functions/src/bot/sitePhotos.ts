/**
 * Photos sent to the bot outside a log: site photos or a vendor bill?
 * Pure helpers, tested; the Telegram flow is in telegram/handlers/sitePhotos.ts.
 */

/** A caption that says the photo is a bill. Anything else is a site photo. */
export function captionSaysInvoice(caption: string): boolean {
  // File names count too ("Tax Invoice_VTSALE 26-27.pdf"): "_" and "." are
  // word characters to a regex, so they are turned into spaces first.
  return /\b(invoice|bill|bills|receipt|challan|gst bill|vendor bill)\b/i.test(String(caption || "").replace(/[_.]+/g, " "));
}

const words = (s: string) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9஀-௿ ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
const STOP = new Set(["the", "this", "that", "and", "for", "save", "add", "put", "photo", "photos", "pic", "pics", "task", "work", "today", "site", "these", "with", "into", "log"]);

/**
 * The task a caption names ("Save this in footing task" → Footing), or null
 * when none or more than one fits equally well.
 */
export function taskFromCaption<T extends { id: string; name: string }>(caption: string, tasks: T[]): T | null {
  const said = new Set(words(caption));
  if (!said.size) return null;
  let best: T | null = null;
  let bestScore = 0;
  let tie = false;
  for (const t of tasks) {
    const name = words(t.name);
    if (!name.length) continue;
    const hit = name.filter((w) => said.has(w) || [...said].some((s) => s.length >= 4 && (w.startsWith(s) || s.startsWith(w)))).length;
    if (!hit) continue;
    // Share of the task's name that the caption covers; a full match wins.
    const score = hit / name.length + hit * 0.01;
    if (score > bestScore) {
      best = t;
      bestScore = score;
      tie = false;
    } else if (score === bestScore) tie = true;
  }
  return tie ? null : best;
}

/** What a photo sent to the bot shows, as decided by the AI. */
export type PhotoKind = { kind: "site" | "bill" | "document"; category: string; title: string };

/** Document Vault categories (src/components/DocumentVault.tsx), for anything that is neither a site photo nor a bill. */
export const DOC_CATEGORIES = [
  "Structural Drawings",
  "Architectural Drawings",
  "Safety & Compliance",
  "Quality & Inspections",
  "Legal & Permits",
  "Reports",
  "Others",
];

export const PHOTO_KIND_PROMPT = `A site engineer on an Indian construction project sent this photo to the project's chat bot.
Decide what it is:
- "site": a photo of the site or the work itself (excavation, reinforcement, concrete, brickwork, workers, materials lying on site, machinery).
- "bill": a vendor bill, tax invoice, delivery challan, quotation or payment receipt (printed or handwritten) with items and amounts.
- "document": any other paper or screen: a drawing or plan, a letter, a permit or approval, a test report, a checklist, a measurement sheet.
For a document, choose "category" from: ${DOC_CATEGORIES.join(", ")}; and give "title", a short name for it (at most 6 words, English).
Answer with JSON only: {"kind":"site","category":"","title":""}`;

/** The model's answer, checked. Anything unreadable is a site photo, the case that asks before saving. */
export function parsePhotoKind(raw: any): PhotoKind {
  const kind = raw?.kind === "bill" || raw?.kind === "document" ? raw.kind : "site";
  const category = DOC_CATEGORIES.includes(raw?.category) ? raw.category : "Others";
  const title = String(raw?.title ?? "").replace(/[^\p{L}\p{N} .,&()\-/]/gu, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return { kind, category: kind === "document" ? category : "", title: kind === "document" ? title || "Document" : "" };
}
