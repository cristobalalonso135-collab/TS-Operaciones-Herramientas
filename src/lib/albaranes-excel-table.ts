import ExcelJS from 'exceljs';

function safeTableName(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_]/g, '_') || 'Tabla';
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `T_${cleaned}`;
}

export async function workbookTableBuffer(input: {
  sheetName: string;
  tableName: string;
  header: string[];
  rows: Array<Array<string | number | null>>;
}): Promise<Buffer> {
  const header = input.header.map((name, index) => {
    const text = String(name || '').trim() || `Columna${index + 1}`;
    return text;
  });
  const seen = new Map<string, number>();
  const columns = header.map((name) => {
    const count = seen.get(name) || 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name} ${count + 1}`;
  });
  const dataRows = input.rows.length > 0
    ? input.rows.map((row) => columns.map((_, index) => row[index] ?? ''))
    : [columns.map(() => '')];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TS Operaciones';
  const sheet = workbook.addWorksheet(input.sheetName.slice(0, 31) || 'Acciones');
  columns.forEach((name, index) => {
    const widest = dataRows.slice(0, 80).reduce((max, row) => Math.max(max, String(row[index] ?? '').length), name.length);
    sheet.getColumn(index + 1).width = Math.min(42, Math.max(12, widest + 2));
  });
  sheet.addTable({
    name: safeTableName(input.tableName),
    ref: 'A1',
    headerRow: true,
    totalsRow: false,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: columns.map((name) => ({ name, filterButton: true })),
    rows: dataRows,
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
