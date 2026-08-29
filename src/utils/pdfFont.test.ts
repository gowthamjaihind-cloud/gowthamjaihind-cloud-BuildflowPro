import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// exportToPDF fetches this file at runtime. If it goes missing or is replaced
// with a Latin-only build, Tamil exports silently regress to boxes -- there is
// no error, so nothing else would catch it.
const FONT = resolve(__dirname, "../../public/fonts/NotoSansTamil-Regular.ttf");

// Minimal TrueType cmap reader: enough to assert coverage without a dependency.
function codepoints(buf: Buffer): Set<number> {
  const numTables = buf.readUInt16BE(4);
  let cmapOff = 0;
  for (let i = 0; i < numTables; i += 1) {
    const p = 12 + i * 16;
    if (buf.toString("ascii", p, p + 4) === "cmap") cmapOff = buf.readUInt32BE(p + 8);
  }
  if (!cmapOff) return new Set();
  const n = buf.readUInt16BE(cmapOff + 2);
  let sub = 0;
  for (let i = 0; i < n; i += 1) {
    const rec = cmapOff + 4 + i * 8;
    const platform = buf.readUInt16BE(rec);
    const encoding = buf.readUInt16BE(rec + 2);
    // Windows/Unicode BMP
    if (platform === 3 && (encoding === 1 || encoding === 10)) {
      sub = cmapOff + buf.readUInt32BE(rec + 4);
    }
  }
  const out = new Set<number>();
  if (!sub || buf.readUInt16BE(sub) !== 4) return out;
  const segX2 = buf.readUInt16BE(sub + 6);
  const endO = sub + 14;
  const startO = endO + segX2 + 2;
  for (let s = 0; s < segX2 / 2; s += 1) {
    const end = buf.readUInt16BE(endO + s * 2);
    const start = buf.readUInt16BE(startO + s * 2);
    if (start === 0xffff) continue;
    for (let c = start; c <= end && c !== 0xffff; c += 1) out.add(c);
  }
  return out;
}

describe("the PDF Tamil font", () => {
  it("is present where exportToPDF fetches it", () => {
    expect(existsSync(FONT)).toBe(true);
  });

  it("is a real TrueType file", () => {
    const b = readFileSync(FONT);
    // 0x00010000 or 'true' — a woff/woff2 here would be silently unusable by jsPDF.
    const tag = b.readUInt32BE(0);
    expect(tag === 0x00010000 || b.toString("ascii", 0, 4) === "true").toBe(true);
  });

  it("covers Tamil, Latin, digits and the rupee sign", () => {
    const cp = codepoints(readFileSync(FONT));
    const tamil = [...cp].filter((c) => c >= 0x0b80 && c <= 0x0bff);
    expect(tamil.length).toBeGreaterThan(60);
    for (const ch of "0123456789ABCabc") expect(cp.has(ch.charCodeAt(0))).toBe(true);
    expect(cp.has(0x20b9)).toBe(true); // ₹
  });
});
