export type CsvCell = string | number | boolean | Date | null | undefined;

/**
 * RFC 4180 CSV with spreadsheet formula-injection protection: a cell starting
 * with =, +, -, @, tab or CR would execute when opened in Excel/Sheets, so it
 * is prefixed with a single quote. Names and campaign values here come from
 * visitors, so this is not theoretical.
 */
export function toCsv(rows: CsvCell[][]): string {
  const esc = (v: CsvCell) => {
    const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}
