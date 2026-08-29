import jsPDF from "jspdf";

/**
 * Downloads standard CSV file from headers and row data.
 */
export function exportToCSV(
  fileName: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
) {
  const csvRows = [
    headers.map((h) => `"${String(h ?? "").replace(/"/g, '""')}"`).join(","),
    ...rows.map((r) =>
      r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ];
  // Excel on Windows ignores the MIME charset for a downloaded file and falls
  // back to the system codepage, which turns Tamil into mojibake. The BOM is
  // what makes it read the file as UTF-8.
  const blob = new Blob(["\ufeff" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", fileName.endsWith(".csv") ? fileName : `${fileName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


// jsPDF's built-in fonts (Helvetica and friends) are Latin-only, so any Tamil
// in an export came out as boxes -- silently, with no error. Noto Sans Tamil
// is fetched and embedded only when the content actually contains Tamil, so an
// English-only export carries no extra weight.
const TAMIL_RANGE = /[\u0B80-\u0BFF]/;
let tamilFontPromise: Promise<string | null> | null = null;

async function loadTamilFont(): Promise<string | null> {
  if (!tamilFontPromise) {
    tamilFontPromise = fetch("/fonts/NotoSansTamil-Regular.ttf")
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
      })
      .catch((e) => {
        // Fall back to Helvetica rather than failing the export outright.
        console.warn("Tamil PDF font unavailable, falling back to Helvetica", e);
        return null;
      });
  }
  return tamilFontPromise;
}

// Brand palette, mirrored from src/index.css so an exported document looks
// like the app it came from.
const BRAND = {
  slate: [50, 71, 85] as const,      // #324755 Drab
  rust: [217, 125, 84] as const,     // #D97D54
  sage: [135, 188, 191] as const,    // #87BCBF
  ice: [240, 243, 244] as const,     // #F0F3F4
  fossil: [200, 209, 211] as const,  // #C8D1D3
  onyx: [27, 28, 32] as const,       // #1B1C20
  muted: [86, 119, 142] as const,    // #56778E
};

/** The Sitetru mark, drawn as vectors so it stays sharp and costs no bytes. */
function drawLogo(doc: jsPDF, x: number, y: number, size: number) {
  const k = size / 512;
  doc.setFillColor(...BRAND.slate);
  doc.roundedRect(x, y, size, size, 116 * k, 116 * k, "F");
  doc.setFillColor(...BRAND.rust);
  doc.roundedRect(x + 136 * k, y + 272 * k, 72 * k, 104 * k, 22 * k, 22 * k, "F");
  doc.roundedRect(x + 222 * k, y + 212 * k, 72 * k, 164 * k, 22 * k, 22 * k, "F");
  doc.setFillColor(...BRAND.sage);
  doc.roundedRect(x + 308 * k, y + 140 * k, 72 * k, 236 * k, 22 * k, 22 * k, "F");
}

/** Reads a displayed cell back to a number: "₹7,06,190" -> 706190. */
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[₹,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!/^-?\d*\.?\d+%?$/.test(cleaned)) return null;
  const n = Number(cleaned.replace("%", ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Generates and downloads a Sitetru-branded PDF table report: header band with
 * the mark, column widths sized to their content, numeric columns aligned
 * right, and a totals band so the figures can be read off the bottom.
 */
export async function exportToPDF(
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
  fileName: string,
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const usableWidth = pageWidth - margin * 2;

  let FONT = "helvetica";
  const hasTamil =
    TAMIL_RANGE.test(title) ||
    TAMIL_RANGE.test(subtitle) ||
    headers.some((h) => TAMIL_RANGE.test(String(h ?? ""))) ||
    rows.some((r) => r.some((c) => TAMIL_RANGE.test(String(c ?? ""))));
  if (hasTamil) {
    const b64 = await loadTamilFont();
    if (b64) {
      doc.addFileToVFS("NotoSansTamil.ttf", b64);
      doc.addFont("NotoSansTamil.ttf", "NotoSansTamil", "normal");
      FONT = "NotoSansTamil";
    }
  }
  // The Tamil subset ships one weight, so bold falls back to regular there.
  const setF = (style: "bold" | "normal") =>
    doc.setFont(FONT, FONT === "helvetica" ? style : "normal");

  // --- which columns hold numbers, and should therefore align right and total
  const numericCols = headers.map((_, i) => {
    const vals = rows.map((r) => r[i]).filter((v) => String(v ?? "").trim() !== "");
    if (vals.length === 0) return false;
    return vals.filter((v) => toNumber(v) !== null).length / vals.length >= 0.8;
  });
  const isMoneyCol = headers.map((_, i) =>
    rows.some((r) => String(r[i] ?? "").includes("₹")),
  );

  // --- column widths from actual content, not an equal split
  setF("normal");
  doc.setFontSize(7.5);
  const widths = (() => {
    const sample = rows.slice(0, 200);
    const raw = headers.map((h, i) => {
      setF("bold");
      let w = doc.getTextWidth(String(h ?? "").toUpperCase());
      setF("normal");
      for (const r of sample) w = Math.max(w, doc.getTextWidth(String(r[i] ?? "")));
      return Math.min(Math.max(w + 5, 14), usableWidth * 0.4);
    });
    const total = raw.reduce((a, b) => a + b, 0);
    return raw.map((w) => (w / total) * usableWidth);
  })();
  const xAt = (i: number) => margin + widths.slice(0, i).reduce((a, b) => a + b, 0);

  const fit = (text: string, maxW: number) => {
    if (maxW <= 0) return "";
    if (doc.getTextWidth(text) <= maxW) return text;
    let t = text;
    while (t.length > 1 && doc.getTextWidth(t + "…") > maxW) t = t.slice(0, -1);
    return t + "…";
  };

  const drawCell = (text: string, col: number, y: number) => {
    const w = widths[col];
    const s = fit(text, w - 3);
    if (numericCols[col]) doc.text(s, xAt(col) + w - 1.5, y, { align: "right" });
    else doc.text(s, xAt(col) + 1.5, y);
  };

  // --- branded header band
  const drawBanner = () => {
    doc.setFillColor(...BRAND.slate);
    doc.rect(0, 0, pageWidth, 26, "F");
    doc.setFillColor(...BRAND.rust);
    doc.rect(0, 26, pageWidth, 1.2, "F");   // rust rule under the band
    drawLogo(doc, margin, 6, 11);
    setF("bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text("Sitetru", margin + 14, 12.2);
    setF("normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...BRAND.sage);
    doc.text("TRUTH, REPORTED FROM SITE", margin + 14, 16.4);

    setF("bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(fit(title.toUpperCase(), usableWidth * 0.55), pageWidth - margin, 12.2, {
      align: "right",
    });
    if (subtitle) {
      setF("normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...BRAND.ice);
      doc.text(fit(subtitle, usableWidth * 0.55), pageWidth - margin, 17, { align: "right" });
    }
    const now = new Date();
    doc.setFontSize(6.5);
    doc.setTextColor(...BRAND.sage);
    doc.text(
      `${now.toLocaleDateString("en-IN")} · ${now.toLocaleTimeString("en-IN", { timeStyle: "short" })}`,
      pageWidth - margin,
      21.6,
      { align: "right" },
    );
  };

  const drawHead = (y: number) => {
    doc.setFillColor(...BRAND.slate);
    doc.rect(margin, y, usableWidth, 7.5, "F");
    setF("bold");
    doc.setFontSize(6.8);
    doc.setTextColor(255, 255, 255);
    headers.forEach((h, i) => drawCell(String(h ?? "").toUpperCase(), i, y + 5));
    return y + 7.5;
  };

  const drawFooter = (page: number) => {
    doc.setDrawColor(...BRAND.fossil);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
    setF("normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...BRAND.muted);
    doc.text("sitetru.com", margin, pageHeight - 6);
    doc.text(`Page ${page}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  };

  drawBanner();
  let y = drawHead(32);
  let page = 1;
  const rowH = 6.6;
  const bottom = pageHeight - 22;   // leave room for the totals band and footer

  setF("normal");
  doc.setFontSize(7.5);

  rows.forEach((row, i) => {
    if (y + rowH > bottom) {
      drawFooter(page);
      doc.addPage();
      page += 1;
      drawBanner();
      y = drawHead(32);
      setF("normal");
      doc.setFontSize(7.5);
    }
    if (i % 2 === 1) {
      doc.setFillColor(...BRAND.ice);
      doc.rect(margin, y, usableWidth, rowH, "F");
    }
    doc.setTextColor(...BRAND.onyx);
    row.forEach((cell, c) => drawCell(String(cell ?? ""), c, y + 4.5));
    doc.setDrawColor(...BRAND.fossil);
    doc.line(margin, y + rowH, margin + usableWidth, y + rowH);
    y += rowH;
  });

  // --- totals band: the reason most of these reports get opened
  const anyTotals = numericCols.some(Boolean);
  if (anyTotals && rows.length > 0) {
    if (y + 9 > bottom) {
      drawFooter(page);
      doc.addPage();
      page += 1;
      drawBanner();
      y = drawHead(32);
    }
    doc.setFillColor(...BRAND.slate);
    doc.rect(margin, y, usableWidth, 8.5, "F");
    setF("bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);

    const firstNumeric = numericCols.indexOf(true);
    headers.forEach((_, c) => {
      if (numericCols[c]) {
        const sum = rows.reduce((acc, r) => acc + (toNumber(r[c]) ?? 0), 0);
        const shown = isMoneyCol[c]
          ? `₹${sum.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
          : sum.toLocaleString("en-IN", { maximumFractionDigits: 2 });
        drawCell(shown, c, y + 5.6);
      } else if (c === 0 && firstNumeric !== 0) {
        drawCell(`TOTAL · ${rows.length} row${rows.length === 1 ? "" : "s"}`, c, y + 5.6);
      }
    });
    y += 8.5;
  }

  drawFooter(page);
  doc.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
}
