import {
  ABONOS_EXPORT_GUIDE,
  documentsExportRows,
} from '@/lib/abonos-excel';
import {
  abonoAlert,
  statusLabel,
  todayIso,
  type AbonoComputed,
  type AbonoReceipt,
} from '@/lib/abonos-model';

type DocumentRow = { registro: number; fileName: string; path: string; originalName: string };

const MONEY = '#,##0.00 "€"';
const DATE = 'dd/mm/yyyy';
const HEADER_FILL = 'FF141414';
const STATUS_FILLS: Record<string, { fill: string; font: string }> = {
  Pendiente: { fill: 'FFF1F1F3', font: 'FF4A4A50' },
  'Pago comunicado': { fill: 'FFEDE9FE', font: 'FF5B21B6' },
  'A cuenta': { fill: 'FFE0E7FF', font: 'FF3730A3' },
  Liquidado: { fill: 'FFE3F4EA', font: 'FF17633D' },
  'Liquidado parcialmente': { fill: 'FFFDF0D5', font: 'FF8A5300' },
  Exceso: { fill: 'FFDFF3F7', font: 'FF0B6476' },
};

function isoToDate(value: string | null): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Abonos workbook with formatting: frozen header, filters, money and date formats,
 * and the alert and status columns coloured like the chips in the table.
 * Column headers stay compatible with the importer.
 */
export async function buildAbonosWorkbook(
  rows: AbonoComputed[],
  receipts: AbonoReceipt[],
  documentLabels: Map<string, string>,
  documents: DocumentRow[] | null,
): Promise<Uint8Array> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const today = todayIso();

  const sheet = workbook.addWorksheet('Abonos', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
  sheet.columns = [
    { header: 'Registro', key: 'registro', width: 10 },
    { header: 'Aviso', key: 'aviso', width: 22 },
    { header: 'Estado', key: 'estado', width: 18 },
    { header: 'Fecha prevista', key: 'dueDate', width: 14, style: { numFmt: DATE } },
    { header: 'Marca', key: 'brand', width: 12 },
    { header: 'Concepto', key: 'concept', width: 40 },
    { header: 'Importe previsto', key: 'expected', width: 16, style: { numFmt: MONEY } },
    { header: 'Cobrado', key: 'received', width: 16, style: { numFmt: MONEY } },
    { header: 'Pendiente', key: 'pending', width: 16, style: { numFmt: MONEY } },
    { header: 'Cálculo', key: 'mode', width: 11 },
    { header: 'Importe comunicado', key: 'communicated', width: 18, style: { numFmt: MONEY } },
    { header: 'Tipo', key: 'type', width: 14 },
    { header: 'Área', key: 'area', width: 13 },
    { header: 'Equipo', key: 'team', width: 18 },
    { header: 'Responsable', key: 'responsible', width: 13 },
    { header: 'Notas', key: 'notes', width: 50 },
    { header: 'Documentos', key: 'docs', width: 24 },
  ];

  rows.forEach((row) => {
    const alert = abonoAlert(row, today);
    const added = sheet.addRow({
      registro: row.registro,
      aviso: alert ? alert.label : '',
      estado: row.status ? statusLabel(row.status) : '',
      dueDate: isoToDate(row.dueDate),
      brand: row.brand,
      concept: row.concept,
      expected: row.expectedAmount,
      received: row.receivedTotal,
      pending: row.pending,
      mode: row.amountModeResolved === 'Variable' ? 'Estimado' : 'Fijo',
      communicated: row.communicatedAmount,
      type: row.type,
      area: row.area,
      team: row.teamMotivo,
      responsible: row.responsible,
      notes: row.notes,
      docs: documentLabels.get(row.id) || '',
    });
    if (alert) {
      const cell = added.getCell('aviso');
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: alert.level === 'danger' ? 'FFC62828' : 'FFFFEDD5' } };
      cell.font = { bold: true, color: { argb: alert.level === 'danger' ? 'FFFFFFFF' : 'FF9A3412' } };
      cell.note = alert.reasons.join('\n');
    }
    const tone = STATUS_FILLS[row.status];
    if (tone) {
      const cell = added.getCell('estado');
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tone.fill } };
      cell.font = { bold: true, color: { argb: tone.font } };
    }
    if (row.pending > 0.009) added.getCell('pending').font = { bold: true };
    added.getCell('notes').alignment = { wrapText: false };
  });

  const lastDataRow = sheet.rowCount;
  const totals = sheet.addRow({
    concept: `Total (${rows.length} abono${rows.length === 1 ? '' : 's'})`,
    expected: rows.length ? { formula: `SUBTOTAL(9,G2:G${lastDataRow})` } : 0,
    received: rows.length ? { formula: `SUBTOTAL(9,H2:H${lastDataRow})` } : 0,
    pending: rows.length ? { formula: `SUBTOTAL(9,I2:I${lastDataRow})` } : 0,
  });
  totals.font = { bold: true };
  totals.eachCell((cell) => {
    cell.border = { top: { style: 'thin', color: { argb: 'FF141414' } } };
  });

  const header = sheet.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle' };
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, lastDataRow), column: sheet.columnCount } };

  const caseIds = new Set(rows.map((row) => row.id));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const receiptSheet = workbook.addWorksheet('Recepciones', { views: [{ state: 'frozen', ySplit: 1 }] });
  receiptSheet.columns = [
    { header: 'Registro', key: 'registro', width: 10 },
    { header: 'Marca', key: 'brand', width: 12 },
    { header: 'Fecha recepción', key: 'date', width: 16, style: { numFmt: DATE } },
    { header: 'Importe', key: 'amount', width: 16, style: { numFmt: MONEY } },
    { header: 'Referencia', key: 'reference', width: 24 },
    { header: 'Comentario', key: 'comment', width: 40 },
  ];
  receipts.filter((item) => caseIds.has(item.caseId)).forEach((receipt) => {
    const parent = byId.get(receipt.caseId);
    receiptSheet.addRow({
      registro: parent?.registro ?? '',
      brand: parent?.brand ?? '',
      date: isoToDate(receipt.receivedAt),
      amount: receipt.amount,
      reference: receipt.reference,
      comment: receipt.comment,
    });
  });
  receiptSheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });

  if (documents) {
    const docSheet = workbook.addWorksheet('Documentos');
    documentsExportRows(documents).forEach((line) => docSheet.addRow(line));
    docSheet.getRow(1).font = { bold: true };
    docSheet.columns.forEach((column) => { column.width = 28; });
    const guide = workbook.addWorksheet('Lectura');
    ABONOS_EXPORT_GUIDE.forEach((line) => guide.addRow(line));
    guide.getRow(1).font = { bold: true, size: 13 };
    guide.getColumn(1).width = 110;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
