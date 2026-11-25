import {
  applyReceiptRows,
  buildImportPreview,
  detectAbonosHeaderRow,
  guessColumnMap,
  previewToRecords,
  type ImportColumnMap,
  type ImportPreviewRow,
  type ImportReceiptRow,
} from '@/lib/abonos-excel';
import {
  DEFAULT_NEW_AUTHOR,
  MANUAL_STATUSES,
  statusLabel,
  type AbonoCase,
  type AbonoClaim,
  type AbonoReceipt,
  type AbonosCatalogs,
  type AbonosState,
} from '@/lib/abonos-model';

export type ImportMode = 'add' | 'overwrite';

export interface ParsedImport {
  map: ImportColumnMap;
  rows: ImportPreviewRow[];
  valid: ImportPreviewRow[];
  errors: ImportPreviewRow[];
  receipts: ImportReceiptRow[];
}

export interface ImportPlan {
  state: AbonosState;
  added: number;
  removed: number;
  keptDocuments: number;
}

export const TEMPLATE_HEADERS = [
  'Registro',
  'Marca',
  'Tipo',
  'Área',
  'Equipo',
  'Concepto',
  'Fecha prevista',
  'Cálculo',
  'Importe previsto',
  'Estado',
  'Importe comunicado',
  'Responsable',
  'Notas',
];

export function parseImport(rows: unknown[][], receipts: ImportReceiptRow[] = []): ParsedImport {
  const headerIndex = detectAbonosHeaderRow(rows);
  const map = guessColumnMap(rows[headerIndex] || []);
  const preview = buildImportPreview(rows, map, headerIndex).map((row) => ({ ...row, existing: false }));
  return {
    map,
    rows: preview,
    valid: preview.filter((row) => !row.error),
    errors: preview.filter((row) => Boolean(row.error)),
    receipts,
  };
}

function fillDefaults(row: AbonoCase, author: string): AbonoCase {
  return {
    ...row,
    createdAt: row.createdAt || new Date().toISOString(),
    addedBy: row.addedBy || author,
    responsible: row.responsible || row.addedBy || author,
    status: row.status || 'Pendiente',
  };
}

/** Every valid row becomes a new abono with the next registro. Nothing existing changes. */
export function planAdd(current: AbonosState, parsed: ParsedImport, author = DEFAULT_NEW_AUTHOR): ImportPlan {
  const records = previewToRecords(parsed.valid);
  let next = current.cases.reduce((max, row) => Math.max(max, row.registro), 0) + 1;
  const created = records.cases.map((row) => fillDefaults({ ...row, registro: next++ }, author));
  return {
    state: {
      ...current,
      cases: [...created, ...current.cases],
      receipts: [...current.receipts, ...records.receipts],
    },
    added: created.length,
    removed: 0,
    keptDocuments: 0,
  };
}

/**
 * The abonos list becomes exactly the file. A row whose Registro matches an existing abono keeps
 * that abono's documents and cobros (unless the file brings a Recepciones sheet, which then rules).
 */
export function planOverwrite(current: AbonosState, parsed: ParsedImport, author = DEFAULT_NEW_AUTHOR): ImportPlan {
  const records = previewToRecords(parsed.valid);
  const used = new Set<number>();
  let next = Math.max(
    current.cases.reduce((max, row) => Math.max(max, row.registro), 0),
    parsed.valid.reduce((max, row) => Math.max(max, row.registro ?? 0), 0),
  ) + 1;
  const oldByRegistro = new Map(current.cases.map((row) => [row.registro, row]));
  const idMap = new Map<string, string>();
  let keptDocuments = 0;

  const cases = records.cases.map((row, index) => {
    const fileRegistro = parsed.valid[index]?.registro ?? null;
    const registro = fileRegistro !== null && !used.has(fileRegistro) ? fileRegistro : next++;
    used.add(registro);
    const previous = fileRegistro !== null ? oldByRegistro.get(fileRegistro) : undefined;
    if (previous) {
      idMap.set(previous.id, row.id);
      keptDocuments += (previous.attachments || []).length;
    }
    return fillDefaults({
      ...row,
      registro,
      createdAt: previous?.createdAt || row.createdAt,
      attachments: previous?.attachments || [],
    }, author);
  });

  let receipts: AbonoReceipt[];
  if (parsed.receipts.length > 0) {
    receipts = applyReceiptRows(cases, [], parsed.receipts).receipts;
  } else {
    receipts = [
      ...current.receipts
        .filter((item) => idMap.has(item.caseId))
        .map((item) => ({ ...item, caseId: idMap.get(item.caseId) as string })),
      ...records.receipts,
    ];
  }
  const claims: AbonoClaim[] = (current.claims || [])
    .filter((item) => idMap.has(item.caseId))
    .map((item) => ({ ...item, caseId: idMap.get(item.caseId) as string }));

  return {
    state: { ...current, cases, receipts, claims },
    added: cases.length,
    removed: current.cases.length,
    keptDocuments,
  };
}

