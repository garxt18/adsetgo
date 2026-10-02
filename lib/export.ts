/**
 * Helpers for files people download: CSV cells and file names. Pure, so the
 * CSV buttons (browser) and the PDF routes (server) share them.
 */

/**
 * One CSV cell. Quoted, with inner quotes doubled; and a value starting with
 * = + - @ (or a tab or carriage return) gets a leading apostrophe, because a
 * spreadsheet would otherwise run it as a formula -- a campaign named
 * "=HYPERLINK(...)" is enough. Numbers are written plainly so they stay numbers.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";

  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Rows to CSV text. Windows line endings, which every spreadsheet accepts. */
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/** "Acme Corp" → "acme-corp", for file names. */
export function fileSlug(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "-")
      .slice(0, 60) || "report"
  );
}
