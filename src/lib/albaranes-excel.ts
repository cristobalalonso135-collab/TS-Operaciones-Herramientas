import {
  cellToIso,
  extractSerie,
  parseAmount,
  type Agent,
  type AlbaranRow,
  type Colectivo,
  newId,
} from '@/lib/albaranes-model';

function normalizeHeader(value: unknown): string {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');
}

function cellText(value: unknown): string {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim();
}

function pick(row: unknown[], index: number | null): unknown {
  if (index === null || index < 0) return '';
  return row[index];
}

function findCol(header: string[], aliases: string[]): number | null {
  for (const alias of aliases) {
    const exact = header.findIndex((name) => name === alias);
    if (exact >= 0) return exact;
  }
  return null;
}

export function detectHeaderRow(rows: unknown[][], required: string[]): number {
  const index = rows.findIndex((row) => {
    const joined = (row || []).map(normalizeHeader).join(' | ');
    return required.every((item) => joined.includes(item));
  });
  return index >= 0 ? index : 0;
}

export function parseAlbaranesSheet(rows: unknown[][]): AlbaranRow[] {
  if (!rows.length) return [];
  const headerIndex = detectHeaderRow(rows, ['albar']);
  const header = (rows[headerIndex] || []).map(normalizeHeader);
  const col = {
    id: findCol(header, ['id']),
    albaran: findCol(header, ['albarán', 'albaran']),
    serie: findCol(header, ['serie']),
    fechaAlbaran: findCol(header, ['fecha albarán', 'fecha albaran']),
    almacen: findCol(header, ['almacén origen', 'almacen origen']),
    agente: findCol(header, ['agente']),
    estado: findCol(header, ['estado']),
    idEstado: findCol(header, ['id_estado', 'id estado']),
    fechaEstado: findCol(header, ['fecha estado']),
    colectivo: findCol(header, ['colectivo']),
    total: findCol(header, ['total']),
  };
  const seen = new Set<string>();
  const out: AlbaranRow[] = [];
  rows.slice(headerIndex + 1).forEach((row, index) => {
    const albaran = cellText(pick(row, col.albaran));
    const id = cellText(pick(row, col.id)) || albaran;
    if (!albaran && !id) return;
    const key = id || `row-${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      id: key,
      albaran: albaran || key,
      serie: extractSerie(albaran || key, cellText(pick(row, col.serie))),
      fechaAlbaran: cellToIso(pick(row, col.fechaAlbaran)),
      almacenOrigen: cellText(pick(row, col.almacen)),
      agente: cellText(pick(row, col.agente)),
      estado: cellText(pick(row, col.estado)),
      idEstado: cellText(pick(row, col.idEstado)),
      fechaEstado: cellToIso(pick(row, col.fechaEstado)),
      colectivo: cellText(pick(row, col.colectivo)),
      importe: parseAmount(pick(row, col.total)),
    });
  });
  return out;
}

function truthy(value: unknown): boolean {
  const text = cellText(value).toLocaleLowerCase('es');
  if (!text) return true;
  return !['no', 'n', '0', 'false', 'inactivo'].includes(text);
}

export function parseAgentesSheet(rows: unknown[][]): Agent[] {
  if (!rows.length) return [];
  const headerIndex = detectHeaderRow(rows, ['agente']);
  const header = (rows[headerIndex] || []).map(normalizeHeader);
  const col = {
    id: findCol(header, ['idagente', 'id agente']),
    erp: findCol(header, ['agenteerp', 'agente erp', 'agente']),
    nombre: findCol(header, ['nombre']),
    email: findCol(header, ['email', 'correo', 'mail']),
    supervisor: findCol(header, ['supervisor']),
    activo: findCol(header, ['activo']),
  };
  return rows.slice(headerIndex + 1).flatMap((row) => {
    const agenteErp = cellText(pick(row, col.erp));
    const email = cellText(pick(row, col.email));
    if (!agenteErp && !email) return [];
    return [{
      id: cellText(pick(row, col.id)) || newId('ag'),
      agenteErp,
      nombre: cellText(pick(row, col.nombre)) || agenteErp,
      email,
      supervisor: cellText(pick(row, col.supervisor)),
      activo: truthy(pick(row, col.activo)),
    }];
  });
}

export function parseColectivosSheet(rows: unknown[][]): Colectivo[] {
  if (!rows.length) return [];
  const headerIndex = detectHeaderRow(rows, ['colectivo']);
  const header = (rows[headerIndex] || []).map(normalizeHeader);
  const col = {
    codigo: findCol(header, ['codigocolectivo', 'codigo colectivo', 'código colectivo', 'codigo', 'colectivo']),
    nombre: findCol(header, ['nombrecolectivo', 'nombre colectivo', 'nombre']),
    idAgente: findCol(header, ['idagenteresponsable', 'id agente', 'responsable', 'agente']),
    activo: findCol(header, ['activo']),
  };
  return rows.slice(headerIndex + 1).flatMap((row) => {
    const codigo = cellText(pick(row, col.codigo));
    if (!codigo) return [];
    return [{
      id: newId('col'),
      codigo,
      nombre: cellText(pick(row, col.nombre)) || codigo,
      idAgente: cellText(pick(row, col.idAgente)),
      activo: truthy(pick(row, col.activo)),
    }];
  });
}

export function pickSheet(sheets: Record<string, unknown[][]>, aliases: string[]): unknown[][] | null {
  const names = Object.keys(sheets);
  const found = names.find((name) => aliases.some((alias) => normalizeHeader(name).includes(alias)));
  return found ? sheets[found] : null;
}

export const AGENTES_TEMPLATE: unknown[][] = [
  ['IdAgente', 'AgenteERP', 'Nombre', 'Email', 'Supervisor', 'Activo'],
  ['AG-001', 'Ana Pérez', 'Ana Pérez', 'ana@teamsports.es', '', 'Sí'],
  ['AG-002', 'Internet', 'Internet', '', '', 'No'],
];

export const COLECTIVOS_TEMPLATE: unknown[][] = [
  ['CodigoColectivo', 'NombreColectivo', 'IdAgenteResponsable', 'Activo'],
  ['CLUB001', 'Club ejemplo', 'AG-001', 'Sí'],
];
