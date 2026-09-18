import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// Imports the PURE module only. `session.ts` and `reminders.ts` both pull in
// `db`, which calls getFirestore() at module load and needs an initialised
// admin app -- importing either here is what made the first version of this
// file fail to collect at all.
import {
  channelOf,
  linkFields,
  WA_PREFIX,
  withinServiceWindow,
  SERVICE_WINDOW_MS,
} from "../bot/channel";
import { waSessionKey } from "./inbound";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("channelOf", () => {
  it("reads a WhatsApp key by its prefix and anything else as Telegram", () => {
    expect(channelOf(waSessionKey("919000000000"))).toBe("whatsapp");
    expect(channelOf("wa:919000000000")).toBe("whatsapp");
    expect(channelOf(123456789)).toBe("telegram");
    expect(channelOf("123456789")).toBe("telegram");
  });

  it("keeps the two key spaces from overlapping", () => {
    expect(waSessionKey("123456789")).not.toBe("123456789");
    expect(waSessionKey("1").startsWith(WA_PREFIX)).toBe(true);
  });
});

describe("linkFields", () => {
  it("points each channel at its own pair of user fields", () => {
    expect(linkFields("telegram")).toEqual({ id: "telegramChatId", at: "telegramLinkedAt" });
    expect(linkFields("whatsapp")).toEqual({ id: "whatsappId", at: "whatsappLinkedAt" });
  });

  it("never writes a WhatsApp id into the Telegram field", () => {
    // This was a real bug: redeemLinkCode wrote `telegramChatId` unconditionally,
    // so linking WhatsApp overwrote the user's Telegram link with "wa:9190...".
    // Their Telegram session then stopped validating and the 5 PM Telegram
    // reminder tried to message a WhatsApp id. Nothing threw; the bot went quiet.
    const waKey = waSessionKey("919000000000");
    expect(linkFields(channelOf(waKey)).id).toBe("whatsappId");
    expect(linkFields(channelOf(12345)).id).toBe("telegramChatId");
  });

  it("is what auth.ts actually uses, rather than a hardcoded field", () => {
    const auth = readFileSync(join(HERE, "../telegram/auth.ts"), "utf8");
    // The redemption and the session check must both go through linkFields.
    expect(auth).toMatch(/linkFields\(channelOf\(chatId\)\)/);
    expect(auth).not.toMatch(/telegramChatId: chatId/);
    expect(auth).not.toMatch(/u\.telegramChatId !== chatId/);
  });
});

describe("withinServiceWindow", () => {
  const now = 1_700_000_000_000;

  it("is open just inside 24 hours and closed just outside", () => {
    expect(withinServiceWindow({ lastSeenAt: now - SERVICE_WINDOW_MS + 1000 }, now)).toBe(true);
    expect(withinServiceWindow({ lastSeenAt: now - SERVICE_WINDOW_MS - 1000 }, now)).toBe(false);
  });

  it("treats an unknown last-seen as CLOSED", () => {
    // Fail towards the paid template. Guessing "open" sends free-form text that
    // Meta silently drops, and a reminder nobody receives is worse than a paid
    // one that arrives.
    expect(withinServiceWindow(null, now)).toBe(false);
    expect(withinServiceWindow({}, now)).toBe(false);
    expect(withinServiceWindow({ lastSeenAt: 0 }, now)).toBe(false);
  });
});

describe("scheduled parity with Telegram", () => {
  const tg = readFileSync(join(HERE, "../telegram/index.ts"), "utf8");
  const wa = readFileSync(join(HERE, "./reminders.ts"), "utf8");
  const schedules = (src: string) => [...src.matchAll(/schedule: "([^"]+)"/g)].map((m) => m[1]).sort();

  it("runs the nudges at the same times on both channels", () => {
    expect(schedules(wa)).toEqual(schedules(tg));
  });

  it("sends business-initiated messages only through a template", () => {
    // Outside the 24-hour window free-form text is dropped, so a cold nudge that
    // is not a template is a reminder that silently never arrives.
    expect(wa).toMatch(/sendTemplate\(/);
    expect(wa).toMatch(/withinServiceWindow\(session\)/);
  });
});
