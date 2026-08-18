'use client';

import { useMemo, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import { normalizeText } from '@/lib/business-classification';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, FileSpreadsheet } from 'lucide-react';

export interface DebtSalesLine {
  zona: string;
  area: string;
  medio?: string;
  monthIndex: number | null;
  facturacion: number;
}

interface DeudaTrackingViewProps {
  salesLines?: DebtSalesLine[];
}

interface DebtClient {
  zonaRaw: string;
  zona: string;
  agente: string;
  cliente: string;
  idCliente: string;
  limite: number;
  total: number;
  vencida: number;
  noVencida: number;
  pctLimite: number | null;
}

type ZonaSortKey = 'zona' | 'clientes' | 'total' | 'vencida' | 'noVencida' | 'pctVencida' | 'dias';

const ZONA_ORDER = [
  'Norte',
  'Centro-Sur',
  'Levante',
  'Portugal',
  'Francia',
  'Italia',
  'B2B',
  'B2B Reps',
  'Pro Clubs',
  'Jurídico',
  'Reps',
  'Sin zona',
];

const ZONA_MAP: Record<string, string> = {
  eqi_norte: 'Norte',
  eqi_centro: 'Centro-Sur',
  eqi_levant: 'Levante',
  eqi_pt: 'Portugal',
  eqi_fr: 'Francia',
  eqi_it: 'Italia',
  eqi_b2b: 'B2B',
  eqi_b2brep: 'B2B Reps',
  eqi_juridi: 'Jurídico',
  'pro clubs': 'Pro Clubs',
  eqi: 'Sin zona',
  repre: 'Reps',
};

function cellPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return String(value).replace(/\u00a0/g, ' ').trim() !== '';
}

function parseAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!cellPresent(value)) return 0;
  const raw = String(value).replace(/€/g, '').replace(/%/g, '').replace(/\s/g, '').trim();
  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  const normalized = hasComma && hasDot
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.');
  return Number(normalized) || 0;
}

function normalizeZona(value: unknown): string {
  const raw = String(value ?? '').replace(/\u00a0/g, ' ').trim();
  const key = normalizeText(raw).replace(/\s+/g, '_');
  if (ZONA_MAP[key]) return ZONA_MAP[key];
  if (ZONA_MAP[normalizeText(raw)]) return ZONA_MAP[normalizeText(raw)];
  return raw || 'Sin zona';
}

function isJunkRow(row: unknown[]): boolean {
  const first = normalizeText(row[0]);
  if (!first) return true;
  if (first === 'total' || first === 'zona') return true;
  if (first.includes('filtro') || first.includes('fecha actualizacion')) return true;
  return false;
}

function parseSnapshotDate(rows: unknown[][]): Date | null {
  for (const row of rows) {
    const text = row.map((cell) => String(cell ?? '')).join(' ');
    const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (match && /actualiz/i.test(text)) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      const yearRaw = Number(match[3]);
      const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
      return new Date(year, month - 1, day);
    }
  }
  return null;
}

function daysSinceApril(asOf: Date): number {
  const fyStartYear = asOf.getMonth() >= 3 ? asOf.getFullYear() : asOf.getFullYear() - 1;
  const start = new Date(fyStartYear, 3, 1);
  return Math.max(1, Math.round((asOf.getTime() - start.getTime()) / 86400000) + 1);
}

function findHeader(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.some((alias) => {
    const needle = normalizeText(alias);
    return header === needle || header.includes(needle);
  }));
}

function pickDebtSheet(sheets: Record<string, unknown[][]>): unknown[][] {
  const names = Object.keys(sheets);
  if (names.length === 0) return [];
  const preferred = names.find((name) => {
    const key = normalizeText(name);
    return key === 'export' || key.includes('deuda') || key.includes('export');
  });
  if (preferred) return sheets[preferred] || [];
  const withHeaders = names.find((name) => (
    (sheets[name] || []).some((row) => row.some((cell) => {
      const header = normalizeText(cell);
      return header.includes('deuda total') || header === 'zona';
    }))
  ));
  return sheets[withHeaders || names[0]] || [];
}

