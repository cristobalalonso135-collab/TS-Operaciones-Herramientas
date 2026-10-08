export type MovimientoLado = 'ingreso' | 'gasto';

export interface EstadoMovimiento {
  id: string;
  lado: MovimientoLado;
  tipologia: string;
  concepto: string;
  importe: number;
  createdAt: string;
}

export interface EstadoCaso {
  id: string;
  nombre: string;
  movimientos: EstadoMovimiento[];
  createdAt: string;
  escenarioIngresos: number | null;
  escenarioGastos: number | null;
}

export interface EstadoState {
  casos: EstadoCaso[];
}

export const ESTADO_TIPOLOGIAS = [
  'Web',
  'Cupón',
  'Generados web',
  'Club',
  'Coste',
  'Descuento',
  'Abono',
  'DVC',
  'Factura',
  'Off',
] as const;

export function emptyEstadoState(): EstadoState {
  return { casos: [] };
}

export function emptyCaso(nombre: string): EstadoCaso {
  return {
    id: crypto.randomUUID(),
    nombre: nombre.trim(),
    movimientos: [],
    createdAt: new Date().toISOString(),
    escenarioIngresos: null,
    escenarioGastos: null,
  };
}

export function emptyMovimiento(lado: MovimientoLado, tipologia: string, concepto: string, importe: number): EstadoMovimiento {
  return {
    id: crypto.randomUUID(),
    lado,
    tipologia: tipologia.trim(),
    concepto: concepto.trim(),
    importe,
    createdAt: new Date().toISOString(),
  };
}

export function isEstadoState(value: unknown): value is EstadoState {
  if (!value || typeof value !== 'object') return false;
  return Array.isArray((value as EstadoState).casos);
}

export function asEstadoState(value: unknown): EstadoState {
  if (!isEstadoState(value)) return emptyEstadoState();
  return {
    casos: value.casos.map((caso) => ({
      id: String(caso.id || crypto.randomUUID()),
      nombre: String(caso.nombre || '').trim(),
      createdAt: String(caso.createdAt || new Date().toISOString()),
      escenarioIngresos: parseOptionalNumber((caso as EstadoCaso).escenarioIngresos),
      escenarioGastos: parseOptionalNumber((caso as EstadoCaso).escenarioGastos),
      movimientos: Array.isArray(caso.movimientos)
        ? caso.movimientos.map((mov) => ({
            id: String(mov.id || crypto.randomUUID()),
            lado: mov.lado === 'gasto' ? 'gasto' : 'ingreso',
            tipologia: String(mov.tipologia || '').trim(),
            concepto: String(mov.concepto || '').trim(),
            importe: Number.isFinite(Number(mov.importe)) ? Number(mov.importe) : 0,
            createdAt: String(mov.createdAt || new Date().toISOString()),
          }))
        : [],
    })),
  };
}

export function casoTotales(caso: EstadoCaso) {
  const ingresos = caso.movimientos
    .filter((mov) => mov.lado === 'ingreso')
    .reduce((sum, mov) => sum + mov.importe, 0);
  const gastos = caso.movimientos
    .filter((mov) => mov.lado === 'gasto')
    .reduce((sum, mov) => sum + mov.importe, 0);
  const beneficio = ingresos - gastos;
  const margen = margenSobreIngresos(ingresos, beneficio);
  return { ingresos, gastos, beneficio, margen, resultado: beneficio };
}

export function escenarioTotales(caso: EstadoCaso) {
  if (caso.escenarioIngresos == null && caso.escenarioGastos == null) return null;
  const ingresos = caso.escenarioIngresos ?? 0;
  const gastos = caso.escenarioGastos ?? 0;
  const beneficio = ingresos - gastos;
  return {
    ingresos: caso.escenarioIngresos,
    gastos: caso.escenarioGastos,
    beneficio: caso.escenarioIngresos != null && caso.escenarioGastos != null ? beneficio : null,
    margen:
      caso.escenarioIngresos != null && caso.escenarioGastos != null
        ? margenSobreIngresos(ingresos, beneficio)
        : null,
  };
}

function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function margenSobreIngresos(ingresos: number, beneficio: number): number | null {
  if (ingresos === 0) return null;
  return beneficio / ingresos;
}

export function tipologiasUsadas(state: EstadoState): string[] {
  const seen = new Set<string>(ESTADO_TIPOLOGIAS);
  for (const caso of state.casos) {
    for (const mov of caso.movimientos) {
      if (mov.tipologia) seen.add(mov.tipologia);
    }
  }
  return Array.from(seen);
}

export function formatEuro(value: number): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

export function formatSignedEuro(value: number): string {
  const abs = formatEuro(Math.abs(value));
  if (value > 0) return `+ ${abs}`;
  if (value < 0) return `− ${abs}`;
  return formatEuro(0);
}

export function formatSignedPct(value: number): string {
  const abs = formatPct(Math.abs(value));
  if (value > 0) return `+ ${abs}`;
  if (value < 0) return `− ${abs}`;
  return formatPct(0);
}

export function parseEuro(value: string): number | null {
  const text = value.replace(/\s/g, '').replace(/€/gi, '');
  if (!text || text === '-' || text === ',' || text === '.' || text === '-,' || text === '-.') return null;
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const normalized = unsigned.includes(',') && unsigned.includes('.')
    ? unsigned.replace(/\./g, '').replace(',', '.')
    : unsigned.includes(',')
      ? unsigned.replace(',', '.')
      : /^\d{1,3}(\.\d{3})+$/.test(unsigned)
        ? unsigned.replace(/\./g, '')
        : unsigned;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}
