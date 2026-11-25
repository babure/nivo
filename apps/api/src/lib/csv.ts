/** Prefix formula-triggering cells so spreadsheet apps treat them as text (REQ-ADM-10). */
export function formulaSafeCsvCell(value: string): string {
  const raw = value ?? "";
  const needsFormulaGuard = /^[=+\-@\t\r]/.test(raw);
  const escaped = raw.replace(/"/g, '""');
  if (needsFormulaGuard || /[",\n\r]/.test(raw)) {
    return `"${needsFormulaGuard ? `'${escaped}` : escaped}"`;
  }
  return raw;
}

export function csvRow(values: Array<string | number | boolean | null | undefined>): string {
  return values
    .map((v) => {
      if (v === null || v === undefined) return "";
      if (typeof v === "number" || typeof v === "boolean") return String(v);
      return formulaSafeCsvCell(v);
    })
    .join(",");
}
