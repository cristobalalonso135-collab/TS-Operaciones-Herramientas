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
}

export interface EstadoState {
  casos: EstadoCaso[];
}

export const ESTADO_TIPOLOGIAS = [
  'Web',
  'Cupón',
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
  return { ingresos, gastos, resultado: ingresos - gastos };
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

export function parseEuro(value: string): number | null {
  const text = value.replace(/\s/g, '').replace(/€/gi, '');
  if (!text) return null;
  const normalized = text.includes(',') && text.includes('.')
    ? text.replace(/\./g, '').replace(',', '.')
    : text.includes(',')
      ? text.replace(',', '.')
      : /^\d{1,3}(\.\d{3})+$/.test(text)
        ? text.replace(/\./g, '')
        : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
