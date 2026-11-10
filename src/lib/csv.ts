/** Minimal RFC 4180 CSV writer. */

export function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = Array.isArray(v) ? v.join("; ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  // Neutralize spreadsheet formulas (CSV injection) from free-text fields.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: (keyof T & string)[]): string {
  const lines = [columns.join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}
