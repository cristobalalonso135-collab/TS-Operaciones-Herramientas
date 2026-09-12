import {
  asOrigin,
  asSource,
  asStatus,
  cellToIso,
  parseMoney,
  shortPersonName,
  statusAfterReceipts,
  todayIso,
  type AbonoCase,
  type AbonoReceipt,
} from '@/lib/abonos-model';

export interface ImportColumnMap {
  registro: number | null;
  dueDate: number | null;
  brand: number | null;
  type: number | null;
  teamMotivo: number | null;
  area: number | null;
  addedBy: number | null;
  responsible: number | null;
  expectedAmount: number | null;
  communicatedAmount: number | null;
  pay1Date: number | null;
  pay1Amount: number | null;
  pay2Date: number | null;
  pay2Amount: number | null;
  status: number | null;
  nextReview: number | null;
  comment: number | null;
  origin: number | null;
  source: number | null;
  informedBy: number | null;
}

export interface ImportPreviewRow {
  key: string;
  registro: number | null;
  dueDate: string | null;
  brand: string;
  type: string;
  teamMotivo: string;
  area: string;
  addedBy: string;
  responsible: string;
  expectedAmount: number | null;
  communicatedAmount: number | null;
  pay1Date: string | null;
  pay1Amount: number | null;
  pay2Date: string | null;
  pay2Amount: number | null;
  status: string;
  nextReview: string | null;
  comment: string;
  origin: string;
  source: string;
  informedBy: string;
  error: string | null;
}

const HEADER_ALIASES: Record<keyof ImportColumnMap, string[]> = {
  registro: ['registro', 'id', 'nº', 'n°'],
  dueDate: ['fecha prevista', 'fecha'],
  brand: ['empresa', 'marca'],
  type: ['tipo'],
  teamMotivo: ['equipo/motivo', 'equipo / motivo', 'equipo', 'motivo'],
  area: ['área', 'area'],
  addedBy: ['añadido por', 'anadido por', 'creado por'],
  responsible: ['responsable de seguimiento', 'responsable'],
  expectedAmount: ['importe previsto', 'previsto'],
  communicatedAmount: ['importe comunicado', 'importe comunicado por la marca'],
  pay1Date: ['fecha 1er pago', 'fecha 1er', 'fecha primer pago'],
  pay1Amount: ['importe 1er pago', 'importe 1er', 'importe primer pago'],
  pay2Date: ['fecha 2º pago', 'fecha 2o pago', 'fecha segundo pago'],
  pay2Amount: ['importe 2º pago', 'importe 2o pago', 'importe segundo pago'],
  status: ['estado'],
  nextReview: ['próxima revisión', 'proxima revisión', 'próxima revision', 'proxima revision'],
  comment: ['comentario', 'comentarios'],
  origin: ['origen'],
  source: ['llegó por', 'llego por', 'canal'],
  informedBy: ['nombre del correo', 'informado por'],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');
}

function cellText(value: unknown): string {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim();
}

function isPablo(value: string): boolean {
  return value.trim().toLocaleLowerCase('es').startsWith('pablo');
}

export function detectAbonosHeaderRow(rows: unknown[][]): number {
  const index = rows.findIndex((row) => {
    const joined = (row || []).map(normalizeHeader).join(' | ');
    const hasBrand = joined.includes('empresa') || joined.includes('marca');
    const hasShape = joined.includes('tipo') || joined.includes('importe') || joined.includes('equipo') || joined.includes('área') || joined.includes('area');
    return hasBrand && hasShape;
  });
  return index >= 0 ? index : 0;
}

export function guessColumnMap(header: unknown[]): ImportColumnMap {
  const normalized = header.map(normalizeHeader);
  const find = (keys: string[]) => {
    const index = normalized.findIndex((name) => keys.some((key) => name === key || name.includes(key)));
    return index >= 0 ? index : null;
  };
  return {
    registro: find(HEADER_ALIASES.registro),
    dueDate: find(HEADER_ALIASES.dueDate),
    brand: find(HEADER_ALIASES.brand),
    type: find(HEADER_ALIASES.type),
    teamMotivo: find(HEADER_ALIASES.teamMotivo),
    area: find(HEADER_ALIASES.area),
    addedBy: find(HEADER_ALIASES.addedBy),
    responsible: find(HEADER_ALIASES.responsible),
    expectedAmount: find(HEADER_ALIASES.expectedAmount),
    communicatedAmount: find(HEADER_ALIASES.communicatedAmount),
    pay1Date: find(HEADER_ALIASES.pay1Date),
    pay1Amount: find(HEADER_ALIASES.pay1Amount),
    pay2Date: find(HEADER_ALIASES.pay2Date),
    pay2Amount: find(HEADER_ALIASES.pay2Amount),
    status: find(HEADER_ALIASES.status),
    nextReview: find(HEADER_ALIASES.nextReview),
    comment: find(HEADER_ALIASES.comment),
    origin: find(HEADER_ALIASES.origin),
    source: find(HEADER_ALIASES.source),
    informedBy: find(HEADER_ALIASES.informedBy),
  };
}

