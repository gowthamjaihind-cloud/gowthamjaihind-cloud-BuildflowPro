import { db } from "../db";

/**
 * The last few reasons the bot's AI work failed, for the operator's
 * connection check. The engineer only ever sees "I couldn't read that"; this
 * is where the real reason goes, since nobody can read the server logs from a
 * phone. Kept short and capped: only the newest entries matter.
 */
export async function recordBotError(kind: string, err: any): Promise<void> {
  try {
    const reason = String(err?.diag || err?.message || err || "unknown").slice(0, 600);
    await db.collection("bot_errors").add({ at: Date.now(), kind, code: String(err?.code || ""), reason });
  } catch (e) {
    console.error("Could not record bot error:", e);
  }
}

export async function recentBotErrors(limit = 5): Promise<Array<{ at: number; kind: string; code: string; reason: string }>> {
  const snap = await db.collection("bot_errors").orderBy("at", "desc").limit(limit).get();
  return snap.docs.map((d) => d.data() as any);
}
