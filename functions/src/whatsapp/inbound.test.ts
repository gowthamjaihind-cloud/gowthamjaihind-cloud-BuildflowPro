import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature, verifyChallenge, parseInbound, waSessionKey } from "./inbound";

const SECRET = "test-app-secret";
const sign = (body: string, secret = SECRET) =>
  "sha256=" + createHmac("sha256", secret).update(Buffer.from(body, "utf8")).digest("hex");

describe("verifySignature", () => {
  const body = JSON.stringify({ entry: [{ id: "1" }] });

  it("accepts a correctly signed body", () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a body signed with the wrong secret", () => {
    expect(verifySignature(body, sign(body, "not-the-secret"), SECRET)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const header = sign(body);
    expect(verifySignature(body.replace('"1"', '"2"'), header, SECRET)).toBe(false);
  });

  it("rejects a missing or malformed header instead of throwing", () => {
    expect(verifySignature(body, undefined, SECRET)).toBe(false);
    expect(verifySignature(body, "", SECRET)).toBe(false);
    expect(verifySignature(body, "sha1=abcd", SECRET)).toBe(false);
    expect(verifySignature(body, "sha256=", SECRET)).toBe(false);
    expect(verifySignature(body, "sha256=zzzz", SECRET)).toBe(false);
    expect(verifySignature(body, "garbage", SECRET)).toBe(false);
  });

  it("rejects a signature of the right shape but the wrong length", () => {
    expect(verifySignature(body, "sha256=" + "ab".repeat(8), SECRET)).toBe(false);
  });

  it("refuses everything when no app secret is configured", () => {
    // Fail closed. An unset secret must not mean "allow".
    expect(verifySignature(body, sign(body), "")).toBe(false);
  });

  it("verifies the RAW bytes, not a re-serialisation", () => {
    // Meta signs exactly what it sent. This body round-trips through
    // JSON.parse/stringify to different bytes, and the signature over the
    // original must not validate against the re-serialised form.
    const raw = '{"a":  1,"b":"\\u00e9"}';
    const header = sign(raw);
    expect(verifySignature(raw, header, SECRET)).toBe(true);
    expect(verifySignature(JSON.stringify(JSON.parse(raw)), header, SECRET)).toBe(false);
  });
});

describe("verifyChallenge", () => {
  it("echoes the challenge when mode and token match", () => {
    expect(
      verifyChallenge({ "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "12345" }, "tok"),
    ).toBe("12345");
  });

  it("refuses a wrong token, a wrong mode, or an unset token", () => {
    const q = { "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "1" };
    expect(verifyChallenge(q, "other")).toBeNull();
    expect(verifyChallenge({ ...q, "hub.mode": "unsubscribe" }, "tok")).toBeNull();
    expect(verifyChallenge(q, "")).toBeNull();
  });
});

describe("parseInbound", () => {
  const envelope = (value: unknown) => ({ entry: [{ changes: [{ field: "messages", value }] }] });

  it("reads a text message", () => {
    const got = parseInbound(
      envelope({
        contacts: [{ profile: { name: "Ravi" } }],
        messages: [{ from: "919000000000", id: "wamid.1", type: "text", text: { body: "hello" } }],
      }),
    );
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ from: "919000000000", kind: "text", text: "hello", profileName: "Ravi" });
  });

  it("reads a tapped reply button and a tapped list row the same way", () => {
    const btn = parseInbound(
      envelope({
        messages: [{ from: "91", id: "m1", type: "interactive", interactive: { button_reply: { id: "ct:t7", title: "Slab" } } }],
      }),
    );
    const list = parseInbound(
      envelope({
        messages: [{ from: "91", id: "m2", type: "interactive", interactive: { list_reply: { id: "ct:t7", title: "Slab" } } }],
      }),
    );
    expect(btn[0]).toMatchObject({ kind: "reply", replyId: "ct:t7" });
    expect(list[0]).toMatchObject({ kind: "reply", replyId: "ct:t7" });
  });

  it("reads an image and keeps the id needed to fetch it", () => {
    const got = parseInbound(
      envelope({ messages: [{ from: "91", id: "m", type: "image", image: { id: "media-1", mime_type: "image/jpeg" } }] }),
    );
    expect(got[0]).toMatchObject({ kind: "image", mediaId: "media-1", mimeType: "image/jpeg" });
  });

  it("IGNORES delivery and read receipts", () => {
    // These arrive at the same webhook in the same envelope. Treating one as
    // input makes the bot answer its own receipt, and then answer that.
    const statuses = envelope({
      statuses: [{ id: "wamid.1", status: "delivered", recipient_id: "919000000000" }],
    });
    expect(parseInbound(statuses)).toEqual([]);
  });

  it("ignores changes for other subscription fields", () => {
    expect(parseInbound({ entry: [{ changes: [{ field: "message_template_status_update", value: {} }] }] })).toEqual([]);
  });

  it("survives malformed payloads without throwing", () => {
    for (const bad of [null, {}, { entry: null }, { entry: [{}] }, { entry: [{ changes: [{}] }] }]) {
      expect(() => parseInbound(bad)).not.toThrow();
      expect(parseInbound(bad)).toEqual([]);
    }
  });

  it("skips a message with no sender or no id", () => {
    const got = parseInbound(envelope({ messages: [{ type: "text", text: { body: "x" } }, { from: "91", type: "text" }] }));
    expect(got).toEqual([]);
  });

  it("marks an unknown type unsupported rather than dropping it", () => {
    // Dropping it silently means the engineer's sticker gets no reply at all
    // and the bot looks dead.
    const got = parseInbound(envelope({ messages: [{ from: "91", id: "m", type: "sticker" }] }));
    expect(got[0].kind).toBe("unsupported");
  });
});

describe("waSessionKey", () => {
  it("namespaces away from Telegram's numeric chat ids", () => {
    expect(waSessionKey("919000000000")).toBe("wa:919000000000");
    expect(waSessionKey("919000000000")).not.toBe("919000000000");
  });
});
