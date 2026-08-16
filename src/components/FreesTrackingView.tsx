'use client';

import { useMemo, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import { normalizeText } from '@/lib/business-classification';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, FileSpreadsheet } from 'lucide-react';

interface FreeLine {
  monthIndex: number;
  monthLabel: string;
  fyStart: number;
  zona: string;
  free: number;
  neta: number;
  bruto: number;
}

interface FreeTotals {
  neta: number;
  free: number;
  bruto: number;
  freeCost: number;
  pct: number | null;
}

type ZonaSortKey = 'zona' | 'neta' | 'freeCost' | 'bruto' | 'pct' | 'pctLy' | 'delta';

const FISCAL_MONTHS = [
  { index: 1, label: '1 · Abril', names: ['abril', 'april', 'apr', 'abr'] },
  { index: 2, label: '2 · Mayo', names: ['mayo', 'may'] },
  { index: 3, label: '3 · Junio', names: ['junio', 'june', 'jun'] },
  { index: 4, label: '4 · Julio', names: ['julio', 'july', 'jul'] },
  { index: 5, label: '5 · Agosto', names: ['agosto', 'august', 'ago', 'aug'] },
  { index: 6, label: '6 · Septiembre', names: ['septiembre', 'setiembre', 'september', 'sept', 'sep', 'set'] },
  { index: 7, label: '7 · Octubre', names: ['octubre', 'october', 'oct'] },
  { index: 8, label: '8 · Noviembre', names: ['noviembre', 'november', 'nov'] },
  { index: 9, label: '9 · Diciembre', names: ['diciembre', 'december', 'dic', 'dec'] },
  { index: 10, label: '10 · Enero', names: ['enero', 'january', 'ene', 'jan'] },
  { index: 11, label: '11 · Febrero', names: ['febrero', 'february', 'feb'] },
  { index: 12, label: '12 · Marzo', names: ['marzo', 'march', 'mar'] },
] as const;

const ZONA_ORDER = ['Norte', 'Centro-Sur', 'Levante', 'Portugal', 'Francia', 'Italia Norte', 'Italia Centro-Sur', 'Sin zona'];

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

function fiscalMonthByIndex(index: number): { index: number; label: string } | null {
  const found = FISCAL_MONTHS.find((month) => month.index === index);
  return found ? { index: found.index, label: found.label } : null;
}

function parseFiscalMonth(value: unknown): { index: number; label: string } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return fiscalMonthByIndex(((value.getMonth() + 9) % 12) + 1);
  }
  if (!cellPresent(value)) return null;
  const normalized = normalizeText(value).replace(/[._'`’]/g, ' ').replace(/\s+/g, ' ').trim();
  const aliases = FISCAL_MONTHS
    .flatMap((month) => month.names.map((name) => ({ name, month })))
    .sort((a, b) => b.name.length - a.name.length);
  const named = aliases.find(({ name }) => (
    name.length <= 3
      ? new RegExp(`(?:^| )${name}(?: |$)`).test(normalized)
      : normalized.includes(name)
  ));
  if (named) return { index: named.month.index, label: named.month.label };
  return null;
}

function parseCalendarYear(value: unknown): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getFullYear();
  const text = String(value ?? '');
  const apostrophe = text.match(/'(\d{2})\b/);
  if (apostrophe) return 2000 + Number(apostrophe[1]);
  const full = text.match(/\b(20\d{2}|19\d{2})\b/);
  if (full) return Number(full[1]);
  return null;
}

function fyStartFrom(calendarYear: number, monthIndex: number): number {
  return monthIndex >= 10 ? calendarYear - 1 : calendarYear;
}

function fyLabel(start: number): string {
  return `${String(start).slice(-2)}/${String(start + 1).slice(-2)}`;
}

function emptyTotals(): FreeTotals {
  return { neta: 0, free: 0, bruto: 0, freeCost: 0, pct: null };
}

function addLineToTotals(block: FreeTotals, line: FreeLine): void {
  block.neta += line.neta;
  block.free += line.free;
  block.bruto += line.bruto;
  block.freeCost += -line.free;
}

function finalizeTotals(block: FreeTotals): FreeTotals {
  return {
    ...block,
    pct: block.bruto === 0 ? null : (block.freeCost / block.bruto) * 100,
  };
}

function sumLines(lines: FreeLine[]): FreeTotals {
  const block = emptyTotals();
  lines.forEach((line) => addLineToTotals(block, line));
  return finalizeTotals(block);
}

function formatCurrency(value: number): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
}

function formatAbsPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function formatPp(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const formatted = Math.abs(value).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (value > 0) return `+${formatted} pp`;
  if (value < 0) return `−${formatted} pp`;
  return `${formatted} pp`;
}

function freeTone(delta: number | null): string {
  if (delta === null) return 'text-[var(--text-muted)]';
  if (delta > 0.05) return 'text-[var(--danger)]';
  if (delta < -0.05) return 'text-[var(--success)]';
  return 'text-[var(--text-secondary)]';
}

function parseFreesData(rows: unknown[][]): FreeLine[] {
  if (!rows.length) return [];
  const headerIndex = rows.findIndex((row) => row.some((cell) => {
    const header = normalizeText(cell);
    return header.includes('year-month') || header.includes('free') || header.includes('fact');
  }));
  if (headerIndex < 0) throw new Error('No reconozco el archivo de frees. ¿Trae Year-Month, Free Product y Fact. Neta?');

  const headers = (rows[headerIndex] || []).map((cell) => normalizeText(cell).replace(/^\*+\s*/, ''));
  const find = (test: (header: string) => boolean) => headers.findIndex(test);
  const colMap = {
    month: find((header) => header.includes('year-month') || header.includes('month') || header === 'mes'),
    zona: find((header) => header === 'zona'),
    free: find((header) => header.includes('free')),
    neta: find((header) => header.includes('neta') || (header.includes('fact') && !header.includes('free') && !header.includes('%'))),
    bruto: find((header) => header.includes('fact') && header.includes('free') && !header.includes('%')),
  };

  if (colMap.month < 0 || colMap.free < 0 || colMap.neta < 0) {
    throw new Error('Faltan columnas: Year-Month, Free Product o Fact. Neta Grassroots.');
  }

  return rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cellPresent(cell)))
    .map((row) => {
      const monthValue = row[colMap.month];
      const month = parseFiscalMonth(monthValue);
      const calendarYear = parseCalendarYear(monthValue);
      const free = parseAmount(row[colMap.free]);
      const neta = parseAmount(row[colMap.neta]);
      const brutoProvided = colMap.bruto >= 0 ? parseAmount(row[colMap.bruto]) : 0;
      const bruto = colMap.bruto >= 0 && brutoProvided !== 0 ? brutoProvided : neta - free;
      if (!month || calendarYear === null) return null;
      return {
        monthIndex: month.index,
        monthLabel: month.label,
        fyStart: fyStartFrom(calendarYear, month.index),
        zona: colMap.zona >= 0 && cellPresent(row[colMap.zona]) ? String(row[colMap.zona]).trim() : 'Sin zona',
        free,
        neta,
        bruto,
      };
    })
    .filter((line): line is FreeLine => line !== null && (line.neta !== 0 || line.free !== 0 || line.bruto !== 0));
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

