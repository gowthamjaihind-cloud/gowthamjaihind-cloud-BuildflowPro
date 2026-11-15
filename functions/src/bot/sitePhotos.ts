/**
 * Photos sent to the bot outside a log: site photos or a vendor bill?
 * Pure helpers, tested; the Telegram flow is in telegram/handlers/sitePhotos.ts.
 */

/** A caption that says the photo is a bill. Anything else is a site photo. */
export function captionSaysInvoice(caption: string): boolean {
  return /\b(invoice|bill|bills|receipt|challan|gst bill|vendor bill)\b/i.test(caption || "");
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