function pick(row: unknown[], index: number | null): unknown {
  if (index === null || index < 0) return '';
  return row[index];
}

export function buildImportPreview(rows: unknown[][], map: ImportColumnMap, headerIndex: number): ImportPreviewRow[] {
  return rows.slice(headerIndex + 1)
    .map((row, index) => {
      const brand = cellText(pick(row, map.brand));
      const type = cellText(pick(row, map.type));
      const teamMotivo = cellText(pick(row, map.teamMotivo));
      const areaRaw = cellText(pick(row, map.area));
      const registroValue = pick(row, map.registro);
      const registro = registroValue === '' || registroValue === null || registroValue === undefined
        ? null
        : Number(registroValue);
      const empty = !brand && !type && !teamMotivo && registro === null;
      const dueDate = cellToIso(pick(row, map.dueDate));
      const addedBy = cellText(pick(row, map.addedBy));
      const responsible = cellText(pick(row, map.responsible)) || addedBy;
      const expectedAmount = parseMoney(pick(row, map.expectedAmount));
      if (empty) return null;
      const error = !brand
        ? 'Falta empresa.'
        : !areaRaw
          ? 'Falta área.'
          : expectedAmount !== null && expectedAmount < 0
            ? 'El importe previsto no puede ser negativo.'
            : null;
      return {
        key: `import-${index}`,
        registro: Number.isFinite(registro) ? Number(registro) : null,
        dueDate,
        brand,
        type,
        teamMotivo,
        area: areaRaw,
        addedBy: shortPersonName(addedBy),
        responsible: shortPersonName(responsible),
        expectedAmount,
        communicatedAmount: parseMoney(pick(row, map.communicatedAmount)),
        pay1Date: cellToIso(pick(row, map.pay1Date)),
        pay1Amount: parseMoney(pick(row, map.pay1Amount)),
        pay2Date: cellToIso(pick(row, map.pay2Date)),
        pay2Amount: parseMoney(pick(row, map.pay2Amount)),
        status: cellText(pick(row, map.status)),
        nextReview: cellToIso(pick(row, map.nextReview)),
        comment: cellText(pick(row, map.comment)),
        origin: cellText(pick(row, map.origin)),
        source: cellText(pick(row, map.source)),
        informedBy: cellText(pick(row, map.informedBy)),
        error,
      } satisfies ImportPreviewRow;
    })
    .filter((row): row is ImportPreviewRow => Boolean(row));
}

export function previewToRecords(rows: ImportPreviewRow[]): { cases: AbonoCase[]; receipts: AbonoReceipt[] } {
  const cases: AbonoCase[] = [];
  const receipts: AbonoReceipt[] = [];

  rows.forEach((row, index) => {
    if (row.error) return;
    const id = crypto.randomUUID();
    const importedTotal = (row.pay1Amount || 0) + (row.pay2Amount || 0);
    const importedStatus = asStatus(row.status);
    cases.push({
      id,
      registro: row.registro ?? index + 1,
      createdAt: '',
      addedBy: shortPersonName(row.addedBy),
      responsible: shortPersonName(row.responsible || row.addedBy),
      dueDate: row.dueDate,
      brand: row.brand,
      type: row.type,
      area: row.area,
      teamMotivo: row.teamMotivo,
      origin: asOrigin(row.origin),
      source: asSource(row.source),
      tradeTermId: null,
      informedBy: row.informedBy,
      expectedAmount: row.expectedAmount,
      communicatedAmount: row.communicatedAmount,
      status: importedTotal > 0
        ? statusAfterReceipts(importedStatus, row.expectedAmount, importedTotal)
        : (importedStatus || (isPablo(row.responsible || row.addedBy) ? '' : 'Pendiente')),
      nextReview: row.nextReview,
      comment: row.comment,
    });
    const payments = [
      { date: row.pay1Date, amount: row.pay1Amount },
      { date: row.pay2Date, amount: row.pay2Amount },
    ];
    payments.forEach((payment) => {
      if (!payment.amount || payment.amount === 0) return;
      receipts.push({
        id: crypto.randomUUID(),
        caseId: id,
        receivedAt: payment.date || todayIso(),
        amount: payment.amount,
        reference: '',
        comment: '',
      });
    });
  });

  return { cases, receipts };
}

