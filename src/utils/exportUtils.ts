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
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", fileName.endsWith(".csv") ? fileName : `${fileName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates and downloads a clean, formatted PDF table report.
 */
export function exportToPDF(
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
  fileName: string
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 20, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), margin, 12);

  if (subtitle) {
    doc.setFont("helvetica", "normal");
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

  const renderTableHeader = (y: number) => {
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, usableWidth, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);

    headers.forEach((h, i) => {
      const x = margin + i * colWidth + 1.5;
      doc.text(String(h).toUpperCase(), x, y + 4.8, { maxWidth: colWidth - 3 });
    });
  };

  renderTableHeader(startY);
  startY += 7;

  doc.setFont("helvetica", "normal");
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
      doc.setFont("helvetica", "normal");
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
      doc.text(cellText, x, startY + 4.5, { maxWidth: colWidth - 3 });
    });

    startY += 6.5;
  });

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`Page ${pageNum}`, pageWidth / 2, pageHeight - 6, { align: "center" });

  doc.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
}
