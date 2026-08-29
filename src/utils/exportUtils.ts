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

/**
 * Generates and downloads a clean, formatted PDF table report.
 */
export async function exportToPDF(
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
  fileName: string
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

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
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 20, "F");

  setF("bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), margin, 12);

  if (subtitle) {
    setF("normal");
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text(subtitle, margin, 17);
  }

  // Timestamp
  const dateStr = `Date: ${new Date().toLocaleDateString("en-IN")} ${new Date().toLocaleTimeString("en-IN", { timeStyle: "short" })}`;
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(dateStr, pageWidth - margin, 12, { align: "right" });

  let startY = 25;
  const usableWidth = pageWidth - margin * 2;
  const colWidth = usableWidth / Math.max(headers.length, 1);

  // Shrink a cell's text with an ellipsis so it never bleeds into the next
  // column. Rows are a fixed height, so wrapping (maxWidth) would overflow the
  // row instead — clip to a single line that fits the column.
  const fit = (text: string, maxW: number) => {
    if (maxW <= 0) return "";
    if (doc.getTextWidth(text) <= maxW) return text;
    let s = text;
    while (s.length > 1 && doc.getTextWidth(s + "…") > maxW) s = s.slice(0, -1);
    return s + "…";
  };

  const renderTableHeader = (y: number) => {
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, usableWidth, 7, "F");
    setF("bold");
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);

    headers.forEach((h, i) => {
      const x = margin + i * colWidth + 1.5;
      doc.text(fit(String(h).toUpperCase(), colWidth - 3), x, y + 4.8);
    });
  };

  renderTableHeader(startY);
  startY += 7;

  setF("normal");
  doc.setFontSize(7);
  doc.setTextColor(30, 41, 59);

  let pageNum = 1;

  rows.forEach((row, rowIndex) => {
    if (startY + 8 > pageHeight - 12) {
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`Page ${pageNum}`, pageWidth / 2, pageHeight - 6, { align: "center" });

      doc.addPage();
      pageNum++;
      startY = 12;
      renderTableHeader(startY);
      startY += 7;
      setF("normal");
      doc.setFontSize(7);
      doc.setTextColor(30, 41, 59);
    }

    if (rowIndex % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, startY, usableWidth, 6.5, "F");
    }

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, startY + 6.5, margin + usableWidth, startY + 6.5);

    row.forEach((cell, cellIndex) => {
      const cellText = String(cell ?? "");
      const x = margin + cellIndex * colWidth + 1.5;
      doc.text(fit(cellText, colWidth - 3), x, startY + 4.5);
    });

    startY += 6.5;
  });

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`Page ${pageNum}`, pageWidth / 2, pageHeight - 6, { align: "center" });

  doc.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
}