function parseDebtData(rows: unknown[][]): { clients: DebtClient[]; snapshot: Date | null } {
  if (!rows.length) throw new Error('El archivo de deuda está vacío.');
  const headerIndex = rows.findIndex((row) => row.some((cell) => {
    const header = normalizeText(cell);
    return header === 'zona' || header.includes('deuda total');
  }));
  if (headerIndex < 0) throw new Error('No reconozco el archivo. ¿Trae Zona, Deuda total, Deuda vencida y Deuda no vencida?');

  const headers = (rows[headerIndex] || []).map((cell) => normalizeText(cell));
  const colMap = {
    zona: findHeader(headers, ['zona']),
    agente: findHeader(headers, ['agente']),
    cliente: findHeader(headers, ['nombre cliente', 'cliente']),
    id: findHeader(headers, ['id cliente', 'id']),
    limite: findHeader(headers, ['limite credito', 'limite']),
    total: findHeader(headers, ['deuda total']),
    vencida: findHeader(headers, ['deuda vencida']),
    noVencida: findHeader(headers, ['deuda no vencida']),
    pctLimite: findHeader(headers, ['% limite', 'limite']),
  };
  if (colMap.zona < 0 || colMap.total < 0) {
    throw new Error('Faltan columnas: Zona o Deuda total.');
  }

  const clients = rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cellPresent(cell)) && !isJunkRow(row))
    .map((row) => {
      const zonaRaw = String(row[colMap.zona] ?? '').trim();
      const total = parseAmount(row[colMap.total]);
      const vencida = colMap.vencida >= 0 ? parseAmount(row[colMap.vencida]) : 0;
      const noVencida = colMap.noVencida >= 0 ? parseAmount(row[colMap.noVencida]) : 0;
      const limite = colMap.limite >= 0 ? parseAmount(row[colMap.limite]) : 0;
      const pctLimiteRaw = colMap.pctLimite >= 0 ? parseAmount(row[colMap.pctLimite]) : null;
      return {
        zonaRaw,
        zona: normalizeZona(zonaRaw),
        agente: colMap.agente >= 0 ? String(row[colMap.agente] ?? '').trim() : '',
        cliente: colMap.cliente >= 0 ? String(row[colMap.cliente] ?? '').trim() : '',
        idCliente: colMap.id >= 0 ? String(row[colMap.id] ?? '').trim() : '',
        limite,
        total,
        vencida,
        noVencida,
        pctLimite: pctLimiteRaw === null ? null : Math.abs(pctLimiteRaw) <= 2 && pctLimiteRaw !== 0 ? pctLimiteRaw * 100 : pctLimiteRaw,
      };
    })
    .filter((client) => client.total !== 0 || client.vencida !== 0 || client.noVencida !== 0);

  if (clients.length === 0) throw new Error('No he encontrado clientes con deuda.');
  return { clients, snapshot: parseSnapshotDate(rows) };
}

function salesForZona(sales: DebtSalesLine[], zona: string): number {
  const key = normalizeText(zona);
  return sales.reduce((sum, line) => {
    const lineZona = normalizeText(line.zona);
    const lineArea = normalizeText(line.area);
    if (key === 'italia') {
      if (lineZona.includes('italia')) return sum + line.facturacion;
      return sum;
    }
    if (key === 'b2b reps') {
      if (lineArea === 'b2b' && normalizeText(line.medio) === 'b2b reps') return sum + line.facturacion;
      return sum;
    }
    if (key === 'b2b') {
      if (lineArea === 'b2b' && normalizeText(line.medio) !== 'b2b reps') return sum + line.facturacion;
      return sum;
    }
    if (key === 'pro clubs') {
      if (lineArea === 'pro clubs') return sum + line.facturacion;
      return sum;
    }
    if (lineZona === key) return sum + line.facturacion;
    return sum;
  }, 0);
}