export default function FreesTrackingView() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<FreeLine[]>([]);
  const [sort, setSort] = useState<{ key: ZonaSortKey; direction: 'asc' | 'desc' }>({ key: 'pct', direction: 'desc' });

  const handleFileLoaded = (data: unknown[][], name: string) => {
    try {
      const parsed = parseFreesData(data);
      if (parsed.length === 0) throw new Error('El archivo no tiene filas con facturación o frees.');
      setLines(parsed);
      setFileName(name);
      setError(null);
    } catch (err) {
      setLines([]);
      setFileName(null);
      setError(err instanceof Error ? err.message : 'No he podido leer el archivo.');
    }
  };

  const analysis = useMemo(() => {
    if (lines.length === 0) return null;
    const fyStarts = Array.from(new Set(lines.map((line) => line.fyStart))).sort((a, b) => a - b);
    const currentFy = fyStarts[fyStarts.length - 1];
    const lastFy = fyStarts.find((year) => year === currentFy - 1) ?? fyStarts[fyStarts.length - 2] ?? null;
    const tyLines = lines.filter((line) => line.fyStart === currentFy);
    const lyLines = lastFy === null ? [] : lines.filter((line) => line.fyStart === lastFy);
    const ytdMonth = Math.max(...tyLines.map((line) => line.monthIndex));
    const tyYtd = sumLines(tyLines.filter((line) => line.monthIndex <= ytdMonth));
    const lyYtd = sumLines(lyLines.filter((line) => line.monthIndex <= ytdMonth));
    const lyFull = sumLines(lyLines);
    const lyRest = sumLines(lyLines.filter((line) => line.monthIndex > ytdMonth));
    const paceFact = lyFull.bruto === 0 ? null : (lyYtd.bruto / lyFull.bruto) * 100;
    const paceFree = lyFull.freeCost === 0 ? null : (lyYtd.freeCost / lyFull.freeCost) * 100;
    const projectedBruto = paceFact && paceFact !== 0 ? tyYtd.bruto / (paceFact / 100) : tyYtd.bruto + lyRest.bruto;
    const remainingBruto = Math.max(0, projectedBruto - tyYtd.bruto);
    const endIfLyPct = lyFull.pct === null ? null : projectedBruto * (lyFull.pct / 100);
    const remainingIfLy = endIfLyPct === null ? null : endIfLyPct - tyYtd.freeCost;
    const endIfCurrentPct = tyYtd.pct === null ? null : projectedBruto * (tyYtd.pct / 100);
    const remainingIfCurrent = endIfCurrentPct === null ? null : endIfCurrentPct - tyYtd.freeCost;
    const monthly = FISCAL_MONTHS.map((month) => ({
      ...month,
      ty: sumLines(tyLines.filter((line) => line.monthIndex === month.index)),
      ly: sumLines(lyLines.filter((line) => line.monthIndex === month.index)),
    }));
    const zonas = Array.from(new Set(lines.map((line) => line.zona)));
    return {
      currentFy,
      lastFy,
      ytdMonth,
      ytdLabel: FISCAL_MONTHS.find((month) => month.index === ytdMonth)?.label ?? String(ytdMonth),
      tyYtd,
      lyYtd,
      lyFull,
      lyRest,
      paceFact,
      paceFree,
      projectedBruto,
      remainingBruto,
      remainingIfLy,
      remainingIfCurrent,
      endIfLyPct,
      endIfCurrentPct,
      monthly,
      zonas,
    };
  }, [lines]);

  const zonaRows = useMemo(() => {
    if (!analysis) return [];
    return analysis.zonas.map((zona) => {
      const ty = sumLines(lines.filter((line) => line.fyStart === analysis.currentFy && line.zona === zona && line.monthIndex <= analysis.ytdMonth));
      const ly = analysis.lastFy === null
        ? emptyTotals()
        : sumLines(lines.filter((line) => line.fyStart === analysis.lastFy && line.zona === zona && line.monthIndex <= analysis.ytdMonth));
      return {
        zona,
        ty,
        ly,
        delta: ty.pct !== null && ly.pct !== null ? ty.pct - ly.pct : null,
      };
    }).sort((a, b) => {
      const orderA = ZONA_ORDER.indexOf(a.zona);
      const orderB = ZONA_ORDER.indexOf(b.zona);
      if (sort.key === 'zona') {
        const base = (orderA < 0 ? 99 : orderA) - (orderB < 0 ? 99 : orderB) || a.zona.localeCompare(b.zona, 'es');
        return sort.direction === 'asc' ? base : -base;
      }
      const left = sort.key === 'neta' ? a.ty.neta
        : sort.key === 'freeCost' ? a.ty.freeCost
          : sort.key === 'bruto' ? a.ty.bruto
            : sort.key === 'pct' ? a.ty.pct
              : sort.key === 'pctLy' ? a.ly.pct
                : a.delta;
      const right = sort.key === 'neta' ? b.ty.neta
        : sort.key === 'freeCost' ? b.ty.freeCost
          : sort.key === 'bruto' ? b.ty.bruto
            : sort.key === 'pct' ? b.ty.pct
              : sort.key === 'pctLy' ? b.ly.pct
                : b.delta;
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      const result = Number(left) - Number(right);
      return sort.direction === 'asc' ? result : -result;
    });
  }, [analysis, lines, sort]);

  const updateSort = (key: ZonaSortKey) => {
    setSort((prev) => (
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'zona' ? 'asc' : 'desc' }
    ));
  };

  const downloadZonas = () => {
    if (!analysis) return;
    const header = ['Zona', 'Fact. neta TY', 'Frees TY', 'Bruto TY', '% free TY', '% free LY YTD', 'Δ pp'];
    const csv = [header, ...zonaRows.map((row) => [
      row.zona,
      row.ty.neta,
      row.ty.freeCost,
      row.ty.bruto,
      row.ty.pct,
      row.ly.pct,
      row.delta,
    ])].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'frees_grassroots_zonas.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const maxPct = analysis
    ? Math.max(20, ...analysis.monthly.flatMap((month) => [month.ty.pct ?? 0, month.ly.pct ?? 0]))
    : 20;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
        <FileUpload
          inputId="tracking-frees-input"
          label="CSV de frees Grassroots (Year-Month, Zona, Free Product, Fact. Neta)"
          onFileLoaded={handleFileLoaded}
        />
        {fileName && analysis && (
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            Cargado: {fileName} · FY {fyLabel(analysis.currentFy)} hasta {analysis.ytdLabel}
            {analysis.lastFy !== null ? ` · comparado con FY ${fyLabel(analysis.lastFy)}` : ''}
          </p>
        )}
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div>
      )}

      {lines.length === 0 && !error && (
        <section className="rounded-lg border border-dashed border-[var(--border)] bg-white/60 p-8 text-center">
          <FileSpreadsheet className="mx-auto h-9 w-9 text-[var(--text-muted)]" />
          <p className="mt-3 text-sm font-medium">Sube data2.csv. El % free es frees / (facturación neta + frees).</p>
        </section>
      )}

      {analysis && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="% free hoy"
              value={formatAbsPercent(analysis.tyYtd.pct)}
              hint={`${formatCurrency(analysis.tyYtd.freeCost)} de ${formatCurrency(analysis.tyYtd.bruto)}`}
              tone={freeTone(analysis.tyYtd.pct !== null && analysis.lyYtd.pct !== null ? analysis.tyYtd.pct - analysis.lyYtd.pct : null)}
            />
            <StatCard
              label="% free LY mismo tramo"
              value={formatAbsPercent(analysis.lyYtd.pct)}
              hint={`Abr–${analysis.ytdLabel.split(' · ')[1] || analysis.ytdLabel} FY ${analysis.lastFy ? fyLabel(analysis.lastFy) : '—'}`}
            />
            <StatCard
              label="Vs LY YTD"
              value={formatPp(analysis.tyYtd.pct !== null && analysis.lyYtd.pct !== null ? analysis.tyYtd.pct - analysis.lyYtd.pct : null)}
              hint="Más pp = más frees que el año pasado"
              tone={freeTone(analysis.tyYtd.pct !== null && analysis.lyYtd.pct !== null ? analysis.tyYtd.pct - analysis.lyYtd.pct : null)}
            />
            <StatCard
              label="% free LY cierre"
              value={formatAbsPercent(analysis.lyFull.pct)}
              hint={`Año fiscal ${analysis.lastFy ? fyLabel(analysis.lastFy) : '—'} completo`}
            />
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Cómo íbamos el año pasado</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                A estas alturas del FY {analysis.lastFy ? fyLabel(analysis.lastFy) : 'pasado'} ya llevaban
                {' '}
                <span className="font-semibold text-[var(--text-primary)]">{formatAbsPercent(analysis.paceFact)}</span>
                {' '}de la facturación del año y
                {' '}
                <span className="font-semibold text-[var(--text-primary)]">{formatAbsPercent(analysis.paceFree)}</span>
                {' '}de los frees del año.
              </p>
              <div className="mt-4 space-y-3">
                <div>
                  <div className="mb-1 flex justify-between text-xs text-[var(--text-secondary)]">
                    <span>Facturación LY YTD / año</span>
                    <span className="tabular-nums">{formatAbsPercent(analysis.paceFact)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-soft)]">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, analysis.paceFact ?? 0)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs text-[var(--text-secondary)]">
                    <span>Frees LY YTD / año</span>
                    <span className="tabular-nums">{formatAbsPercent(analysis.paceFree)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-soft)]">
                    <div className="h-full rounded-full bg-[var(--danger)]" style={{ width: `${Math.min(100, analysis.paceFree ?? 0)}%` }} />
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Hoy: {formatCurrency(analysis.tyYtd.neta)} neta · LY mismo tramo: {formatCurrency(analysis.lyYtd.neta)} neta.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Negativos que quedan</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Proyección a cierre usando el ritmo de facturación del año pasado. Frees ya gastados: {formatCurrency(analysis.tyYtd.freeCost)}.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-[var(--bg-soft)] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Si cerramos como LY</p>
                  <p className={`mt-1 text-lg font-semibold tabular-nums ${freeTone(analysis.remainingIfLy)}`}>
                    {analysis.remainingIfLy === null ? '—' : formatCurrency(Math.max(0, analysis.remainingIfLy))}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Cierre {formatAbsPercent(analysis.lyFull.pct)} · {formatCurrency(analysis.endIfLyPct ?? 0)} en el año
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--bg-soft)] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Si seguimos así</p>
                  <p className={`mt-1 text-lg font-semibold tabular-nums ${freeTone(analysis.remainingIfCurrent)}`}>
                    {analysis.remainingIfCurrent === null ? '—' : formatCurrency(Math.max(0, analysis.remainingIfCurrent))}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Cierre {formatAbsPercent(analysis.tyYtd.pct)} · {formatCurrency(analysis.endIfCurrentPct ?? 0)} en el año
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                El año pasado, de {analysis.ytdLabel} a marzo, se fueron {formatCurrency(analysis.lyRest.freeCost)} de frees.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">% free mes a mes</p>
            <div className="mt-4 grid grid-cols-12 gap-2">
              {analysis.monthly.map((month) => (
                <div key={month.index} className="flex flex-col items-center gap-1">
                  <div className="flex h-28 w-full items-end justify-center gap-0.5">
                    <div
                      className="w-1/2 rounded-t bg-[var(--border-strong)]"
                      style={{ height: `${Math.max(month.ly.pct ? (month.ly.pct / maxPct) * 100 : 0, month.ly.pct ? 4 : 0)}%` }}
                      title={`LY ${month.label}: ${formatAbsPercent(month.ly.pct)}`}
                    />
                    <div
                      className={`w-1/2 rounded-t ${month.index <= analysis.ytdMonth ? 'bg-[var(--danger)]' : 'bg-transparent'}`}
                      style={{ height: `${Math.max(month.ty.pct ? (month.ty.pct / maxPct) * 100 : 0, month.ty.pct ? 4 : 0)}%` }}
                      title={`TY ${month.label}: ${formatAbsPercent(month.ty.pct)}`}
                    />
                  </div>
                  <p className="text-[10px] font-medium text-[var(--text-muted)]">{month.index}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">Gris = año pasado. Rojo = este año. 1 = abril.</p>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Zonas · mismo tramo vs LY</p>
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
              <table className="w-full min-w-[820px] border-collapse text-sm">
                <thead className="bg-[var(--bg-soft)] text-xs text-[var(--text-secondary)]">
                  <tr>
                    {([
                      ['zona', 'Zona', 'left'],
                      ['neta', 'Fact. neta', 'right'],
                      ['freeCost', 'Frees', 'right'],
                      ['bruto', 'Bruto', 'right'],
                      ['pct', '% free', 'right'],
                      ['pctLy', '% LY YTD', 'right'],
                      ['delta', 'Δ pp', 'right'],
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
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.ty.neta)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.ty.freeCost)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.ty.bruto)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${freeTone(row.delta)}`}>{formatAbsPercent(row.ty.pct)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatAbsPercent(row.ly.pct)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${freeTone(row.delta)}`}>{formatPp(row.delta)}</td>
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