export function abonosExportRows(cases: Array<{
  registro: number;
  createdAt: string;
  addedBy: string;
  responsible: string;
  dueDate: string | null;
  brand: string;
  type: string;
  area: string;
  teamMotivo: string;
  origin: string;
  source: string;
  tradeTermName: string | null;
  informedBy: string;
  expectedAmount: number | null;
  communicatedAmount: number | null;
  receivedTotal: number;
  pending: number;
  status: string;
  nextReview: string | null;
  comment: string;
}>) {
  const header = [
    'Registro',
    'Fecha de alta',
    'Añadido por',
    'Responsable de seguimiento',
    'Fecha prevista',
    'Empresa',
    'Tipo',
    'Área',
    'Equipo',
    'Origen',
    'Llegó por',
    'Nombre del correo',
    'Trade Term',
    'Importe previsto',
    'Importe comunicado',
    'Total liquidado',
    'Pendiente',
    'Estado',
    'Próxima revisión',
    'Comentario',
  ];
  const body = cases.map((row) => [
    row.registro,
    row.createdAt ? row.createdAt.slice(0, 10) : '',
    row.addedBy,
    row.responsible,
    row.dueDate || '',
    row.brand,
    row.type,
    row.area,
    row.teamMotivo,
    row.origin,
    row.source,
    row.informedBy,
    row.tradeTermName || '',
    row.expectedAmount ?? '',
    row.communicatedAmount ?? '',
    row.receivedTotal,
    row.pending,
    row.status,
    row.nextReview || '',
    row.comment,
  ]);
  return [header, ...body];
}

export function receiptsExportRows(cases: Array<{ registro: number; brand: string; id: string }>, receipts: AbonoReceipt[]) {
  const header = ['Registro', 'Empresa', 'Fecha recepción', 'Importe', 'Referencia', 'Comentario'];
  const byId = new Map(cases.map((row) => [row.id, row]));
  const body = receipts.map((receipt) => {
    const parent = byId.get(receipt.caseId);
    return [
      parent?.registro ?? '',
      parent?.brand ?? '',
      receipt.receivedAt,
      receipt.amount,
      receipt.reference,
      receipt.comment,
    ];
  });
  return [header, ...body];
}

export const ABONOS_TEMPLATE_HEADERS = [
  'Registro',
  'Empresa',
  'Tipo',
  'Área',
  'Equipo',
  'Origen',
  'Llegó por',
  'Nombre del correo',
  'Importe previsto',
  'Importe comunicado',
  'Fecha prevista',
  'Añadido por',
  'Responsable de seguimiento',
  'Estado',
  'Próxima revisión',
  'Comentario',
];

export const ABONOS_TEMPLATE_INSTRUCTIONS = [
  ['Plantilla de importación de abonos'],
  [''],
  ['Rellena la hoja Abonos y súbela en Importar. El registro es opcional; si falta, lo asigna la herramienta.'],
  [''],
  ['Empresa', 'Obligatoria. Adidas, Nike, Puma…'],
  ['Tipo', 'Credit Notes, VIK Cash, Fee Pro Clubs, Dto FRA, Off Invoice…'],
  ['Área', 'Solo B2B, Grassroots, Pro Clubs o Teamsports.'],
  ['Equipo', 'Levante, Mallorca, GAP Plan, Kings League…'],
  ['Origen', 'Puntual o Acuerdo.'],
  ['Llegó por', 'Correo, Teams, Reunión, Teléfono, WhatsApp, Excel u Otro. Opcional; sobre todo para las altas tuyas.'],
  ['Nombre del correo', 'Si llegó por correo: persona o asunto. En otro canal, quién te lo dijo.'],
  ['Importe previsto', 'Número. 15000 o 15.000,00'],
  ['Importe comunicado', 'Opcional. Importe que la marca dice haber pagado; Finanzas aún debe confirmarlo.'],
  ['Fecha prevista', 'dd/mm/aaaa. Si no sabes cuándo, déjala vacía.'],
  ['Añadido por', 'Cristóbal o Pablo. Si falta, entra vacío.'],
  ['Responsable de seguimiento', 'Cristóbal o Pablo. Si falta, se usa Añadido por.'],
  ['Estado', 'Pendiente / Pago comunicado / Liquidado parcialmente / Liquidado.'],
  ['Próxima revisión', 'Fecha en la que debe volver a aparecer en el panel.'],
  ['Filas de Pablo', 'Puedes dejar campos sin información vacíos. La aplicación los mostrará con un guion.'],
  ['Pagos', 'Los pagos parciales se registran después desde la ficha en la aplicación.'],
];

export function abonosTemplateRows(): unknown[][] {
  return [ABONOS_TEMPLATE_HEADERS, Array(ABONOS_TEMPLATE_HEADERS.length).fill('')];
}
