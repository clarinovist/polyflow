/**
 * CSV Export utilities for financial reports.
 * Client-side only — triggers browser download.
 */

/** Quote CSV text and prevent spreadsheet formulas without changing numbers. */
export function encodeCsvField(value: string | number): string {
    const text = String(value);
    const numeric = /^-?\d+(?:\.\d+)?$/.test(text);
    const dangerous =
        /^[\s\u0000-\u001f\u200b-\u200d\ufeff]*[=+@-]/.test(text) ||
        /^[\t\r\n]/.test(text);
    const safe =
        typeof value === 'string' && !numeric && dangerous ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Download a CSV file in the browser.
 * @param filename - File name with .csv extension
 * @param headers - Column header names
 * @param rows - 2D array of cell values (each inner array = one row)
 */
export function downloadCsv(
    filename: string,
    headers: string[],
    rows: (string | number)[][],
): void {
    const csvLines = [
        headers.map(encodeCsvField).join(','),
        ...rows.map((row) =>
            row.map((cell) => encodeCsvField(cell ?? '')).join(','),
        ),
    ];

    const csvContent = '\uFEFF' + csvLines.join('\n'); // BOM for Excel Indonesian chars
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Format a number as plain integer string for CSV (no currency symbol).
 * Rounds to nearest integer since Rupiah has no decimals.
 */
export function rupiahForCsv(value: number): string {
    return Math.round(value).toString();
}

/**
 * Generate a date-stamped filename for reports.
 */
export function reportFilename(reportName: string, dateStr?: string): string {
    const ts = dateStr || new Date().toISOString().slice(0, 10);
    return `${reportName}_${ts}.csv`;
}
