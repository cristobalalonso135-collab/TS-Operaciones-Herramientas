import {
  asOrigin,
  asSource,
  asStatus,
  asEstimated,
  abonoRequiredGaps,
  cellToIso,
  formatRequiredGaps,
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
  estimated: number | null;
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
  amountCondition: number | null;
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
  estimated: boolean | null;
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
  amountCondition: string;
  error: string | null;
  existing?: boolean;
}

const HEADER_ALIASES: Record<keyof ImportColumnMap, string[]> = {
  registro: ['registro', 'id', 'nº', 'n°'],
  dueDate: ['fecha prevista', 'fecha'],
  brand: ['marca', 'empresa'],
  type: ['tipo'],
  teamMotivo: ['equipo/motivo', 'equipo / motivo', 'equipo', 'motivo'],
  area: ['área', 'area'],
  addedBy: ['añadido por', 'anadido por', 'creado por'],
  responsible: ['responsable de seguimiento', 'responsable'],
  expectedAmount: ['importe previsto', 'previsto'],
  estimated: ['cálculo', 'calculo', 'real o estimado', 'importe real o estimado', 'tipo de importe', 'fijo', 'variable'],
  communicatedAmount: ['importe comunicado', 'importe comunicado por la marca'],
  pay1Date: ['fecha 1er pago', 'fecha 1er', 'fecha primer pago'],
  pay1Amount: ['importe 1er pago', 'importe 1er', 'importe primer pago'],
  pay2Date: ['fecha 2º pago', 'fecha 2o pago', 'fecha segundo pago'],
  pay2Amount: ['importe 2º pago', 'importe 2o pago', 'importe segundo pago'],
  status: ['estado'],
  nextReview: ['próxima revisión', 'proxima revisión', 'próxima revision', 'proxima revision'],
  comment: ['comentario', 'comentarios'],
  amountCondition: ['condición', 'condicion'],
  origin: ['origen'],
  source: ['canal', 'vino por', 'llegó por', 'llego por', 'conversación', 'conversacion'],
  informedBy: ['persona', 'nombre del correo', 'informado por'],
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

export function importPreviewError(row: Pick<ImportPreviewRow, 'brand' | 'area' | 'teamMotivo' | 'type' | 'expectedAmount' | 'estimated' | 'dueDate' | 'addedBy' | 'responsible' | 'source' | 'informedBy' | 'status'>): string | null {
  if (row.expectedAmount !== null && row.expectedAmount < 0) return 'El importe previsto no puede ser negativo.';
  return formatRequiredGaps(abonoRequiredGaps(row));
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

function findColumn(normalized: string[], keys: string[]): number | null {
  for (const key of keys) {
    const exact = normalized.findIndex((name) => name === key);
    if (exact >= 0) return exact;
  }
  let bestIndex = -1;
  let bestLength = 0;
  normalized.forEach((name, index) => {
    keys.forEach((key) => {
      if (key.length < 4 || !name.includes(key) || key.length <= bestLength) return;
      bestLength = key.length;
      bestIndex = index;
    });
  });
  return bestIndex >= 0 ? bestIndex : null;
}

export function guessColumnMap(header: unknown[]): ImportColumnMap {
  const normalized = header.map(normalizeHeader);
  const find = (keys: string[]) => findColumn(normalized, keys);
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
    estimated: find(HEADER_ALIASES.estimated),
    communicatedAmount: find(HEADER_ALIASES.communicatedAmount),
    pay1Date: find(HEADER_ALIASES.pay1Date),
    pay1Amount: find(HEADER_ALIASES.pay1Amount),
    pay2Date: find(HEADER_ALIASES.pay2Date),
    pay2Amount: find(HEADER_ALIASES.pay2Amount),
    status: find(HEADER_ALIASES.status),
    nextReview: find(HEADER_ALIASES.nextReview),
    comment: find(HEADER_ALIASES.comment),
    amountCondition: find(HEADER_ALIASES.amountCondition),
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
      const source = cellText(pick(row, map.source));
      const informedBy = cellText(pick(row, map.informedBy));
      const status = cellText(pick(row, map.status));
      const estimated = asEstimated(pick(row, map.estimated)) ?? (asStatus(status) === 'A cuenta' ? true : null);
      const error = importPreviewError({
        brand,
        area: areaRaw,
        teamMotivo,
        type,
        expectedAmount,
        estimated,
        dueDate,
        addedBy: shortPersonName(addedBy),
        responsible: shortPersonName(responsible),
        source,
        informedBy,
        status,
      });
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
        estimated,
        communicatedAmount: parseMoney(pick(row, map.communicatedAmount)),
        pay1Date: cellToIso(pick(row, map.pay1Date)),
        pay1Amount: parseMoney(pick(row, map.pay1Amount)),
        pay2Date: cellToIso(pick(row, map.pay2Date)),
        pay2Amount: parseMoney(pick(row, map.pay2Amount)),
        status,
        nextReview: cellToIso(pick(row, map.nextReview)),
        comment: cellText(pick(row, map.comment)),
        amountCondition: cellText(pick(row, map.amountCondition)),
        origin: cellText(pick(row, map.origin)),
        source,
        informedBy,
        error,
      } satisfies ImportPreviewRow;
    })
    .filter((row): row is ImportPreviewRow => Boolean(row));
}