function formatCurrency(value: number): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
}

function formatAbsPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function formatDays(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('de-DE', { maximumFractionDigits: 0 })} días`;
}

function vencidaTone(pct: number | null): string {
  if (pct === null) return 'text-[var(--text-muted)]';
  if (pct >= 40) return 'text-[var(--danger)]';
  if (pct >= 20) return 'text-[var(--warning)]';
  return 'text-[var(--success)]';
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</p>
      <p className={`mt-2 font-display text-2xl font-semibold tabular-nums ${tone || 'text-[var(--text-primary)]'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--text-secondary)]">{hint}</p>}
    </div>
  );
}

export default function DeudaTrackingView({ salesLines = [] }: DeudaTrackingViewProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<DebtClient[]>([]);
  const [snapshot, setSnapshot] = useState<Date | null>(null);
  const [sort, setSort] = useState<{ key: ZonaSortKey; direction: 'asc' | 'desc' }>({ key: 'vencida', direction: 'desc' });

  const handleWorkbookLoaded = (sheets: Record<string, unknown[][]>, name: string) => {
    try {
      const parsed = parseDebtData(pickDebtSheet(sheets));
      setClients(parsed.clients);
      setSnapshot(parsed.snapshot);
      setFileName(name);
      setError(null);
    } catch (err) {
      setClients([]);
      setSnapshot(null);
      setFileName(null);
      setError(err instanceof Error ? err.message : 'No he podido leer el archivo.');
    }
  };

  const asOf = snapshot ?? new Date();
  const daysOpen = daysSinceApril(asOf);
  const hasSales = salesLines.some((line) => line.facturacion !== 0);
  const ytdSales = salesLines.reduce((sum, line) => sum + line.facturacion, 0);

  const totals = useMemo(() => {
    const total = clients.reduce((sum, client) => sum + client.total, 0);
    const vencida = clients.reduce((sum, client) => sum + client.vencida, 0);
    const noVencida = clients.reduce((sum, client) => sum + client.noVencida, 0);
    const juridico = clients
      .filter((client) => client.zona === 'Jurídico')
      .reduce((sum, client) => sum + client.total, 0);
    const operativa = total - juridico;
    const pctVencida = total === 0 ? null : (vencida / total) * 100;
    const daily = hasSales && daysOpen > 0 ? ytdSales / daysOpen : null;
    const dias = daily && daily !== 0 ? operativa / daily : null;
    const pctYtd = hasSales && ytdSales !== 0 ? (operativa / ytdSales) * 100 : null;
    return { total, vencida, noVencida, juridico, operativa, pctVencida, daily, dias, pctYtd };
  }, [clients, daysOpen, hasSales, ytdSales]);

  const zonaRows = useMemo(() => {
    const grouped = new Map<string, { clientes: number; total: number; vencida: number; noVencida: number }>();
    clients.forEach((client) => {
      const current = grouped.get(client.zona) ?? { clientes: 0, total: 0, vencida: 0, noVencida: 0 };
      current.clientes += 1;
      current.total += client.total;
      current.vencida += client.vencida;
      current.noVencida += client.noVencida;
      grouped.set(client.zona, current);
    });
    return Array.from(grouped.entries()).map(([zona, block]) => {
      const sales = hasSales ? salesForZona(salesLines, zona) : 0;
      const daily = sales > 0 && daysOpen > 0 ? sales / daysOpen : null;
      const dias = daily ? block.total / daily : null;
      const pctVencida = block.total === 0 ? null : (block.vencida / block.total) * 100;
      return { zona, ...block, sales, dias, pctVencida };
    }).sort((a, b) => {
      if (sort.key === 'zona') {
        const orderA = ZONA_ORDER.indexOf(a.zona);
        const orderB = ZONA_ORDER.indexOf(b.zona);
        const base = (orderA < 0 ? 99 : orderA) - (orderB < 0 ? 99 : orderB) || a.zona.localeCompare(b.zona, 'es');
        return sort.direction === 'asc' ? base : -base;
      }
      const pick = (row: typeof a) => (
        sort.key === 'clientes' ? row.clientes
          : sort.key === 'total' ? row.total
            : sort.key === 'vencida' ? row.vencida
              : sort.key === 'noVencida' ? row.noVencida
                : sort.key === 'pctVencida' ? row.pctVencida
                  : row.dias
      );
      const left = pick(a);
      const right = pick(b);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      const result = Number(left) - Number(right);
      return sort.direction === 'asc' ? result : -result;
    });
  }, [clients, daysOpen, hasSales, salesLines, sort]);

  const topVencida = useMemo(() => (
    [...clients].sort((a, b) => b.vencida - a.vencida).slice(0, 15)
  ), [clients]);

  const updateSort = (key: ZonaSortKey) => {
    setSort((prev) => (
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'zona' ? 'asc' : 'desc' }
    ));
  };

  const downloadZonas = () => {
    const header = ['Zona', 'Clientes', 'Deuda total', 'Vencida', 'No vencida', '% vencida', 'Fact. YTD zona', 'Días de venta'];
    const csv = [header, ...zonaRows.map((row) => [
      row.zona,
      row.clientes,
      row.total,
      row.vencida,
      row.noVencida,
      row.pctVencida,
      row.sales || '',
      row.dias,
    ])].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'deuda_zonas.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const snapshotLabel = snapshot
    ? snapshot.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'hoy';

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
        <FileUpload
          inputId="tracking-deuda-input"
          label="Excel de deuda (Zona, Cliente, Deuda total, Vencida, No vencida, Límite)"
          onFileLoaded={() => undefined}
          onWorkbookLoaded={handleWorkbookLoaded}
          keepDropzone
        />
        {fileName && (
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            Cargado: {fileName} · foto del {snapshotLabel} · {clients.length.toLocaleString('de-DE')} clientes · {daysOpen} días desde el 1 de abril
            {hasSales ? ' · cruzado con facturación Teamsports' : ' · sube Teamsports en YTD para ver los días de venta'}
          </p>
        )}
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div>
      )}

      {clients.length === 0 && !error && (
        <section className="rounded-lg border border-dashed border-[var(--border)] bg-white/60 p-8 text-center">
          <FileSpreadsheet className="mx-auto h-9 w-9 text-[var(--text-muted)]" />
          <p className="mt-3 text-sm font-medium">Sube el Excel de deuda. EQI_NORTE, EQI_CENTRO, EQI_IT… los paso a las zonas de siempre.</p>
        </section>
      )}

      {clients.length > 0 && (
        <>
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <p className="text-sm text-[var(--text-secondary)]">
              Tres números: lo que te deben, cuánto de eso ya está fuera de plazo, y a cuántos días de venta equivale (sin jurídico).
              Lo <span className="font-semibold text-[var(--danger)]">vencido</span> es el riesgo. Lo no vencido todavía está en plazo comercial.
            </p>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Deuda viva"
              value={formatCurrency(totals.total)}
              hint={`${clients.length.toLocaleString('de-DE')} clientes · foto ${snapshotLabel}`}
            />
            <StatCard
              label="Vencida · el riesgo"
              value={formatCurrency(totals.vencida)}
              hint={`${formatAbsPercent(totals.pctVencida)} de la deuda viva`}
              tone={vencidaTone(totals.pctVencida)}
            />
            <StatCard
              label="No vencida · plazo comercial"
              value={formatCurrency(totals.noVencida)}
              hint="Todavía en fecha. No es un problema de cobro."
            />
            <StatCard
              label="Equivale a"
              value={formatDays(totals.dias)}
              hint={hasSales
                ? `de venta desde el 1 de abril, sin jurídico${totals.juridico ? ` (${formatCurrency(totals.juridico)} en abogados)` : ''}. Facturación YTD ${formatCurrency(ytdSales)}.`
                : 'Sube Teamsports en YTD para calcular los días de venta'}
              tone={totals.dias !== null && totals.dias > 60 ? 'text-[var(--danger)]' : totals.dias !== null && totals.dias > 40 ? 'text-[var(--warning)]' : undefined}
            />
          </section>

          <section>
            <div className="mb-3">
              <p className="text-sm font-semibold">Zonas</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                EQI_IT = Italia (no parte Norte / Centro-Sur). Jurídico va aparte: es deuda ya en abogados.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {zonaRows.map((row) => (
                <div key={row.zona} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-sm font-semibold">{row.zona}</p>
                    <p className={`text-[11px] font-semibold ${vencidaTone(row.pctVencida)}`}>
                      {formatAbsPercent(row.pctVencida)} vencida
                    </p>
                  </div>
                  <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{formatCurrency(row.total)}</p>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    {row.clientes.toLocaleString('de-DE')} clientes · vencida {formatCurrency(row.vencida)} · no vencida {formatCurrency(row.noVencida)}
                  </p>
                  <p className="mt-3 text-sm font-semibold tabular-nums">
                    {formatDays(row.dias)}
                    <span className="ml-1 text-[11px] font-medium text-[var(--text-muted)]">de venta desde abril</span>
                  </p>
                  {hasSales && row.sales > 0 && (
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">Facturación YTD zona {formatCurrency(row.sales)}</p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Detalle por zona</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Pincha una columna para ordenar.</p>
              </div>
              <button
                type="button"
                onClick={downloadZonas}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent)]"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar zonas
              </button>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead className="bg-[var(--bg-soft)] text-xs text-[var(--text-secondary)]">
                  <tr>
                    {([
                      ['zona', 'Zona', 'left'],
                      ['clientes', 'Clientes', 'right'],
                      ['total', 'Deuda €', 'right'],
                      ['vencida', 'Vencida €', 'right'],
                      ['noVencida', 'No vencida €', 'right'],
                      ['pctVencida', '% vencida', 'right'],
                      ['dias', 'Días venta', 'right'],
                    ] as const).map(([key, label, align]) => {
                      const active = sort.key === key;
                      const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
                      return (
                        <th key={key} className="border-b border-[var(--border)] px-3 py-2 font-medium">
                          <button
                            type="button"
                            onClick={() => updateSort(key)}
                            className={`flex w-full items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}
                          >
                            <span>{label}</span>
                            <Icon className={`h-3 w-3 ${active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`} />
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {zonaRows.map((row) => (
                    <tr key={row.zona} className="border-b border-[var(--border)]">
                      <td className="px-3 py-2">{row.zona}</td>
                      <td className="px-3 py-2 text-right font-mono">{row.clientes.toLocaleString('de-DE')}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.total)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${vencidaTone(row.pctVencida)}`}>{formatCurrency(row.vencida)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.noVencida)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${vencidaTone(row.pctVencida)}`}>{formatAbsPercent(row.pctVencida)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatDays(row.dias)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <p className="text-sm font-semibold">Top 15 por deuda vencida</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Ahí está el riesgo de cobro, no en el total.</p>
            <div className="mt-3 overflow-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead className="bg-[var(--bg-soft)] text-xs text-[var(--text-secondary)]">
                  <tr>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-left font-medium">Cliente</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-left font-medium">Zona</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-left font-medium">Agente</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Total</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Vencida</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">No vencida</th>
                  </tr>
                </thead>
                <tbody>
                  {topVencida.map((client) => (
                    <tr key={`${client.idCliente}-${client.cliente}`} className="border-b border-[var(--border)]">
                      <td className="px-3 py-2">{client.cliente || '—'}</td>
                      <td className="px-3 py-2">{client.zona}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{client.agente || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(client.total)}</td>
                      <td className="px-3 py-2 text-right font-mono text-[var(--danger)]">{formatCurrency(client.vencida)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(client.noVencida)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
