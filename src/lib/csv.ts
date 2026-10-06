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

/**
 * RFC 4180 parser: quoted fields, doubled quotes, commas and newlines inside quotes,
 * CRLF or LF, optional UTF-8 BOM. Undoes toCsv's formula guard (a leading quote added
 * before =, +, -, @) so a file exported from here imports back unchanged.
 * Blank lines are skipped.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let sawAny = false;
  const endField = () => {
    row.push(/^'[=+\-@\t\r]/.test(field) ? field.slice(1) : field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c !== "") || row.length > 1) rows.push(row);
    row = [];
    sawAny = false;
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    sawAny = true;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") endField();
    else if (c === "\n") endRow();
    else if (c === "\r") {
      if (src[i + 1] === "\n") i++;
      endRow();
    } else field += c;
  }
  if (sawAny) endRow();
  return rows;
}