export function previewToRecords(rows: ImportPreviewRow[]): { cases: AbonoCase[]; receipts: AbonoReceipt[] } {
  const cases: AbonoCase[] = [];
  const receipts: AbonoReceipt[] = [];

  rows.forEach((row, index) => {
    if (row.error || row.existing) return;
    const id = crypto.randomUUID();
    const importedTotal = (row.pay1Amount || 0) + (row.pay2Amount || 0);
    const importedStatus = asStatus(row.status);
    const estimated = row.estimated === true;
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
      amountMode: estimated ? 'Variable' : 'Fijo',
      amountCondition: row.amountCondition,
      communicatedAmount: row.communicatedAmount,
      status: importedTotal > 0
        ? statusAfterReceipts(importedStatus, row.expectedAmount, importedTotal, estimated)
        : (importedStatus || (isPablo(row.responsible || row.addedBy) ? '' : 'Pendiente')),
      nextReview: row.nextReview,
      comment: row.comment,
      estimated,
      attachments: [],
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

function gapOnly(error: string | null): boolean {
  return Boolean(error && (error.startsWith('Falta ') || error.startsWith('Faltan:')));
}

export function importRowBlocked(row: ImportPreviewRow): boolean {
  if (!row.error) return false;
  return !(row.existing && gapOnly(row.error));
}

export function applyImportRows(
  rows: ImportPreviewRow[],
  current: { cases: AbonoCase[]; receipts: AbonoReceipt[] },
  map: ImportColumnMap,
): { cases: AbonoCase[]; receipts: AbonoReceipt[]; updated: number; created: number } {
  const cases = current.cases.map((row) => ({ ...row, attachments: row.attachments.slice() }));
  const byRegistro = new Map(cases.map((row) => [row.registro, row]));
  let nextReg = cases.reduce((max, row) => Math.max(max, row.registro), 0) + 1;
  const paymentsMapped = map.pay1Amount !== null || map.pay2Amount !== null;
  const receipts = current.receipts.map((row) => ({ ...row }));
  const replacedIds = new Set<string>();
  const caseIdByKey = new Map<string, string>();
  const updatedIds = new Set<string>();
  let created = 0;

  rows.forEach((row) => {
    if (importRowBlocked(row)) return;
    const registro = row.registro && Number.isFinite(row.registro) ? row.registro : nextReg;
    const existing = byRegistro.get(registro);
    if (existing) {
      const merged = mergeImportedCase(existing, row, map);
      const index = cases.findIndex((item) => item.id === existing.id);
      if (index >= 0) cases[index] = merged;
      byRegistro.set(registro, merged);
      updatedIds.add(existing.id);
      caseIdByKey.set(row.key, existing.id);
      if (paymentsMapped) replacedIds.add(existing.id);
      return;
    }
    const id = crypto.randomUUID();
    const createdCase = caseFromImportRow(row, id, registro);
    cases.unshift(createdCase);
    byRegistro.set(createdCase.registro, createdCase);
    caseIdByKey.set(row.key, id);
    if (createdCase.registro >= nextReg) nextReg = createdCase.registro + 1;
    created += 1;
    if (paymentsMapped) replacedIds.add(id);
  });

  const keptReceipts = paymentsMapped
    ? receipts.filter((item) => !replacedIds.has(item.caseId))
    : receipts;
  const addedReceipts: AbonoReceipt[] = [];
  if (paymentsMapped) {
    rows.forEach((row) => {
      if (importRowBlocked(row)) return;
      const parentId = caseIdByKey.get(row.key);
      if (!parentId) return;
      const payments = [
        { date: row.pay1Date, amount: row.pay1Amount },
        { date: row.pay2Date, amount: row.pay2Amount },
      ];
      payments.forEach((payment) => {
        if (!payment.amount) return;
        addedReceipts.push({
          id: crypto.randomUUID(),
          caseId: parentId,
          receivedAt: payment.date || todayIso(),
          amount: payment.amount,
          reference: '',
          comment: '',
        });
      });
    });
  }

  return { cases, receipts: [...addedReceipts, ...keptReceipts], updated: updatedIds.size, created };
}

export interface ImportReceiptRow {
  registro: number;
  receivedAt: string | null;
  amount: number;
  reference: string;
  comment: string;
}

/** Lee la hoja Recepciones de una exportación de Abonos. */
export function parseReceiptsSheet(rows: unknown[][]): ImportReceiptRow[] {
  const headerIndex = rows.findIndex((row) => {
    const names = (row || []).map(normalizeHeader);
    return names.includes('registro') && names.some((name) => name.startsWith('importe'));
  });
  if (headerIndex < 0) return [];
  const header = rows[headerIndex].map(normalizeHeader);
  const col = (keys: string[]) => findColumn(header, keys);
  const registroCol = col(['registro']);
  const dateCol = col(['fecha recepción', 'fecha recepcion', 'fecha']);
  const amountCol = col(['importe']);
  const referenceCol = col(['referencia', 'nº abono', 'credit note']);
  const commentCol = col(['comentario', 'comentarios']);
  const out: ImportReceiptRow[] = [];
  rows.slice(headerIndex + 1).forEach((row) => {
    const registro = Number(pick(row, registroCol));
    const amount = parseMoney(pick(row, amountCol));
    if (!Number.isFinite(registro) || registro <= 0 || amount === null || amount === 0) return;
    out.push({
      registro,
      receivedAt: cellToIso(pick(row, dateCol)),
      amount,
      reference: cellText(pick(row, referenceCol)),
      comment: cellText(pick(row, commentCol)),
    });
  });
  return out;
}

/**
 * Cruza la hoja Recepciones con los pagos guardados.
 * Busca el pago por registro + importe (y fecha si coincide). Si lo encuentra, guarda referencia,
 * comentario y fecha del Excel; si no existe, lo crea. Nunca borra pagos.
 */
export function applyReceiptRows(
  cases: AbonoCase[],
  receipts: AbonoReceipt[],
  rows: ImportReceiptRow[],
): { receipts: AbonoReceipt[]; updated: number; added: number; skipped: number } {
  const next = receipts.map((item) => ({ ...item }));
  const caseByRegistro = new Map(cases.map((row) => [row.registro, row]));
  const used = new Set<string>();
  let updated = 0;
  let added = 0;
  let skipped = 0;
  const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.01;

  rows.forEach((row) => {
    const parent = caseByRegistro.get(row.registro);
    if (!parent) {
      skipped += 1;
      return;
    }
    const candidates = next.filter((item) => item.caseId === parent.id && !used.has(item.id) && sameAmount(item.amount, row.amount));
    const match = candidates.find((item) => row.receivedAt && item.receivedAt === row.receivedAt) || candidates[0];
    if (match) {
      used.add(match.id);
      const reference = row.reference || match.reference;
      const comment = row.comment || match.comment;
      const receivedAt = row.receivedAt || match.receivedAt;
      if (reference !== match.reference || comment !== match.comment || receivedAt !== match.receivedAt) {
        match.reference = reference;
        match.comment = comment;
        match.receivedAt = receivedAt;
        updated += 1;
      }
      return;
    }
    const createdReceipt: AbonoReceipt = {
      id: crypto.randomUUID(),
      caseId: parent.id,
      receivedAt: row.receivedAt || todayIso(),
      amount: row.amount,
      reference: row.reference,
      comment: row.comment,
    };
    used.add(createdReceipt.id);
    next.unshift(createdReceipt);
    added += 1;
  });

  return { receipts: next, updated, added, skipped };
}

function caseFromImportRow(row: ImportPreviewRow, id: string, registro: number): AbonoCase {
  const estimated = row.estimated === true;
  const importedTotal = (row.pay1Amount || 0) + (row.pay2Amount || 0);
  const importedStatus = asStatus(row.status);
  return {
    id,
    registro,
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
    amountMode: estimated ? 'Variable' : 'Fijo',
    amountCondition: row.amountCondition,
    communicatedAmount: row.communicatedAmount,
    status: importedTotal > 0
      ? statusAfterReceipts(importedStatus, row.expectedAmount, importedTotal, estimated)
      : (importedStatus || (isPablo(row.responsible || row.addedBy) ? '' : 'Pendiente')),
    nextReview: row.nextReview,
    comment: row.comment,
    estimated,
    attachments: [],
  };
}

function mergeImportedCase(current: AbonoCase, row: ImportPreviewRow, map: ImportColumnMap): AbonoCase {
  const incoming = caseFromImportRow(row, current.id, current.registro);
  const keepMode = map.estimated === null || row.estimated === null;
  const status = map.status === null || !asStatus(row.status) ? current.status : asStatus(row.status);
  return {
    ...current,
    addedBy: map.addedBy === null ? current.addedBy : (incoming.addedBy || current.addedBy),
    responsible: map.responsible === null ? current.responsible : (incoming.responsible || current.responsible),
    dueDate: map.dueDate === null ? current.dueDate : incoming.dueDate,
    brand: map.brand === null ? current.brand : (incoming.brand || current.brand),
    type: map.type === null ? current.type : (incoming.type || current.type),
    area: map.area === null ? current.area : (incoming.area || current.area),
    teamMotivo: map.teamMotivo === null ? current.teamMotivo : (incoming.teamMotivo || current.teamMotivo),
    origin: map.origin === null ? current.origin : incoming.origin,
    source: map.source === null ? current.source : incoming.source,
    informedBy: map.informedBy === null ? current.informedBy : incoming.informedBy,
    expectedAmount: map.expectedAmount === null ? current.expectedAmount : incoming.expectedAmount,
    communicatedAmount: map.communicatedAmount === null ? current.communicatedAmount : incoming.communicatedAmount,
    status,
    nextReview: map.nextReview === null ? current.nextReview : incoming.nextReview,
    comment: map.comment === null ? current.comment : incoming.comment,
    estimated: keepMode ? current.estimated : incoming.estimated,
    amountMode: keepMode ? current.amountMode : incoming.amountMode,
    attachments: current.attachments,
    tradeTermId: current.tradeTermId,
    amountCondition: map.amountCondition === null ? current.amountCondition : row.amountCondition,
    createdAt: current.createdAt,
  };
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
  estimated?: boolean | null;
  amountModeResolved?: string;
  amountConditionResolved?: string;
  communicatedAmount: number | null;
  receivedTotal: number;
  pending: number;
  status: string;
  nextReview: string | null;
  comment: string;
  documentos?: string;
}>) {
  const header = [
    'Registro',
    'Documentos',
    'Fecha de alta',
    'Añadido por',
    'Responsable de seguimiento',
    'Fecha prevista',
    'Marca',
    'Tipo',
    'Área',
    'Equipo',
    'Origen',
    'Canal',
    'Persona',
    'Trade Term',
    'Importe previsto',
    'Cálculo',
    'Condición',
    'Real o estimado',
    'Importe comunicado',
    'Total liquidado',
    'Pendiente',
    'Estado',
    'Próxima revisión',
    'Comentario',
  ];
  const body = cases.map((row) => [
    row.registro,
    row.documentos || '',
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
    row.amountModeResolved || '',
    row.amountConditionResolved || '',
    row.amountModeResolved === 'Variable' || row.estimated === true ? 'Estimado' : 'Real',
    row.communicatedAmount ?? '',
    row.receivedTotal,
    row.pending,
    row.status,
    row.nextReview || '',
    row.comment,
  ]);
  return [header, ...body];
}

export function documentsExportRows(files: Array<{ registro: number; fileName: string; path: string; originalName: string }>) {
  const header = ['Registro', 'Archivo', 'Ruta', 'Nombre original'];
  const body = files.map((file) => [file.registro, file.fileName, file.path, file.originalName]);
  return [header, ...body];
}

export const ABONOS_EXPORT_GUIDE = [
  ['Cómo leer esta descarga'],
  [''],
  ['Abonos.xlsx es el listado. La carpeta documentos contiene las capturas, PDF y Excel de cada abono.'],
  ['En la hoja Abonos, la columna Documentos indica los archivos de esa fila.'],
  ['El nombre empieza por el Registro: 12-1.jpg es el primer documento del abono 12; 12-2.pdf es el segundo.'],
  ['La hoja Documentos repite el cruce: Registro, archivo y el nombre con el que se adjuntó.'],
  ['Para comprobar si cuadra, compara marca, equipo, importe, estado y comentario de la fila con lo que dicen esos archivos.'],
];

export function receiptsExportRows(cases: Array<{ registro: number; brand: string; id: string }>, receipts: AbonoReceipt[]) {
  const header = ['Registro', 'Marca', 'Fecha recepción', 'Importe', 'Referencia', 'Comentario'];
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
  'Marca',
  'Tipo',
  'Área',
  'Equipo',
  'Origen',
  'Canal',
  'Persona',
  'Importe previsto',
  'Cálculo',
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
  ['Marca', 'Obligatoria. Adidas, Nike, Puma…'],
  ['Tipo', 'Obligatorio. Credit Notes, VIK Cash, Fee Pro Clubs, Dto FRA (factura), Dto pedido, Off Invoice…'],
  ['Área', 'Obligatoria. Solo B2B, Grassroots, Pro Clubs o Teamsports.'],
  ['Equipo', 'Obligatorio. Levante, Mallorca, GAP Plan, Kings League…'],
  ['Origen', 'Puntual o Acuerdo. Opcional.'],
  ['Canal', 'Obligatorio. Correo, Teams, Conversación, Excel u Otro.'],
  ['Persona', 'Obligatoria. Quién te lo dijo o de la marca. El detalle (asunto, día, pedido) va en Comentario.'],
  ['Importe previsto', 'Obligatorio. Número con decimales. 300,44 o 300.44 o 15.000,00'],
  ['Cálculo', 'Obligatorio. Fijo (euro cerrado) o Variable (depende de una condición; si entra dinero queda a cuenta).'],
  ['Importe comunicado', 'Opcional. Importe que la marca dice haber pagado; Finanzas aún debe confirmarlo.'],
  ['Fecha prevista', 'Obligatoria. dd/mm/aaaa.'],
  ['Añadido por', 'Obligatorio. Cristóbal o Pablo.'],
  ['Responsable de seguimiento', 'Obligatorio. Cristóbal o Pablo. Si falta, se usa Añadido por.'],
  ['Estado', 'Obligatorio. Pendiente / Pago comunicado / Liquidado parcialmente / Liquidado / Exceso / A cuenta. A cuenta sale solo si el cálculo es Variable y ya ha entrado dinero.'],
  ['Próxima revisión', 'Fecha en la que debe volver a aparecer en el panel. Opcional.'],
  ['Comentario', 'Notas: nombre del correo, día de la conversación, nº de pedido SAP…'],
  ['Capturas', 'Las fotos o pantallazos de confirmación se adjuntan en la ficha, no en el Excel.'],
  ['Filas incompletas', 'Si falta un campo obligatorio, esa fila no se importa.'],
  ['Pagos', 'Los pagos parciales se registran después desde la ficha en la aplicación.'],
];

export function abonosTemplateRows(): unknown[][] {
  return [ABONOS_TEMPLATE_HEADERS, Array(ABONOS_TEMPLATE_HEADERS.length).fill('')];
}
