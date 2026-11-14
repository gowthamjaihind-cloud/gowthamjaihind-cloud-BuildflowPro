import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The webhook must answer Telegram within seconds. Waiting on the AI inside it
// made Telegram time out ("Read timeout expired"), re-send the message, and
// queue every later message behind it.
const src = readFileSync(join(__dirname, "index.ts"), "utf8");
const handleUpdate = src.slice(src.indexOf("async function handleUpdate"), src.indexOf("async function enqueueBotJob"));
const webhook = src.slice(src.indexOf("export const telegramWebhook"), src.indexOf("async function handleUpdate"));
const worker = src.slice(src.indexOf("export const onBotJobCreated"), src.indexOf("export const onUserUnlinked"));

describe("the Telegram webhook", () => {
  it("never waits on the AI itself: typed reports and invoice photos are queued", () => {
    expect(handleUpdate).not.toMatch(/aiLog\.handleFreeText\(/);
    expect(handleUpdate).not.toMatch(/invoice\.handleInvoicePhoto\(/);
    expect(handleUpdate).toMatch(/enqueueBotJob\(\{ kind: "aiText"/);
    expect(handleUpdate).toMatch(/enqueueBotJob\(\{ kind: "invoice"/);
  });

  it("does the AI work in the queue worker instead", () => {
    expect(worker).toMatch(/aiLog\.handleFreeText\(/);
    expect(worker).toMatch(/invoice\.handleInvoicePhoto\(/);
    expect(worker).toMatch(/database: FIRESTORE_DATABASE_ID/);
  });

  it("drops a re-sent update instead of running it twice", () => {
    expect(webhook).toMatch(/bot_updates_seen/);
    expect(webhook).toMatch(/\.create\(/);
  });

  it("never logs the secret it receives", () => {
    expect(webhook).not.toMatch(/console\.\w+\([^)]*received/);
  });

  it("moves to the next log from the same message after Save, and Cancel skips only one", () => {
    const logSrc = readFileSync(join(__dirname, "handlers/log.ts"), "utf8");
    const save = logSrc.slice(logSrc.indexOf("export async function saveLog"));
    expect(save).toMatch(/showNextPendingDraft\(/);
    const cancel = src.slice(src.indexOf('if (data === "xx")'), src.indexOf('if (data === "bk")'));
    expect(cancel).toMatch(/pendingDrafts/);
    expect(cancel).toMatch(/showNextPendingDraft\(/);
    const sessionSrc = readFileSync(join(__dirname, "session.ts"), "utf8");
    // /cancel goes through clearStep, which must drop the queued logs too.
    expect(sessionSrc.slice(sessionSrc.indexOf("export const clearStep"))).toMatch(/pendingDrafts: FieldValue\.delete\(\)/);
  });
});