/** Template with dropdowns for the fields that have a fixed list. */
export async function buildImportTemplate(catalogs: AbonosCatalogs, people: string[]): Promise<Uint8Array> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Abonos', { views: [{ state: 'frozen', ySplit: 1 }] });
  const widths = [10, 14, 16, 14, 18, 40, 15, 12, 16, 18, 18, 14, 50];
  sheet.columns = TEMPLATE_HEADERS.map((header, index) => ({ header, key: header, width: widths[index] }));
  const header = sheet.getRow(1);
  header.height = 22;
  header.eachCell((cell, column) => {
    const required = ['Marca', 'Tipo', 'Área', 'Equipo', 'Fecha prevista', 'Importe previsto'].includes(TEMPLATE_HEADERS[column - 1]);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: required ? 'FF141414' : 'FF52525B' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle' };
  });

  const lists = workbook.addWorksheet('Listas', { state: 'veryHidden' });
  const columns: Array<{ name: string; values: string[] }> = [
    { name: 'Marca', values: catalogs.brands },
    { name: 'Tipo', values: catalogs.types },
    { name: 'Área', values: catalogs.areas },
    { name: 'Equipo', values: catalogs.teams },
    { name: 'Cálculo', values: ['Fijo', 'Estimado'] },
    { name: 'Estado', values: MANUAL_STATUSES.map((status) => statusLabel(status)) },
    { name: 'Responsable', values: people },
  ];
  columns.forEach((list, index) => {
    const column = index + 1;
    lists.getCell(1, column).value = list.name;
    list.values.forEach((value, row) => { lists.getCell(row + 2, column).value = value; });
  });
  const letter = (n: number) => String.fromCharCode(64 + n);
  const ROWS = 500;
  columns.forEach((list, index) => {
    const target = TEMPLATE_HEADERS.indexOf(list.name) + 1;
    if (target <= 0 || list.values.length === 0) return;
    const range = `Listas!$${letter(index + 1)}$2:$${letter(index + 1)}$${list.values.length + 1}`;
    // Equipo accepts free text too, the rest must come from the list.
    const strict = list.name !== 'Equipo';
    for (let row = 2; row <= ROWS; row += 1) {
      sheet.getCell(row, target).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [range],
        showErrorMessage: strict,
        errorStyle: strict ? 'stop' : 'information',
        errorTitle: list.name,
        error: `Elige un valor de la lista de ${list.name}.`,
      };
    }
  });
  const dateColumn = TEMPLATE_HEADERS.indexOf('Fecha prevista') + 1;
  const moneyColumns = ['Importe previsto', 'Importe comunicado'].map((name) => TEMPLATE_HEADERS.indexOf(name) + 1);
  for (let row = 2; row <= ROWS; row += 1) {
    sheet.getCell(row, dateColumn).numFmt = 'dd/mm/yyyy';
    moneyColumns.forEach((column) => { sheet.getCell(row, column).numFmt = '#,##0.00 "€"'; });
  }

  const help = workbook.addWorksheet('Instrucciones');
  help.getColumn(1).width = 26;
  help.getColumn(2).width = 90;
  [
    ['Cómo rellenar la plantilla', ''],
    ['', ''],
    ['Una fila por abono', 'Rellena la hoja Abonos. Las columnas en negro son obligatorias.'],
    ['Registro', 'Déjalo vacío para abonos nuevos. Solo cuenta al sobrescribir: si coincide con uno que ya existe, ese abono conserva sus documentos y cobros.'],
    ['Marca, Tipo, Área', 'Elige de la lista desplegable.'],
    ['Equipo', 'Elige de la lista o escribe uno nuevo.'],
    ['Fecha prevista', 'Formato dd/mm/aaaa.'],
    ['Cálculo', 'Fijo o Estimado. Si lo dejas vacío, cuenta como Fijo.'],
    ['Estado', 'Pendiente, Pago comunicado, A cuenta o Cobrado. Si lo dejas vacío, queda Pendiente.'],
    ['Responsable', 'Si lo dejas vacío, se pone Cristóbal.'],
    ['', ''],
    ['Añadir', 'Cada fila se añade como abono nuevo. No se toca nada de lo que ya hay.'],
    ['Sobrescribir todo', 'La lista de abonos pasa a ser exactamente la del Excel. Antes se guarda una copia de seguridad que puedes restaurar.'],
  ].forEach((line) => help.addRow(line));
  help.getRow(1).font = { bold: true, size: 13 };
  help.getColumn(1).font = { bold: true };

  workbook.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
