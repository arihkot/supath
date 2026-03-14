// ---------------------------------------------------------------------------
// Shared PDF export helpers — used across all SuPath pages
// ---------------------------------------------------------------------------

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Re-export for convenience so pages only need one import
export { jsPDF, autoTable };

// Brand color
const BRAND_R = 30;
const BRAND_G = 58;
const BRAND_B = 95;

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export function fmtDate(d?: string | null): string {
  return d ? new Date(d).toLocaleString() : "N/A";
}

export function fmtDateShort(d?: string | null): string {
  return d ? new Date(d).toLocaleDateString("en-IN") : "N/A";
}

/**
 * Get the finalY after the last autoTable call.
 */
export function getLastTableY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY;
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

/**
 * Adds the branded header bar at the top of the first page.
 * Returns the Y cursor position after the header.
 */
export function addReportHeader(
  doc: jsPDF,
  title: string,
  subtitle: string
): number {
  const pageW = doc.internal.pageSize.getWidth();

  // Brand bar
  doc.setFillColor(BRAND_R, BRAND_G, BRAND_B);
  doc.rect(0, 0, pageW, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("SuPath \u2014 Pothole Intelligence", 14, 15);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(title, 14, 24);

  // Subtitle + date
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8);
  doc.text(subtitle, 14, 40);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageW - 14, 40, {
    align: "right",
  });

  return 48; // Y cursor after header
}

/**
 * Adds a section title with a colored divider line.
 * Automatically adds a new page if there's not enough space.
 */
export function addSectionTitle(
  doc: jsPDF,
  y: number,
  label: string
): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + 16 > pageH - 20) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(BRAND_R, BRAND_G, BRAND_B);
  doc.text(label, 14, y);
  doc.setDrawColor(BRAND_R, BRAND_G, BRAND_B);
  doc.setLineWidth(0.5);
  doc.line(14, y + 2, doc.internal.pageSize.getWidth() - 14, y + 2);
  return y + 10;
}

/**
 * Adds a key-value pair line. Breaks to a new page if needed.
 */
export function addKeyValue(
  doc: jsPDF,
  y: number,
  key: string,
  value: string
): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + 8 > pageH - 20) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);
  doc.text(`${key}:`, 18, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  doc.text(value, 70, y);
  return y + 6;
}

/**
 * Adds page footers (page numbers + confidential notice) to every page.
 * Call this once at the end, before saving.
 */
export function addPageFooter(doc: jsPDF): void {
  const pages = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(`Page ${i} of ${pages}`, pageW / 2, pageH - 8, {
      align: "center",
    });
    doc.text("SuPath \u2014 Confidential", 14, pageH - 8);
  }
}

// ---------------------------------------------------------------------------
// Standard table style presets
// ---------------------------------------------------------------------------

/** Standard head style (dark brand color) */
export const TABLE_HEAD_STYLE = {
  fillColor: [BRAND_R, BRAND_G, BRAND_B] as [number, number, number],
  textColor: 255 as const,
  fontStyle: "bold" as const,
};

/** Alternate row style */
export const TABLE_ALT_ROW_STYLE = {
  fillColor: [245, 247, 250] as [number, number, number],
};

/** Standard table margin */
export const TABLE_MARGIN = { left: 14, right: 14 };

/** Standard body style */
export const TABLE_BODY_STYLE = { fontSize: 7, cellPadding: 2 };

/** Compact body style (for large datasets) */
export const TABLE_COMPACT_STYLE = {
  fontSize: 6,
  cellPadding: 1.5,
  overflow: "linebreak" as const,
};

// ---------------------------------------------------------------------------
// Convenience: save with a standard filename
// ---------------------------------------------------------------------------

export function savePDF(doc: jsPDF, prefix: string): void {
  addPageFooter(doc);
  doc.save(`supath-${prefix}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
